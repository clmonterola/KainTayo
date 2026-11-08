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
import { deleteProduct, productOwnerId, updateProduct } from "@/server/product-store";
import { normalizeCategory } from "@/lib/categories";
import { hasErrors, validateProduct, type ProductInput } from "@/lib/validation";
import type { AppUser } from "@/server/user-store";

type Context = { params: Promise<{ id: string }> };

/**
 * Admins may edit any dish, sellers only the ones they own (verified against
 * `products.seller_id`, not against anything the client sent).
 */
async function authorizeProductAction(
  id: string,
  actor: AppUser,
): Promise<NextResponse | null> {
  const owner = await guard(() => productOwnerId(id));
  if (owner.response) return owner.response;
  if (!owner.data) return jsonError("That dish no longer exists.", 404);
  if (actor.role === "admin") return null;
  if (owner.data === actor.id) return null;
  return jsonError("You can only manage dishes your account added.", 403);
}

export async function PATCH(request: Request, { params }: Context) {
  const actor = await requireActor();
  if (actor.response) return actor.response;

  const roleError = requireRole(actor.actor, ["seller", "admin"]);
  if (roleError) return roleError;

  const { id } = await params;
  const denied = await authorizeProductAction(id, actor.actor);
  if (denied) return denied;

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

  const saved = await guard(() => updateProduct(id, input));
  if (saved.response) return saved.response;
  if (!saved.data) return jsonError("That dish no longer exists.", 404);

  return NextResponse.json({ product: saved.data });
}

export async function DELETE(_request: Request, { params }: Context) {
  const actor = await requireActor();
  if (actor.response) return actor.response;

  const roleError = requireRole(actor.actor, ["seller", "admin"]);
  if (roleError) return roleError;

  const { id } = await params;
  const denied = await authorizeProductAction(id, actor.actor);
  if (denied) return denied;

  const removed = await guard(() => deleteProduct(id));
  if (removed.response) return removed.response;
  if (!removed.data) return jsonError("That dish no longer exists.", 404);

  return NextResponse.json({ ok: true });
}
