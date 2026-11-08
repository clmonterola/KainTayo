import { NextResponse } from "next/server";
import {
  asNumber,
  asString,
  guard,
  jsonError,
  readBody,
  requireActor,
  requireRole,
} from "@/server/api";
import { createProduct, listProducts } from "@/server/product-store";
import { normalizeCategory } from "@/lib/categories";
import { hasErrors, validateProduct, type ProductInput } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  const run = await guard(() => listProducts());
  if (run.response) return run.response;
  return NextResponse.json({ products: run.data });
}

export async function POST(request: Request) {
  const actor = await requireActor();
  if (actor.response) return actor.response;

  // Sellers and admins may add dishes; customers may not.
  const roleError = requireRole(actor.actor, ["seller", "admin"]);
  if (roleError) return roleError;

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

  const saved = await guard(() =>
    createProduct({
      ...input,
      // The dish belongs to whoever created it (admins own theirs too).
      sellerId: actor.actor.id,
    }),
  );
  if (saved.response) return saved.response;

  return NextResponse.json({ product: saved.data }, { status: 201 });
}
