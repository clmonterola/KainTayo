import { NextResponse } from "next/server";
import { asString, readBody } from "@/server/api";
import { listOrders, transitionOrder } from "@/server/order-store";
import { verifyWebhookSignature } from "@/server/paymongo";
import type { Order } from "@/lib/types";

export const dynamic = "force-dynamic";

type WebhookResource = {
  id?: string;
  type?: string;
  attributes?: Record<string, unknown>;
};

type WebhookPayload = {
  data?: {
    id?: string;
    attributes?: {
      type?: string;
      livemode?: boolean;
      data?: WebhookResource;
    };
  };
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = verifyWebhookSignature(
    rawBody,
    request.headers.get("paymongo-signature"),
  );

  if (!signature.valid) {
    return NextResponse.json(
      { error: "Invalid webhook signature.", reason: signature.reason },
      { status: 401 },
    );
  }
  if (signature.reason) {
    console.warn(`[paymongo] Webhook accepted with warning: ${signature.reason}`);
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return NextResponse.json({ error: "Malformed JSON payload." }, { status: 400 });
  }

  const eventType = payload.data?.attributes?.type ?? "";
  const resource = payload.data?.attributes?.data;
  const attributes = resource?.attributes ?? {};
  const metadata = (attributes.metadata ?? {}) as Record<string, unknown>;

  const orders = await listOrders();

  const referenceCandidate =
    asString(attributes.reference_number) || asString(metadata.reference);

  let order: Order | undefined = referenceCandidate
    ? orders.find((entry) => entry.reference === referenceCandidate)
    : undefined;

  if (!order && resource?.type === "checkout_session" && resource.id) {
    order = orders.find((entry) => entry.payment.sessionId === resource.id);
  }

  if (!order) {
    // PayMongo payment resources don't always carry the session reference, so
    // fall back to scanning the payload for one of our own reference numbers.
    const match = rawBody.match(/KT-\d{6}-[A-Z0-9]{4}/);
    if (match) {
      order = orders.find((entry) => entry.reference === match[0]);
    }
  }

  if (!order) {
    console.warn(`[paymongo] Webhook ${eventType} did not match a local order.`);
    return NextResponse.json({ received: true, ignored: "unknown_order" });
  }

  const payments = Array.isArray(attributes.payments)
    ? (attributes.payments as Array<{ id?: string; attributes?: { status?: string } }>)
    : [];
  const paidPayment = payments.find(
    (payment) => payment.attributes?.status === "paid",
  );
  const paymentId =
    resource?.type === "payment" ? resource.id : paidPayment?.id;

  if (eventType === "checkout_session.payment.paid" || eventType === "payment.paid") {
    await transitionOrder(order.reference, {
      status: "paid",
      type: `webhook.${eventType}`,
      message: "PayMongo webhook confirms the payment.",
      payment: {
        providerStatus: "paid",
        paymentId,
        paidAt: new Date().toISOString(),
        ...(order.payment.sessionId ? { sessionId: order.payment.sessionId } : {}),
      },
    });
  } else if (eventType === "payment.failed") {
    await transitionOrder(order.reference, {
      status: "failed",
      type: `webhook.${eventType}`,
      message: "PayMongo webhook reports a failed payment.",
      payment: { providerStatus: "failed" },
      failureReason:
        asString(attributes.failure_reason) || "The payment was declined.",
    });
  } else if (eventType === "checkout_session.expired") {
    await transitionOrder(order.reference, {
      status: "cancelled",
      type: `webhook.${eventType}`,
      message: "PayMongo webhook reports the checkout session expired.",
      payment: { providerStatus: "expired" },
      failureReason: "Checkout session expired.",
    });
  } else {
    return NextResponse.json({ received: true, ignored: eventType || "unknown_event" });
  }

  return NextResponse.json({ received: true, reference: order.reference });
}
