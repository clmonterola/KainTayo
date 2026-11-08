import "server-only";
import crypto from "node:crypto";

/**
 * Xendit Invoices API (https://developers.xendit.com/api-reference/#invoices).
 *
 * The flow is unchanged from the previous provider:
 *   create invoice → customer pays on Xendit's hosted page → Xendit calls
 *   `/api/payments/webhook` with an `x-callback-token` → the order is marked
 *   paid server-side. The browser never decides whether a payment succeeded.
 *
 * Without `XENDIT_SECRET_KEY` the app falls back to the built-in gateway so
 * checkout keeps working locally (see `/payment/mock/[reference]`).
 */

const BASE_URL = "https://api.xendit.co/v2";

export class XenditError extends Error {
  status: number;
  detail: unknown;
  constructor(message: string, status = 502, detail?: unknown) {
    super(message);
    this.name = "XenditError";
    this.status = status;
    this.detail = detail;
  }
}

export function xenditEnabled() {
  return Boolean(process.env.XENDIT_SECRET_KEY?.trim());
}

function secretKey() {
  const key = process.env.XENDIT_SECRET_KEY?.trim();
  if (!key) throw new XenditError("Xendit is not configured.", 503);
  if (key.startsWith("xnd_live_") && process.env.XENDIT_MODE !== "live") {
    throw new XenditError(
      'A live Xendit key was provided while XENDIT_MODE is not set to "live".',
      500,
    );
  }
  return key;
}

function authHeader() {
  return `Basic ${Buffer.from(`${secretKey()}:`).toString("base64")}`;
}

export type XenditInvoice = {
  /** Xendit invoice id — stored as `payments.provider_reference`. */
  id: string;
  externalId: string;
  status: string;
  invoiceUrl: string;
  amount: number;
  paidAt?: string;
  paymentMethod?: string;
  paymentId?: string;
};

type XenditInvoiceResponse = {
  id?: string;
  external_id?: string;
  status?: string;
  invoice_url?: string;
  amount?: number;
  paid_at?: string;
  payment_method?: string;
  payment_id?: string;
  message?: string;
  error?: { message?: string; errors?: Array<{ message?: string }> };
};

function parseInvoice(payload: XenditInvoiceResponse): XenditInvoice {
  if (!payload.id) {
    throw new XenditError("Unexpected response from Xendit.", 502, payload);
  }
  return {
    id: payload.id,
    externalId: payload.external_id ?? "",
    status: payload.status ?? "PENDING",
    invoiceUrl: payload.invoice_url ?? "",
    amount: payload.amount ?? 0,
    paidAt: payload.paid_at,
    paymentMethod: payload.payment_method,
    paymentId: payload.payment_id,
  };
}

function providerDetail(payload: XenditInvoiceResponse) {
  return (
    payload.error?.errors?.map((entry) => entry.message).filter(Boolean).join("; ") ||
    payload.error?.message ||
    payload.message ||
    ""
  );
}

/**
 * Creates the hosted invoice the customer pays on.
 * `amount` is in whole pesos — Xendit invoices use the currency's major unit.
 */
export async function createInvoice(params: {
  reference: string;
  description: string;
  amount: number;
  payerEmail: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<XenditInvoice> {
  const body = {
    external_id: params.reference,
    amount: params.amount,
    description: params.description.slice(0, 500),
    currency: "PHP",
    payer_email: params.payerEmail,
    success_redirect_url: params.successUrl,
    failure_redirect_url: params.cancelUrl,
  };

  const res = await fetch(`${BASE_URL}/invoices`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const payload = (await res.json().catch(() => ({}))) as XenditInvoiceResponse;
  if (!res.ok) {
    throw new XenditError(
      providerDetail(payload) || `Xendit rejected the invoice (HTTP ${res.status}).`,
      res.status,
      payload,
    );
  }

  const invoice = parseInvoice(payload);
  if (!invoice.invoiceUrl) {
    throw new XenditError("Xendit did not return an invoice URL.", 502);
  }
  return invoice;
}

/** Server-side verification used by `GET /api/payments/[reference]`. */
export async function retrieveInvoice(invoiceId: string): Promise<XenditInvoice> {
  const res = await fetch(
    `${BASE_URL}/invoices/${encodeURIComponent(invoiceId)}`,
    {
      headers: { Authorization: authHeader(), Accept: "application/json" },
      cache: "no-store",
    },
  );

  const payload = (await res.json().catch(() => ({}))) as XenditInvoiceResponse;
  if (!res.ok) {
    throw new XenditError(
      providerDetail(payload) ||
        `Could not retrieve the Xendit invoice (HTTP ${res.status}).`,
      res.status,
      payload,
    );
  }
  return parseInvoice(payload);
}

/**
 * Xendit signs callbacks with a static token in `x-callback-token`
 * (Dashboard → Settings → Developers → Callbacks).
 */
export function verifyCallbackToken(
  header: string | null,
): { valid: boolean; reason?: string } {
  const expected = process.env.XENDIT_CALLBACK_TOKEN?.trim();
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      return { valid: false, reason: "Callback token is not configured." };
    }
    if (header) {
      return {
        valid: false,
        reason: "Cannot verify a callback without XENDIT_CALLBACK_TOKEN.",
      };
    }
    return {
      valid: true,
      reason: "XENDIT_CALLBACK_TOKEN missing; accepted in development.",
    };
  }

  if (!header) return { valid: false, reason: "Missing x-callback-token header." };

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(header.trim(), "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, reason: "Callback token mismatch." };
  }
  return { valid: true };
}

export function mapInvoiceStatus(
  status: string,
): "paid" | "cancelled" | "pending" | null {
  switch (status?.toUpperCase()) {
    case "PAID":
      return "paid";
    case "EXPIRED":
      return "cancelled";
    case "PENDING":
      return "pending";
    default:
      return null;
  }
}
