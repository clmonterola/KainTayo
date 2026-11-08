import type { Metadata } from "next";
import { CatalogView } from "@/components/catalog/catalog-view";

export const metadata: Metadata = { title: "Menu" };

export default function OrderPage() {
  return <CatalogView />;
}
