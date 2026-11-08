import { NextResponse } from "next/server";
import { canAccessOrder, guard, jsonError, requireActor } from "@/server/api";
import { getOrder, transitionOrder } from "@/server/order-store";
import {
  mapInvoiceStatus,
  retrieveInvoice,
  xenditEnabled,
  XenditError,
} from "@/server/xendit";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ reference: string }> };

export async function GET(_request: Request, { params }: Context) {
  const actor = await requireActor();
  if (actor.response) return actor.response;

  const { reference } = await params;
  const loaded = await guard(() => getOrder(reference));
  if (loaded.response) return loaded.response;

  let order = loaded.data;
  if (!order) return jsonError("We couldn't find that order.", 404);

  // Customers only ever see their own orders (admins/sellers by role).
  const allowed = await guard(() => canAccessOrder(order!, actor.actor));
  if (allowed.response) return allowed.response;
  if (!allowed.data) return jsonError("You don't have access to that order.", 403);

  let warning: string | undefined;

  // Server-side verification: the invoice state is read from Xendit with the
  // secret key, never reported by the browser. The webhook stays authoritative.
  if (
    order.payment.provider === "xendit" &&
    order.payment.sessionId &&
    order.status === "pending" &&
    xenditEnabled()
  ) {
    try {
      const invoice = await retrieveInvoice(order.payment.sessionId);
      const mapped = mapInvoiceStatus(invoice.status);

      if (mapped === "paid") {
        order =
          (await transitionOrder(reference, {
            status: "paid",
            type: "xendit.invoice_verified",
            message: `Xendit confirms the invoice is paid (${invoice.status}).`,
            payment: {
              providerStatus: invoice.status,
              paidAt: invoice.paidAt || new Date().toISOString(),
              ...(invoice.paymentId ? { paymentId: invoice.paymentId } : {}),
            },
          })) ?? order;
      } else if (mapped === "cancelled") {
        order =
          (await transitionOrder(reference, {
            status: "cancelled",
            type: "xendit.invoice_expired",
            message: "Xendit reports the checkout session expired.",
            payment: { providerStatus: invoice.status },
            failureReason: "Checkout session expired.",
          })) ?? order;
      } else if (mapped === "pending") {
        order =
          (await transitionOrder(reference, {
            status: "pending",
            type: "xendit.invoice_active",
            message: "Xendit reports the checkout session is still active.",
            payment: { providerStatus: invoice.status },
          })) ?? order;
      }
    } catch (error) {
      warning =
        error instanceof XenditError
          ? error.message
          : "We couldn't verify with Xendit just now.";
      console.error(`[xendit] Verification failed for ${reference}:`, warning);
    }
  }

  return NextResponse.json({
    order,
    mode: order.payment.provider,
    verified: order.payment.provider === "xendit" && !warning,
    ...(warning ? { warning } : {}),
  });
}
