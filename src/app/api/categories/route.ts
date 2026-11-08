import { NextResponse } from "next/server";
import { listCategories } from "@/server/product-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const categories = await listCategories();
  return NextResponse.json({ categories });
}
