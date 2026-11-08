import { NextResponse } from "next/server";
import { guard, requireActor } from "@/server/api";
import { listOrders } from "@/server/order-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const actor = await requireActor();
  if (actor.response) return actor.response;

  // Scoped by role inside the store: customers see only their own orders,
  // sellers their own plus orders containing their dishes, admins all.
  const run = await guard(() =>
    listOrders({ role: actor.actor.role, userId: actor.actor.id }),
  );
  if (run.response) return run.response;

  return NextResponse.json({ orders: run.data });
}
