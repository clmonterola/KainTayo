import { NextResponse } from "next/server";
import { asString, guard } from "@/server/api";
import { getOrder, transitionOrder } from "@/server/order-store";
import { verifyCallbackToken } from "@/server/xendit";

export const dynamic = "force-dynamic";

/**
 * Xendit invoice callbacks.
 *
 * Signature: the `x-callback-token` header must match `XENDIT_CALLBACK_TOKEN`.
 * Only this server-side endpoint may flip an order to `paid` — the browser
 * never reports a successful payment.
 *
 * Retries are safe: the order row is located by `external_id` (our order
 * reference), a single `payments` row is updated rather than inserted, and
 * `transitionOrder` refuses to move a terminal state backwards. A duplicate
 * delivery therefore changes nothing and still returns 200.
 */
type XenditPayload = {
  event?: string;
  id?: string;
  external_id?: string;
  status?: string;
  paid_amount?: number | string;
  payment_method?: string;
  payment_channel?: string;
  payment_id?: string;
  paid_at?: string;
  data?: Record<string, unknown>;
};

export async function POST(request: Request) {
  const rawBody = await request.text();

  const token = verifyCallbackToken(request.headers.get("x-callback-token"));
  if (!token.valid) {
    return NextResponse.json(
      { error: "Invalid webhook token.", reason: token.reason },
      { status: 401 },
    );
  }
  if (token.reason) {
    console.warn(`[xendit] Webhook accepted with warning: ${token.reason}`);
  }

  let payload: XenditPayload;
  try {
    payload = JSON.parse(rawBody) as XenditPayload;
  } catch {
    return NextResponse.json({ error: "Malformed JSON payload." }, { status: 400 });
  }

  // Invoice callbacks arrive flat; the newer unified webhook wraps them in `data`.
  const invoice =
    payload.data && typeof payload.data === "object"
      ? (payload.data as XenditPayload)
      : payload;

  const status = asString(invoice.status).toUpperCase();
  const invoiceId = asString(invoice.id);
  const externalId = asString(invoice.external_id);

  // A database problem must surface as 503/500 JSON so Xendit retries later
  // instead of the request crashing.
  const found = await guard(async () => {
    if (externalId) {
      const byReference = await getOrder(externalId);
      if (byReference) return byReference;
    }
    // Fallback: scan the payload for one of our own reference numbers.
    const match = rawBody.match(/KT-\d{6}-[A-Z0-9]{4}/);
    return match ? await getOrder(match[0]) : undefined;
  });
  if (found.response) return found.response;

  const order = found.data;
  if (!order) {
    console.warn(
      `[xendit] Webhook ${status || payload.event || "unknown"} did not match a local order.`,
    );
    return NextResponse.json({ received: true, ignored: "unknown_order" });
  }

  const paymentId = asString(invoice.payment_id) || undefined;
  const providerStatus = status || "UNKNOWN";

  let transition;
  if (status === "PAID") {
    transition = {
      status: "paid" as const,
      type: "webhook.invoice.paid",
      message: "Payment confirmed by the payment provider webhook.",
      payment: {
        providerStatus,
        paidAt: asString(invoice.paid_at) || new Date().toISOString(),
        ...(paymentId ? { paymentId } : {}),
        ...(invoiceId ? { sessionId: invoiceId } : {}),
      },
    };
  } else if (status === "EXPIRED") {
    transition = {
      status: "cancelled" as const,
      type: "webhook.invoice.expired",
      message: "Payment provider reports the checkout session expired.",
      payment: { providerStatus },
      failureReason: "Checkout session expired.",
    };
  } else if (status === "PENDING") {
    // Informational only — never changes the order status.
    return NextResponse.json({ received: true, ignored: "pending" });
  } else {
    return NextResponse.json({
      received: true,
      ignored: asString(payload.event) || status || "unknown_event",
    });
  }

  const applied = await guard(() => transitionOrder(order.reference, transition));
  if (applied.response) return applied.response;

  return NextResponse.json({
    received: true,
    reference: applied.data?.reference ?? order.reference,
  });
}
