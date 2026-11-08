import { api } from "@/lib/api-client";
import type { Product } from "@/lib/types";

export type ProductPayload = {
  name: string;
  description: string;
  category: string;
  price: number;
  image: string;
  available: boolean;
  tag?: string;
  prepMinutes: number;
};

export async function fetchProducts(): Promise<Product[]> {
  const data = await api<{ products: Product[] }>("/api/products");
  return data.products;
}

export async function fetchCategories(): Promise<string[]> {
  const data = await api<{ categories: string[] }>("/api/categories");
  return data.categories;
}

export async function createProduct(payload: ProductPayload): Promise<Product> {
  const data = await api<{ product: Product }>("/api/products", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data.product;
}

export async function updateProduct(
  id: string,
  payload: ProductPayload,
): Promise<Product> {
  const data = await api<{ product: Product }>(`/api/products/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return data.product;
}

export async function deleteProduct(id: string): Promise<void> {
  await api(`/api/products/${id}`, { method: "DELETE" });
}
