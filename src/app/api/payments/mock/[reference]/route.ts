import { NextResponse } from "next/server";
import { asString, jsonError, readBody, requireApiSession } from "@/server/api";
import { getOrder, transitionOrder } from "@/server/order-store";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ reference: string }> };

/**
 * Simulates the hosted wallet/card page when no PayMongo key is configured.
 * It writes exactly the same order transitions a real webhook would.
 */
export async function POST(request: Request, { params }: Context) {
  const auth = await requireApiSession();
  if (auth.response) return auth.response;

  const { reference } = await params;
  const existing = await getOrder(reference);
  if (!existing) return jsonError("We couldn't find that order.", 404);
  if (existing.payment.provider !== "demo") {
    return jsonError("This order is handled by PayMongo.", 409);
  }
  if (existing.status !== "pending") {
    return NextResponse.json({ order: existing });
  }

  const body = await readBody(request);
  const outcome = asString(body?.outcome);
  if (!["paid", "failed", "cancelled"].includes(outcome)) {
    return jsonError("Choose a valid demo outcome.", 422);
  }

  const now = new Date().toISOString();
  const order =
    (await transitionOrder(reference, {
      status: outcome as "paid" | "failed" | "cancelled",
      type: `demo.payment_${outcome}`,
      message:
        outcome === "paid"
          ? "Demo gateway authorised the payment."
          : outcome === "failed"
            ? "Demo gateway declined the payment."
            : "Demo gateway checkout was cancelled.",
      payment:
        outcome === "paid"
          ? {
              providerStatus: "paid",
              paymentId: `pay_demo_${reference.replaceAll("-", "").toLowerCase()}`,
              paidAt: now,
            }
          : { providerStatus: outcome },
      ...(outcome === "paid" ? {} : { failureReason: "Demo payment was not completed." }),
    })) ?? existing;

  return NextResponse.json({ order });
}
