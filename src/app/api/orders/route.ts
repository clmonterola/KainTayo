import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/api";
import { listOrders } from "@/server/order-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiSession();
  if (auth.response) return auth.response;
  const orders = await listOrders();
  return NextResponse.json({ orders });
}
