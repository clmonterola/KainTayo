import type { Product } from "./types";

/** Normalise a category label before saving or comparing it. */
export function normalizeCategory(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/**
 * Build the category list from current product records. This keeps categories
 * data-driven today and can be replaced by a categories table later without
 * changing the customer or admin UI.
 */
export function collectCategories(
  products: ReadonlyArray<Pick<Product, "category">>,
): string[] {
  const seen = new Set<string>();

  for (const product of products) {
    const name = normalizeCategory(product.category);
    if (name) seen.add(name);
  }

  return [...seen].sort((a, b) => a.localeCompare(b));
}
