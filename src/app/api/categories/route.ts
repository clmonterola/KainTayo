import { NextResponse } from "next/server";
import { guard } from "@/server/api";
import { listCategories } from "@/server/product-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const run = await guard(() => listCategories());
  if (run.response) return run.response;
  return NextResponse.json({ categories: run.data });
}
