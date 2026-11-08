import "server-only";
import { collectCategories, normalizeCategory } from "@/lib/categories";
import type { Category, Product } from "@/lib/types";
import { dataFile, readJson, withLock, writeJson } from "./json-store";

/**
 * Product data-access layer.
 *
 * The UI only talks to /api/products and /api/categories, and every server
 * feature imports the functions below. Replace this JSON adapter with your
 * database queries later; the API contract and UI do not need to change.
 */
const FILE = dataFile("products.json");
const LOCK = "products";

function isProductArray(value: unknown): value is Product[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        !!item &&
        typeof item === "object" &&
        typeof (item as Product).id === "string" &&
        typeof (item as Product).name === "string",
    )
  );
}

export async function listProducts(): Promise<Product[]> {
  // The catalog starts empty by design. Products are created through the
  // authenticated admin API or loaded from your database adapter.
  return readJson<Product[]>(FILE, () => [], isProductArray);
}

export async function getProduct(id: string): Promise<Product | undefined> {
  const products = await listProducts();
  return products.find((product) => product.id === id);
}

export async function listCategories(): Promise<string[]> {
  const products = await listProducts();
  return collectCategories(products);
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
};

export async function createProduct(input: NewProduct): Promise<Product> {
  return withLock(LOCK, async () => {
    const products = await listProducts();
    const now = new Date().toISOString();
    let id = "";
    do {
      id = `dish_${Math.random().toString(36).slice(2, 8)}`;
    } while (products.some((product) => product.id === id));

    const product: Product = {
      ...input,
      category: normalizeCategory(input.category),
      tag: input.tag?.trim() || undefined,
      id,
      createdAt: now,
      updatedAt: now,
    };
    await writeJson(FILE, [product, ...products]);
    return product;
  });
}

export async function updateProduct(
  id: string,
  patch: Partial<NewProduct>,
): Promise<Product | null> {
  return withLock(LOCK, async () => {
    const products = await listProducts();
    const index = products.findIndex((product) => product.id === id);
    if (index === -1) return null;
    const next: Product = {
      ...products[index],
      ...patch,
      category:
        patch.category !== undefined
          ? normalizeCategory(patch.category)
          : products[index].category,
      tag: patch.tag !== undefined ? patch.tag.trim() || undefined : products[index].tag,
      id,
      updatedAt: new Date().toISOString(),
    };
    const copy = [...products];
    copy[index] = next;
    await writeJson(FILE, copy);
    return next;
  });
}

export async function deleteProduct(id: string): Promise<boolean> {
  return withLock(LOCK, async () => {
    const products = await listProducts();
    const filtered = products.filter((product) => product.id !== id);
    if (filtered.length === products.length) return false;
    await writeJson(FILE, filtered);
    return true;
  });
}
