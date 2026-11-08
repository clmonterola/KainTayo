import { NextResponse } from "next/server";
import { asNumber, asString, jsonError, readBody, requireApiSession } from "@/server/api";
import { deleteProduct, updateProduct } from "@/server/product-store";
import { normalizeCategory } from "@/lib/categories";
import { hasErrors, validateProduct, type ProductInput } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const auth = await requireApiSession();
  if (auth.response) return auth.response;

  const { id } = await params;
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

  const product = await updateProduct(id, input);
  if (!product) return jsonError("That dish no longer exists.", 404);
  return NextResponse.json({ product });
}

export async function DELETE(_request: Request, { params }: Context) {
  const auth = await requireApiSession();
  if (auth.response) return auth.response;

  const { id } = await params;
  const removed = await deleteProduct(id);
  if (!removed) return jsonError("That dish no longer exists.", 404);
  return NextResponse.json({ ok: true });
}
