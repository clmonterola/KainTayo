import { NextResponse } from "next/server";
import { asNumber, asString, jsonError, readBody, requireApiSession } from "@/server/api";
import { createProduct, listProducts } from "@/server/product-store";
import { normalizeCategory } from "@/lib/categories";
import { hasErrors, validateProduct, type ProductInput } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  const products = await listProducts();
  return NextResponse.json({ products });
}

export async function POST(request: Request) {
  const auth = await requireApiSession();
  if (auth.response) return auth.response;

  const body = await readBody(request);
  if (!body) return jsonError("Invalid request body.");

  const input: ProductInput = {
    name: asString(body.name).trim(),
    description: asString(body.description).trim(),
    category: normalizeCategory(asString(body.category)),
    price: asNumber(body.price),
    image: asString(body.image).trim(),
    available: body.available !== false,
    tag: asString(body.tag).trim(),
    prepMinutes: asNumber(body.prepMinutes, 15),
  };

  const fields = validateProduct(input);
  if (hasErrors(fields)) {
    return jsonError("Please check the product details.", 422, fields);
  }

  const product = await createProduct(input);
  return NextResponse.json({ product }, { status: 201 });
}
