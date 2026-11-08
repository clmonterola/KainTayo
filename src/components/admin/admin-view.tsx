"use client";

import { useEffect, useMemo, useState } from "react";
import type { Product } from "@/lib/types";
import { collectCategories } from "@/lib/categories";
import { ApiClientError } from "@/lib/api-client";
import {
  deleteProduct,
  fetchCategories,
  fetchProducts,
  updateProduct,
} from "@/lib/services/products";
import { cn, formatPeso } from "@/lib/format";
import { useToast } from "@/components/providers/toast-provider";
import { ProductImage } from "@/components/product-image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { ConfirmDialog } from "@/components/ui/modal";
import { Select } from "@/components/ui/input";
import { ProductForm } from "./product-form";

type AvailabilityFilter = "all" | "available" | "soldout";

export function AdminView() {
  const { push } = useToast();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [availability, setAvailability] = useState<AvailabilityFilter>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  async function load() {
    setError("");
    try {
      const [productResult, categoryResult] = await Promise.allSettled([
        fetchProducts(),
        fetchCategories(),
      ]);

      if (productResult.status === "rejected") {
        throw productResult.reason;
      }

      const list = productResult.value;
      const apiCategories =
        categoryResult.status === "fulfilled" ? categoryResult.value : [];
      const usableCategories =
        apiCategories.length > 0 || list.length === 0
          ? apiCategories
          : collectCategories(list);

      setProducts(list);
      setCategories(usableCategories);
    } catch (loadError) {
      setProducts(null);
      setError(loadError instanceof Error ? loadError.message : "Could not load the menu.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (category !== "All" && !categories.includes(category)) {
      setCategory("All");
    }
  }, [categories, category]);

  const stats = useMemo(() => {
    const list = products ?? [];
    return {
      total: list.length,
      available: list.filter((product) => product.available).length,
      soldOut: list.filter((product) => !product.available).length,
      categories: new Set(list.map((product) => product.category)).size,
    };
  }, [products]);

  const visible = useMemo(() => {
    const search = query.trim().toLowerCase();
    return (products ?? []).filter((product) => {
      if (category !== "All" && product.category !== category) return false;
      if (availability === "available" && !product.available) return false;
      if (availability === "soldout" && product.available) return false;
      if (!search) return true;
      return [product.name, product.description, product.category, product.tag]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
  }, [products, query, category, availability]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(product: Product) {
    setEditing(product);
    setFormOpen(true);
  }

  function handleSaved(saved: Product) {
    const list = products ?? [];
    const exists = list.some((product) => product.id === saved.id);
    const next = exists
      ? list.map((product) => (product.id === saved.id ? saved : product))
      : [saved, ...list];

    setProducts(next);
    setCategories(collectCategories(next));
    setFormOpen(false);
    setEditing(null);
  }

  async function toggleAvailability(product: Product) {
    setToggling(product.id);
    const next = { ...product, available: !product.available };
    setProducts((current) =>
      (current ?? []).map((entry) => (entry.id === product.id ? next : entry)),
    );

    try {
      const data = await updateProduct(product.id, {
        name: product.name,
        description: product.description,
        category: product.category,
        price: product.price,
        image: product.image,
        available: !product.available,
        tag: product.tag,
        prepMinutes: product.prepMinutes,
      });
      setProducts((current) =>
        (current ?? []).map((entry) => (entry.id === product.id ? data : entry)),
      );
      push({
        title: data.available ? "Back on the menu" : "Marked as sold out",
        description: data.name,
        variant: data.available ? "success" : "info",
      });
    } catch (toggleError) {
      setProducts((current) =>
        (current ?? []).map((entry) => (entry.id === product.id ? product : entry)),
      );
      const message =
        toggleError instanceof ApiClientError
          ? toggleError.message
          : "Could not update availability.";
      push({ title: "Update failed", description: message, variant: "error" });
    } finally {
      setToggling(null);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await deleteProduct(deleting.id);
      const next = (products ?? []).filter((entry) => entry.id !== deleting.id);
      setProducts(next);
      setCategories(collectCategories(next));
      push({
        title: "Dish deleted",
        description: `${deleting.name} is off the menu.`,
        variant: "success",
      });
      setDeleting(null);
    } catch (deleteError) {
      const message =
        deleteError instanceof ApiClientError
          ? deleteError.message
          : "Could not delete the dish.";
      push({ title: "Delete failed", description: message, variant: "error" });
    } finally {
      setDeleteBusy(false);
    }
  }

  const hasFilters = Boolean(query.trim()) || category !== "All" || availability !== "all";

  return (
    <div className="container-page py-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold tracking-[0.2em] text-brand uppercase">
            Kitchen admin
          </p>
          <h1 className="mt-1.5 text-3xl text-ink sm:text-4xl">Menu management</h1>
          <p className="mt-1.5 max-w-xl text-sm text-muted">
            Add, edit, and retire dishes. Changes are saved through the product API and show
            up on the customer menu.
          </p>
        </div>
        <Button size="lg" onClick={openCreate}>
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          Add a dish
        </Button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Total dishes", value: stats.total },
          { label: "Available", value: stats.available },
          { label: "Sold out", value: stats.soldOut },
          { label: "Categories", value: stats.categories },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-line bg-card px-4 py-3">
            <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">
              {stat.label}
            </p>
            <p className="mt-0.5 font-display text-2xl font-semibold text-ink">
              {products === null ? "—" : stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-3xl border border-line bg-card">
        <div className="flex flex-col gap-3 border-b border-line/80 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <svg
              viewBox="0 0 24 24"
              className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.4-3.4" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search dishes…"
              aria-label="Search dishes"
              className="h-11 w-full rounded-2xl border border-line bg-cream/40 pr-4 pl-11 text-sm text-ink placeholder:text-muted/60 focus:border-brand focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand/10"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Select
              aria-label="Filter by category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="w-auto min-w-36"
            >
              <option value="All">All categories</option>
              {categories.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Filter by availability"
              value={availability}
              onChange={(event) => setAvailability(event.target.value as AvailabilityFilter)}
              className="w-auto min-w-36"
            >
              <option value="all">Any availability</option>
              <option value="available">Available</option>
              <option value="soldout">Sold out</option>
            </Select>
            <Button variant="secondary" size="md" onClick={() => void load()}>
              Refresh
            </Button>
          </div>
        </div>

        {products === null && !error ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex items-center gap-4">
                <Skeleton className="size-12 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-3 w-64" />
                </div>
                <Skeleton className="h-8 w-24 rounded-full" />
              </div>
            ))}
          </div>
        ) : null}

        {error ? (
          <div className="p-4">
            <EmptyState
              title="Could not load the menu"
              description={error}
              action={<Button onClick={() => void load()}>Try again</Button>}
            />
          </div>
        ) : null}

        {products !== null && !error && visible.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title={products.length === 0 ? "The menu is empty" : "No dishes match"}
              description={
                products.length === 0
                  ? "Add your first dish. It will be saved by the product API and appear on the customer menu."
                  : "Try a different search, category, or availability filter."
              }
              action={
                products.length === 0 ? (
                  <Button onClick={openCreate}>Add a dish</Button>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setQuery("");
                      setCategory("All");
                      setAvailability("all");
                    }}
                  >
                    Clear filters
                  </Button>
                )
              }
            />
          </div>
        ) : null}

        {products !== null && !error && visible.length > 0 ? (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line/80 text-[11px] tracking-wide text-muted uppercase">
                    <th className="px-5 py-3 font-semibold">Dish</th>
                    <th className="px-4 py-3 font-semibold">Category</th>
                    <th className="px-4 py-3 font-semibold">Price</th>
                    <th className="px-4 py-3 font-semibold">Prep</th>
                    <th className="px-4 py-3 font-semibold">Availability</th>
                    <th className="px-5 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((product) => (
                    <tr
                      key={product.id}
                      className="border-b border-line/60 last:border-0 hover:bg-cream/40"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="size-12 shrink-0 overflow-hidden rounded-xl bg-cream-deep">
                            <ProductImage
                              src={product.image}
                              alt={product.name}
                              className={cn(
                                "size-full object-cover",
                                !product.available && "grayscale",
                              )}
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 font-semibold text-ink">
                              {product.name}
                              {product.tag ? (
                                <Badge tone="mango" className="text-[9px]">
                                  {product.tag}
                                </Badge>
                              ) : null}
                            </p>
                            <p className="mt-0.5 line-clamp-1 max-w-sm text-xs text-muted">
                              {product.description}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone="neutral">{product.category}</Badge>
                      </td>
                      <td className="px-4 py-3 font-semibold text-ink">
                        {formatPeso(product.price)}
                      </td>
                      <td className="px-4 py-3 text-muted">{product.prepMinutes} min</td>
                      <td className="px-4 py-3">
                        <AvailabilitySwitch
                          available={product.available}
                          busy={toggling === product.id}
                          onChange={() => void toggleAvailability(product)}
                        />
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(product)}
                            aria-label={`Edit ${product.name}`}
                            title="Edit"
                            className="rounded-full p-2 text-muted transition hover:bg-cream-deep hover:text-ink"
                          >
                            <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16v4Z" strokeLinejoin="round" />
                              <path d="m13.5 6.5 4 4" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleting(product)}
                            aria-label={`Delete ${product.name}`}
                            title="Delete"
                            className="rounded-full p-2 text-muted transition hover:bg-red-50 hover:text-red-600"
                          >
                            <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-line/70 md:hidden">
              {visible.map((product) => (
                <li key={product.id} className="p-4">
                  <div className="flex gap-3">
                    <div className="size-16 shrink-0 overflow-hidden rounded-2xl bg-cream-deep">
                      <ProductImage
                        src={product.image}
                        alt={product.name}
                        className={cn(
                          "size-full object-cover",
                          !product.available && "grayscale",
                        )}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-ink">{product.name}</p>
                        <p className="shrink-0 text-sm font-semibold text-brand">
                          {formatPeso(product.price)}
                        </p>
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted">
                        {product.description}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge tone="neutral">{product.category}</Badge>
                        <span className="text-[11px] text-muted">{product.prepMinutes} min</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <AvailabilitySwitch
                      available={product.available}
                      busy={toggling === product.id}
                      onChange={() => void toggleAvailability(product)}
                    />
                    <div className="flex gap-1">
                      <Button variant="secondary" size="sm" onClick={() => openEdit(product)}>
                        Edit
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => setDeleting(product)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>

      <p className="mt-4 text-[11px] text-muted">
        {hasFilters
          ? `${visible.length} of ${stats.total} dishes shown.`
          : "Esc to close dialogs · Changes are persisted through the product API."}
      </p>

      {formOpen ? (
        <ProductForm
          key={editing?.id ?? "new"}
          product={editing}
          categories={categories}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSaved={handleSaved}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this dish?"
        description={
          deleting
            ? `${deleting.name} will be removed from the menu permanently. Past orders keep their own copy of the dish details.`
            : ""
        }
        confirmLabel="Delete dish"
        cancelLabel="Keep it"
        loading={deleteBusy}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}

function AvailabilitySwitch({
  available,
  busy,
  onChange,
}: {
  available: boolean;
  busy: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={available}
      aria-label={available ? "Mark dish as sold out" : "Mark dish as available"}
      disabled={busy}
      onClick={onChange}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-60",
        available
          ? "border-leaf/25 bg-leaf/10 text-leaf"
          : "border-line bg-cream-deep text-muted",
      )}
    >
      <span className={cn("relative h-4 w-7 rounded-full transition", available ? "bg-leaf" : "bg-line")}>
        <span
          className={cn(
            "absolute top-0.5 size-3 rounded-full bg-white shadow transition-all",
            available ? "left-[0.9rem]" : "left-0.5",
          )}
        />
      </span>
      {available ? "Available" : "Sold out"}
    </button>
  );
}
