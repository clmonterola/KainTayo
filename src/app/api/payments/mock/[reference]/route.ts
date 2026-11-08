import { NextResponse } from "next/server";
import {
  asString,
  canAccessOrder,
  guard,
  jsonError,
  readBody,
  requireActor,
} from "@/server/api";
import { getOrder, transitionOrder } from "@/server/order-store";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ reference: string }> };

/**
 * Built-in checkout gateway, used only while no Xendit key is configured.
 * It writes exactly the same order transitions a real webhook would, through
 * the same server-side route — the page itself never marks an order paid.
 */
export async function POST(request: Request, { params }: Context) {
  const actor = await requireActor();
  if (actor.response) return actor.response;

  const { reference } = await params;
  const loaded = await guard(() => getOrder(reference));
  if (loaded.response) return loaded.response;

  const existing = loaded.data;
  if (!existing) return jsonError("We couldn't find that order.", 404);

  const allowed = await guard(() => canAccessOrder(existing, actor.actor));
  if (allowed.response) return allowed.response;
  if (!allowed.data) return jsonError("You don't have access to that order.", 403);

  if (existing.payment.provider !== "demo") {
    return jsonError("This order uses the hosted payment page.", 409);
  }
  if (existing.status !== "pending") {
    return NextResponse.json({ order: existing });
  }

  const body = await readBody(request);
  const outcome = asString(body?.outcome);
  if (!["paid", "failed", "cancelled"].includes(outcome)) {
    return jsonError("Choose a valid payment outcome.", 422);
  }

  const now = new Date().toISOString();
  const transitioned = await guard(() =>
    transitionOrder(reference, {
      status: outcome as "paid" | "failed" | "cancelled",
      type: `demo.payment_${outcome}`,
      message:
        outcome === "paid"
          ? "Payment authorised by the checkout gateway."
          : outcome === "failed"
            ? "Payment declined by the checkout gateway."
            : "Checkout was cancelled before payment.",
      payment:
        outcome === "paid"
          ? {
              providerStatus: "paid",
              paymentId: `pay_demo_${reference.replaceAll("-", "").toLowerCase()}`,
              paidAt: now,
            }
          : { providerStatus: outcome },
      ...(outcome === "paid" ? {} : { failureReason: "Payment was not completed." }),
    }),
  );
  if (transitioned.response) return transitioned.response;

  return NextResponse.json({ order: transitioned.data ?? existing });
}
