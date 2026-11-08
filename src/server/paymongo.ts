import "server-only";
import crypto from "node:crypto";
import type { PaymentMethod } from "@/lib/types";

const BASE_URL = "https://api.paymongo.com/v1";

export class PayMongoError extends Error {
  status: number;
  detail: unknown;
  constructor(message: string, status = 502, detail?: unknown) {
    super(message);
    this.name = "PayMongoError";
    this.status = status;
    this.detail = detail;
  }
}

export function paymongoEnabled() {
  return Boolean(process.env.PAYMONGO_SECRET_KEY?.trim());
}

function secretKey() {
  const key = process.env.PAYMONGO_SECRET_KEY?.trim();
  if (!key) throw new PayMongoError("PayMongo is not configured.", 503);
  if (key.startsWith("sk_live_") && process.env.PAYMONGO_MODE !== "live") {
    throw new PayMongoError(
      "A live PayMongo key was provided while PAYMONGO_MODE is not set to \"live\".",
      500,
    );
  }
  return key;
}

function authHeader() {
  return `Basic ${Buffer.from(`${secretKey()}:`).toString("base64")}`;
}

type CheckoutLine = { name: string; quantity: number; amountCentavos: number; description?: string };

export type PayMongoSession = {
  id: string;
  status: string;
  checkoutUrl: string;
  paymentIntentId?: string;
  payments: Array<{ id: string; status: string; amount: number }>;
};

type PayMongoResponse = {
  data?: {
    id?: string;
    attributes?: {
      status?: string;
      checkout_url?: string;
      payment_intent?: { id?: string } | string;
      payments?: Array<{
        id?: string;
        attributes?: { status?: string; amount?: number };
      }>;
      metadata?: Record<string, string>;
      reference_number?: string;
    };
  };
  errors?: Array<{ detail?: string; code?: string }>;
};

function parseSession(payload: PayMongoResponse): PayMongoSession {
  const attributes = payload.data?.attributes;
  const id = payload.data?.id;
  if (!id || !attributes) {
    throw new PayMongoError("Unexpected response from PayMongo.", 502, payload.errors);
  }
  const paymentIntent =
    typeof attributes.payment_intent === "string"
      ? attributes.payment_intent
      : attributes.payment_intent?.id;
  return {
    id,
    status: attributes.status ?? "active",
    checkoutUrl: attributes.checkout_url ?? "",
    paymentIntentId: paymentIntent,
    payments: (attributes.payments ?? []).map((payment) => ({
      id: payment.id ?? "",
      status: payment.attributes?.status ?? "unknown",
      amount: payment.attributes?.amount ?? 0,
    })),
  };
}

export async function createCheckoutSession(params: {
  reference: string;
  description: string;
  lines: CheckoutLine[];
  method: PaymentMethod;
  successUrl: string;
  cancelUrl: string;
  customer: { name: string; email: string; phone: string };
  metadata?: Record<string, string>;
}): Promise<PayMongoSession> {
  const body = {
    data: {
      attributes: {
        billing: {
          name: params.customer.name,
          email: params.customer.email,
          phone: params.customer.phone,
        },
        cancel_url: params.cancelUrl,
        description: params.description,
        line_items: params.lines.map((line) => ({
          name: line.name.slice(0, 120),
          quantity: line.quantity,
          amount: line.amountCentavos,
          currency: "PHP",
          ...(line.description ? { description: line.description.slice(0, 200) } : {}),
        })),
        payment_method_types: [params.method],
        reference_number: params.reference,
        send_email_receipt: true,
        show_description: true,
        show_line_items: true,
        success_url: params.successUrl,
        metadata: {
          reference: params.reference,
          ...params.metadata,
        },
        ...(params.method === "card"
          ? { payment_method_options: { card: { request_three_d_secure: "any" } } }
          : {}),
      },
    },
  };

  const res = await fetch(`${BASE_URL}/checkout_sessions`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const payload = (await res.json().catch(() => ({}))) as PayMongoResponse;
  if (!res.ok) {
    const detail = payload.errors?.map((error) => error.detail).filter(Boolean).join("; ");
    throw new PayMongoError(
      detail || `PayMongo rejected the checkout session (HTTP ${res.status}).`,
      res.status,
      payload.errors,
    );
  }
  const session = parseSession(payload);
  if (!session.checkoutUrl) {
    throw new PayMongoError("PayMongo did not return a checkout URL.", 502);
  }
  return session;
}

export async function retrieveCheckoutSession(sessionId: string): Promise<PayMongoSession> {
  const res = await fetch(`${BASE_URL}/checkout_sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: authHeader(), Accept: "application/json" },
    cache: "no-store",
  });
  const payload = (await res.json().catch(() => ({}))) as PayMongoResponse;
  if (!res.ok) {
    throw new PayMongoError(
      `Could not retrieve the PayMongo session (HTTP ${res.status}).`,
      res.status,
      payload.errors,
    );
  }
  return parseSession(payload);
}

/**
 * PayMongo signs webhooks with HMAC-SHA256 over `${timestamp}.${rawBody}`.
 * The header looks like: t=1700000000,te=<test signature>,li=<live signature>
 */
export function verifyWebhookSignature(
  rawBody: string,
  header: string | null,
): { valid: boolean; reason?: string } {
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET?.trim();
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return { valid: false, reason: "Webhook secret is not configured." };
    }
    if (header) {
      return {
        valid: false,
        reason: "Cannot verify a signature without PAYMONGO_WEBHOOK_SECRET.",
      };
    }
    return { valid: true, reason: "PAYMONGO_WEBHOOK_SECRET missing; accepted in development." };
  }
  if (!header) return { valid: false, reason: "Missing Paymongo-Signature header." };

  const parts = Object.fromEntries(
    header.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key?.trim(), value?.trim()];
    }),
  ) as Record<string, string | undefined>;

  const timestamp = parts.t;
  const provided = process.env.PAYMONGO_MODE === "live" ? parts.li : parts.te;
  if (!timestamp || !provided) {
    return { valid: false, reason: "Incomplete signature header." };
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  const valid = a.length === b.length && crypto.timingSafeEqual(a, b);
  return valid ? { valid: true } : { valid: false, reason: "Signature mismatch." };
}

export function mapSessionStatus(status: string): "pending" | "paid" | "cancelled" | null {
  switch (status) {
    case "paid":
      return "paid";
    case "expired":
      return "cancelled";
    case "active":
      return "pending";
    default:
      return null;
  }
}
