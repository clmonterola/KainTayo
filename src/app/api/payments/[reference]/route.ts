import { NextResponse } from "next/server";
import { jsonError, requireApiSession } from "@/server/api";
import { getOrder, transitionOrder } from "@/server/order-store";
import {
  mapSessionStatus,
  paymongoEnabled,
  retrieveCheckoutSession,
  PayMongoError,
} from "@/server/paymongo";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ reference: string }> };

export async function GET(_request: Request, { params }: Context) {
  const auth = await requireApiSession();
  if (auth.response) return auth.response;

  const { reference } = await params;
  let order = await getOrder(reference);
  if (!order) return jsonError("We couldn't find that order.", 404);

  let warning: string | undefined;

  if (
    order.payment.provider === "paymongo" &&
    order.payment.sessionId &&
    order.status === "pending" &&
    paymongoEnabled()
  ) {
    try {
      const session = await retrieveCheckoutSession(order.payment.sessionId);
      const mapped = mapSessionStatus(session.status);

      if (mapped === "paid") {
        const paidPayment = session.payments.find((payment) => payment.status === "paid");
        order =
          (await transitionOrder(reference, {
            status: "paid",
            type: "paymongo.session_verified",
            message: `PayMongo confirms the checkout session is paid (${session.status}).`,
            payment: {
              providerStatus: session.status,
              paymentId: paidPayment?.id,
              paidAt: new Date().toISOString(),
            },
          })) ?? order;
      } else if (mapped === "cancelled") {
        order =
          (await transitionOrder(reference, {
            status: "cancelled",
            type: "paymongo.session_expired",
            message: "PayMongo reports the checkout session expired.",
            payment: { providerStatus: session.status },
            failureReason: "Checkout session expired.",
          })) ?? order;
      } else if (mapped === "pending") {
        order =
          (await transitionOrder(reference, {
            status: "pending",
            type: "paymongo.session_active",
            message: "PayMongo reports the checkout session is still active.",
            payment: { providerStatus: session.status },
          })) ?? order;
      }
    } catch (error) {
      warning =
        error instanceof PayMongoError
          ? error.message
          : "We couldn't verify with PayMongo just now.";
      console.error(`[paymongo] Verification failed for ${reference}:`, warning);
    }
  }

  return NextResponse.json({
    order,
    mode: order.payment.provider,
    verified: order.payment.provider === "paymongo" && !warning,
    ...(warning ? { warning } : {}),
  });
}
