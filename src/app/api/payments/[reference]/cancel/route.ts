import { NextResponse } from "next/server";
import { jsonError, requireApiSession } from "@/server/api";
import { getOrder, transitionOrder } from "@/server/order-store";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ reference: string }> };

/** Marks a still-pending order as cancelled when the customer backs out. */
export async function POST(_request: Request, { params }: Context) {
  const auth = await requireApiSession();
  if (auth.response) return auth.response;

  const { reference } = await params;
  const existing = await getOrder(reference);
  if (!existing) return jsonError("We couldn't find that order.", 404);

  if (existing.status !== "pending") {
    return NextResponse.json({ order: existing });
  }

  const order =
    (await transitionOrder(reference, {
      status: "cancelled",
      type: "checkout.cancelled",
      message: "Customer cancelled the hosted checkout before paying.",
      failureReason: "Cancelled by customer.",
    })) ?? existing;

  return NextResponse.json({ order });
}
