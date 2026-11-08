import crypto from "node:crypto";
import { NextResponse } from "next/server";
import {
  asNumber,
  asString,
  guard,
  jsonError,
  readBody,
  requireActor,
} from "@/server/api";
import { listProducts } from "@/server/product-store";
import { saveOrder, transitionOrder } from "@/server/order-store";
import { createInvoice, xenditEnabled, XenditError } from "@/server/xendit";
import { computeTotals } from "@/lib/pricing";
import { hasErrors, trimAll, validateCustomer } from "@/lib/validation";
import {
  PAYMENT_METHODS,
  type Customer,
  type Order,
  type OrderItem,
  type PaymentMethod,
} from "@/lib/types";

export const dynamic = "force-dynamic";

function newReference() {
  const now = new Date();
  const date = [
    String(now.getFullYear()).slice(2),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  return `KT-${date}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
}

export async function POST(request: Request) {
  const actor = await requireActor();
  if (actor.response) return actor.response;

  const body = await readBody(request);
  if (!body) return jsonError("Invalid request body.");

  const method = asString(body.method) as PaymentMethod;
  if (!PAYMENT_METHODS.some((entry) => entry.id === method)) {
    return jsonError("Choose a valid payment method.", 422, {
      method: "Choose GCash, Maya, or card.",
    });
  }

  const rawCustomer = (body.customer ?? {}) as Record<string, unknown>;
  const customer: Customer = trimAll({
    name: asString(rawCustomer.name),
    email: asString(rawCustomer.email),
    phone: asString(rawCustomer.phone),
    address: asString(rawCustomer.address),
    barangay: asString(rawCustomer.barangay),
    city: asString(rawCustomer.city),
    postalCode: asString(rawCustomer.postalCode),
    notes: asString(rawCustomer.notes),
  });

  const fields = validateCustomer(customer);
  if (hasErrors(fields)) {
    return jsonError("Please check your delivery details.", 422, fields);
  }

  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (rawItems.length === 0) {
    return jsonError("Your cart is empty.", 422);
  }
  if (rawItems.length > 30) {
    return jsonError("That is too many different dishes for one order.", 422);
  }

  const quantities = new Map<string, number>();
  for (const raw of rawItems) {
    const item = (raw ?? {}) as Record<string, unknown>;
    const productId = asString(item.productId);
    const quantity = Math.trunc(asNumber(item.quantity));
    if (!productId || !Number.isFinite(quantity) || quantity < 1 || quantity > 20) {
      return jsonError("Some cart quantities are invalid.", 422);
    }
    quantities.set(productId, Math.min(20, (quantities.get(productId) ?? 0) + quantity));
  }

  const loaded = await guard(() => listProducts());
  if (loaded.response) return loaded.response;

  const items: OrderItem[] = [];
  for (const [productId, quantity] of quantities) {
    const product = loaded.data.find((entry) => entry.id === productId);
    if (!product) {
      return jsonError("A dish in your cart is no longer on the menu.", 409);
    }
    if (!product.available) {
      return jsonError(`"${product.name}" is sold out right now.`, 409);
    }
    items.push({
      productId: product.id,
      name: product.name,
      image: product.image,
      unitPrice: product.price,
      quantity,
      lineTotal: product.price * quantity,
    });
  }

  // Server-side pricing is the source of truth, never the client's totals.
  const totals = computeTotals(
    items.map((item) => ({ price: item.unitPrice, quantity: item.quantity })),
  );
  const reference = newReference();
  const now = new Date().toISOString();
  const provider = xenditEnabled() ? "xendit" : "demo";
  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || new URL(request.url).origin;
  const mockUrl = `/payment/mock/${reference}`;

  const order: Order = {
    reference,
    createdAt: now,
    updatedAt: now,
    customer,
    items,
    subtotal: totals.subtotal,
    deliveryFee: totals.deliveryFee,
    total: totals.total,
    status: "pending",
    payment:
      provider === "demo"
        ? {
            provider,
            method,
            providerStatus: "demo_active",
            checkoutUrl: mockUrl,
          }
        : { provider, method, providerStatus: "pending" },
    events: [
      {
        at: now,
        type: "order.created",
        message: `Order created for ${items.length} line item(s).`,
      },
      ...(provider === "demo"
        ? [
            {
              at: now,
              type: "demo.session_created",
              message: "Secure checkout session created.",
            },
          ]
        : []),
    ],
  };

  const saved = await guard(() =>
    saveOrder(order, { userId: actor.actor.id }),
  );
  if (saved.response) return saved.response;

  if (provider === "demo") {
    return NextResponse.json({
      reference,
      checkoutUrl: mockUrl,
      mode: "demo",
      total: order.total,
    });
  }

  const methodLabel =
    PAYMENT_METHODS.find((entry) => entry.id === method)?.label ?? "payment";

  try {
    const invoice = await createInvoice({
      reference,
      description: `KainTayo order ${reference} — ${items
        .map((item) => `${item.quantity}× ${item.name}`)
        .join(", ")
        .slice(0, 300)}`,
      amount: order.total,
      payerEmail: customer.email,
      successUrl: `${origin}/payment/success?ref=${encodeURIComponent(reference)}`,
      cancelUrl: `${origin}/payment/cancel?ref=${encodeURIComponent(reference)}`,
    });

    const transitioned = await guard(() =>
      transitionOrder(reference, {
        status: "pending",
        type: "xendit.invoice_created",
        message: `${methodLabel} invoice ${invoice.id} created.`,
        payment: {
          sessionId: invoice.id,
          checkoutUrl: invoice.invoiceUrl,
          providerStatus: invoice.status,
        },
      }),
    );
    if (transitioned.response) return transitioned.response;

    return NextResponse.json({
      reference,
      checkoutUrl: invoice.invoiceUrl,
      mode: "xendit",
      total: order.total,
    });
  } catch (error) {
    const message =
      error instanceof XenditError
        ? error.message
        : "The payment gateway did not respond as expected.";
    console.error(`[xendit] Could not create invoice for ${reference}:`, message);

    await guard(() =>
      transitionOrder(reference, {
        status: "failed",
        type: "xendit.invoice_failed",
        message: `Checkout session could not be created: ${message}`,
        failureReason: message,
      }),
    );

    return NextResponse.json(
      {
        error:
          "We couldn't reach the payment gateway. Your order was saved as failed — please try again in a moment.",
        reference,
      },
      { status: 502 },
    );
  }
}
