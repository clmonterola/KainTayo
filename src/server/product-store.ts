import "server-only";
import { normalizeCategory } from "@/lib/categories";
import type { Category, Product } from "@/lib/types";
import {
  DatabaseError,
  getServerClient,
  requireServerAccess,
  throwIfError,
} from "./supabase";

/**
 * Product data-access layer backed by Supabase (`public.products` +
 * `public.categories`).
 *
 * Reads use whichever key is configured (the public catalog is readable with
 * the publishable key thanks to RLS); writes require the server key and are
 * only ever reached after a route has verified the session and the role.
 */

const PRODUCT_SELECT = "*, categories(name)";

type CategoryEmbed = { name: string } | { name: string }[] | null;

type ProductRow = {
  id: string;
  name: string;
  description: string;
  price: number | string;
  image: string;
  available: boolean;
  tag: string | null;
  prep_minutes: number;
  seller_id: string | null;
  created_at: string;
  updated_at: string;
  categories?: CategoryEmbed;
};

function categoryName(embed: CategoryEmbed | undefined) {
  const category = Array.isArray(embed) ? embed[0] : embed;
  return category?.name ?? "";
}

function mapProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: categoryName(row.categories),
    price: Number(row.price),
    image: row.image,
    available: row.available,
    tag: row.tag ?? undefined,
    prepMinutes: row.prep_minutes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listProducts(): Promise<Product[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from("products")
    .select(PRODUCT_SELECT)
    .order("created_at", { ascending: false });

  throwIfError(error, "We couldn't load the menu right now.");
  return ((data ?? []) as ProductRow[]).map(mapProduct);
}

export async function getProduct(id: string): Promise<Product | undefined> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("id", id)
    .maybeSingle();

  throwIfError(error, "We couldn't load that dish.");
  return data ? mapProduct(data as ProductRow) : undefined;
}

export async function listCategories(): Promise<string[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from("categories")
    .select("name")
    .order("name", { ascending: true });

  throwIfError(error, "We couldn't load the categories.");
  return ((data ?? []) as Array<{ name: string }>).map((row) => row.name);
}

/** Seller/owner of a dish — used to authorize edits and deletions. */
export async function productOwnerId(id: string): Promise<string | null> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from("products")
    .select("seller_id")
    .eq("id", id)
    .maybeSingle();

  throwIfError(error, "We couldn't load that dish.");
  return (data as { seller_id: string | null } | null)?.seller_id ?? null;
}

/** All dish ids owned by a seller (order visibility for sellers). */
export async function listProductIdsBySeller(sellerId: string): Promise<string[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from("products")
    .select("id")
    .eq("seller_id", sellerId);

  throwIfError(error, "We couldn't load your dishes.");
  return ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
}

/**
 * Finds (or creates) the category row for a label so `category_id` always has
 * a valid foreign key. Categories are created from the admin form's free-text
 * field, so a new label simply becomes a new row.
 */
async function ensureCategory(name: string): Promise<string> {
  const sb = requireServerAccess();
  const normalized = normalizeCategory(name);

  const { data: existing, error: readError } = await sb
    .from("categories")
    .select("id")
    .eq("name", normalized)
    .maybeSingle();
  throwIfError(readError, "We couldn't read the category.");
  if (existing) return (existing as { id: string }).id;

  const { data: inserted, error: insertError } = await sb
    .from("categories")
    .insert({ name: normalized })
    .select("id")
    .maybeSingle();

  if (insertError) {
    // 23505 = another request created it first; read it back instead.
    if (insertError.code !== "23505") {
      throwIfError(insertError, "We couldn't save the category.");
    }
    const { data: again, error: againError } = await sb
      .from("categories")
      .select("id")
      .eq("name", normalized)
      .maybeSingle();
    throwIfError(againError, "We couldn't read the category.");
    if (again) return (again as { id: string }).id;
  } else if (inserted) {
    return (inserted as { id: string }).id;
  }

  throw new DatabaseError("We couldn't save the category.");
}

export type NewProduct = {
  name: string;
  description: string;
  category: Category;
  price: number;
  image: string;
  available: boolean;
  tag?: string;
  prepMinutes: number;
  /** Account that owns the dish (seller or admin performing the request). */
  sellerId?: string | null;
};

export async function createProduct(input: NewProduct): Promise<Product> {
  const sb = requireServerAccess();
  const categoryId = await ensureCategory(input.category);

  const { data, error } = await sb
    .from("products")
    .insert({
      name: input.name.trim(),
      description: input.description.trim(),
      price: input.price,
      image: input.image.trim(),
      category_id: categoryId,
      available: input.available,
      tag: input.tag?.trim() || null,
      prep_minutes: input.prepMinutes,
      seller_id: input.sellerId ?? null,
    })
    .select(PRODUCT_SELECT)
    .single();

  throwIfError(error, "We couldn't save the dish.");
  return mapProduct(data as ProductRow);
}

export async function updateProduct(
  id: string,
  patch: Partial<NewProduct>,
): Promise<Product | null> {
  const sb = requireServerAccess();

  const payload: Record<string, unknown> = {};
  if (patch.name !== undefined) payload.name = patch.name.trim();
  if (patch.description !== undefined) payload.description = patch.description.trim();
  if (patch.price !== undefined) payload.price = patch.price;
  if (patch.image !== undefined) payload.image = patch.image.trim();
  if (patch.available !== undefined) payload.available = patch.available;
  if (patch.tag !== undefined) payload.tag = patch.tag.trim() || null;
  if (patch.prepMinutes !== undefined) payload.prep_minutes = patch.prepMinutes;
  if (patch.sellerId !== undefined) payload.seller_id = patch.sellerId;
  if (patch.category !== undefined) payload.category_id = await ensureCategory(patch.category);

  if (Object.keys(payload).length === 0) return (await getProduct(id)) ?? null;

  const { data, error } = await sb
    .from("products")
    .update(payload)
    .eq("id", id)
    .select(PRODUCT_SELECT)
    .maybeSingle();

  throwIfError(error, "We couldn't update the dish.");
  return data ? mapProduct(data as ProductRow) : null;
}

export async function deleteProduct(id: string): Promise<boolean> {
  const sb = requireServerAccess();
  const { data, error } = await sb
    .from("products")
    .delete()
    .eq("id", id)
    .select("id");

  throwIfError(error, "We couldn't delete the dish.");
  return (data ?? []).length > 0;
}
