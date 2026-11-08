import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { asNumber, asString, jsonError, readBody, requireApiSession } from "@/server/api";
import { listProducts } from "@/server/product-store";
import { saveOrder, transitionOrder } from "@/server/order-store";
import { createCheckoutSession, paymongoEnabled, PayMongoError } from "@/server/paymongo";
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
  const auth = await requireApiSession();
  if (auth.response) return auth.response;

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

  const products = await listProducts();
  const items: OrderItem[] = [];
  for (const [productId, quantity] of quantities) {
    const product = products.find((entry) => entry.id === productId);
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
  const totals = computeTotals(items.map((item) => ({ price: item.unitPrice, quantity: item.quantity })));
  const reference = newReference();
  const now = new Date().toISOString();
  const provider = paymongoEnabled() ? "paymongo" : "demo";

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
    payment: { provider, method, providerStatus: "pending" },
    events: [
      {
        at: now,
        type: "order.created",
        message: `Order created for ${items.length} line item(s).`,
      },
    ],
  };
  await saveOrder(order);

  if (provider === "demo") {
    await transitionOrder(reference, {
      status: "pending",
      type: "demo.session_created",
      message: "Demo gateway session created (PayMongo is not configured).",
      payment: { providerStatus: "demo_active", checkoutUrl: `/payment/mock/${reference}` },
    });
    return NextResponse.json({
      reference,
      checkoutUrl: `/payment/mock/${reference}`,
      mode: "demo",
      total: order.total,
    });
  }

  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || new URL(request.url).origin;
  const methodLabel = PAYMENT_METHODS.find((entry) => entry.id === method)?.label ?? "payment";

  try {
    const session = await createCheckoutSession({
      reference,
      description: `KainTayo order ${reference}`,
      lines: items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        amountCentavos: item.unitPrice * 100,
        description: `₱${item.unitPrice} each`,
      })),
      method,
      successUrl: `${origin}/payment/success?ref=${encodeURIComponent(reference)}`,
      cancelUrl: `${origin}/payment/cancel?ref=${encodeURIComponent(reference)}`,
      customer: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
      },
      metadata: { reference },
    });

    await transitionOrder(reference, {
      status: "pending",
      type: "paymongo.session_created",
      message: `${methodLabel} checkout session ${session.id} created.`,
      payment: {
        sessionId: session.id,
        checkoutUrl: session.checkoutUrl,
        paymentIntentId: session.paymentIntentId,
        providerStatus: session.status,
      },
    });

    return NextResponse.json({
      reference,
      checkoutUrl: session.checkoutUrl,
      mode: "paymongo",
      total: order.total,
    });
  } catch (error) {
    const message =
      error instanceof PayMongoError
        ? error.message
        : "The payment gateway did not respond as expected.";
    console.error(`[paymongo] Could not create checkout session for ${reference}:`, message);

    await transitionOrder(reference, {
      status: "failed",
      type: "paymongo.session_failed",
      message: `Checkout session could not be created: ${message}`,
      failureReason: message,
    });

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
