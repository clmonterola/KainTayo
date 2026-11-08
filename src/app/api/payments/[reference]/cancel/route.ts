import { NextResponse } from "next/server";
import { canAccessOrder, guard, jsonError, requireActor } from "@/server/api";
import { getOrder, transitionOrder } from "@/server/order-store";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ reference: string }> };

/** Marks a still-pending order as cancelled when the customer backs out. */
export async function POST(_request: Request, { params }: Context) {
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

  if (existing.status !== "pending") {
    return NextResponse.json({ order: existing });
  }

  const transitioned = await guard(() =>
    transitionOrder(reference, {
      status: "cancelled",
      type: "checkout.cancelled",
      message: "Customer cancelled the hosted checkout before paying.",
      failureReason: "Cancelled by customer.",
    }),
  );
  if (transitioned.response) return transitioned.response;

  return NextResponse.json({ order: transitioned.data ?? existing });
}
