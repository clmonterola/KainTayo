"use client";

import { useEffect, useMemo, useState } from "react";
import type { Product } from "@/lib/types";
import { collectCategories } from "@/lib/categories";
import { fetchCategories, fetchProducts } from "@/lib/services/products";
import { cn } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { EmptyState, ProductGridSkeleton } from "@/components/ui/feedback";
import { ProductCard } from "./product-card";
import { ProductDialog } from "./product-dialog";

type SortKey = "featured" | "price-asc" | "price-desc" | "name";

const sortLabels: Record<SortKey, string> = {
  featured: "Featured",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
  name: "Name: A–Z",
};

const serviceSteps = ["Browse the live menu", "Build your bag", "Pay securely"];

export function CatalogView() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("featured");
  const [selected, setSelected] = useState<Product | null>(null);

  async function load() {
    setError("");
    setProducts(null);
    setCategories([]);

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
      setError(
        loadError instanceof Error
          ? loadError.message
          : "We couldn't load the menu just now.",
      );
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

  const counts = useMemo(() => {
    const base: Record<string, number> = { All: products?.length ?? 0 };

    for (const item of categories) base[item] = 0;
    for (const product of products ?? []) {
      base[product.category] = (base[product.category] ?? 0) + 1;
    }

    return base;
  }, [products, categories]);

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    const list = (products ?? []).filter((product) => {
      if (category !== "All" && product.category !== category) return false;
      if (availableOnly && !product.available) return false;
      if (!search) return true;
      return [product.name, product.description, product.category, product.tag]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search);
    });

    const sorted = [...list];
    switch (sort) {
      case "price-asc":
        sorted.sort((a, b) => a.price - b.price);
        break;
      case "price-desc":
        sorted.sort((a, b) => b.price - a.price);
        break;
      case "name":
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      default:
        break;
    }
    return sorted;
  }, [products, category, availableOnly, query, sort]);

  const hasFilters = Boolean(query.trim()) || category !== "All" || availableOnly;
  const hasProducts = (products?.length ?? 0) > 0;

  function resetFilters() {
    setQuery("");
    setCategory("All");
    setAvailableOnly(false);
    setSort("featured");
  }

  function browseCategory(next: string) {
    setCategory(next);
    document.getElementById("menu")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="container-page py-6 sm:py-8">
      <section className="relative overflow-hidden rounded-4xl bg-ink text-cream shadow-soft">
        <div className="pattern-grid absolute inset-0 opacity-60" aria-hidden="true" />
        <div
          aria-hidden="true"
          className="absolute -top-24 -left-20 size-80 rounded-full bg-brand/30 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute -right-16 bottom-0 size-72 rounded-full bg-mango/20 blur-3xl"
        />

        <div className="relative grid gap-8 px-6 py-10 sm:px-10 sm:py-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:px-12">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-cream/15 bg-cream/5 px-3.5 py-1.5 text-[11px] font-semibold tracking-wide text-cream/80 backdrop-blur">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
              </span>
              Open today · 10:00 AM – 9:00 PM
            </span>

            <h1 className="mt-5 text-4xl leading-[1.02] text-cream text-balance sm:text-5xl lg:text-[3.4rem]">
              Lutong bahay,
              <br />
              <span className="text-mango">delivered warm.</span>
            </h1>

            <p className="mt-4 max-w-lg text-sm leading-relaxed text-cream/70 sm:text-[15px]">
              Filipino comfort food, cooked to order and sent straight to your door.
              Browse today&apos;s live menu, build your plate, and pay securely.
            </p>

            <div className="mt-7 flex items-center gap-2 rounded-full border border-cream/15 bg-cream/10 p-1.5 pl-4 backdrop-blur focus-within:border-mango/60">
              <svg viewBox="0 0 24 24" className="size-[18px] shrink-0 text-cream/60" fill="none" stroke="currentColor" strokeWidth="1.9">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.4-3.4" strokeLinecap="round" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search dishes, categories, or keywords"
                aria-label="Search the menu"
                className="h-10 min-w-0 flex-1 bg-transparent text-sm text-cream placeholder:text-cream/45 focus:outline-none"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="rounded-full px-2 text-[11px] font-semibold text-cream/60 hover:text-cream"
                >
                  Clear
                </button>
              ) : null}
              <Button
                type="button"
                variant="mango"
                size="sm"
                className="hidden sm:inline-flex"
                onClick={() => document.getElementById("menu")?.scrollIntoView({ behavior: "smooth" })}
              >
                Browse
              </Button>
            </div>

            {categories.length > 0 ? (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-cream/50">
                <span>Browse:</span>
                {categories.slice(0, 4).map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => browseCategory(term)}
                    className="rounded-full border border-cream/15 px-2.5 py-1 font-semibold text-cream/75 transition hover:border-mango/50 hover:text-mango"
                  >
                    {term}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="relative hidden h-72 lg:block" aria-hidden="true">
            <div className="absolute right-2 top-0 h-72 w-60 overflow-hidden rounded-t-[9rem] rounded-b-3xl border border-cream/10 bg-cream/5 p-6 shadow-2xl backdrop-blur">
              <p className="text-[10px] font-bold tracking-[0.18em] text-mango uppercase">
                How it works
              </p>
              <p className="mt-2 font-display text-2xl leading-tight text-cream">
                From kitchen to doorstep.
              </p>
              <ol className="mt-5 space-y-2.5">
                {serviceSteps.map((step, index) => (
                  <li
                    key={step}
                    className="flex items-center gap-3 rounded-xl border border-cream/10 bg-cream/5 px-3 py-2.5"
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-mango text-[10px] font-bold text-ink">
                      {index + 1}
                    </span>
                    <span className="text-[11px] font-semibold text-cream/85">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="absolute -left-2 bottom-0 w-44 rotate-[-5deg] rounded-3xl border-4 border-ink bg-cream px-4 py-3 text-ink shadow-2xl">
              <p className="text-[10px] font-bold tracking-wide text-brand uppercase">Live data</p>
              <p className="mt-0.5 text-xs font-semibold">Menu synced from the server</p>
            </div>
            <div className="absolute right-0 bottom-8 flex items-center gap-2 rounded-full bg-cream px-4 py-2 text-xs font-semibold text-ink shadow-lift">
              <svg viewBox="0 0 24 24" className="size-4 text-brand" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 7h11v8H3zM14 10h4l3 3v2h-7z" strokeLinejoin="round" />
                <circle cx="7" cy="17" r="1.6" />
                <circle cx="17.5" cy="17" r="1.6" />
              </svg>
              Free delivery over ₱999
            </div>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          { label: "35–50 min", sub: "Average delivery" },
          { label: "Free over ₱999", sub: "Else ₱59 delivery" },
          { label: "GCash · Maya · Card", sub: "Secured by PayMongo" },
        ].map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3"
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-cream-deep text-brand">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-ink">{item.label}</p>
              <p className="text-[11px] text-muted">{item.sub}</p>
            </div>
          </div>
        ))}
      </div>

      <section id="menu" className="mt-10 scroll-mt-24">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-bold tracking-[0.2em] text-brand uppercase">
              The kitchen is open
            </p>
            <h2 className="mt-1.5 text-3xl text-ink sm:text-4xl">Today&apos;s menu</h2>
          </div>

          {products === null || hasProducts ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={availableOnly}
                onClick={() => setAvailableOnly((value) => !value)}
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold transition",
                  availableOnly
                    ? "border-leaf/25 bg-leaf/10 text-leaf"
                    : "border-line bg-white text-muted hover:text-ink",
                )}
              >
                <span
                  className={cn(
                    "relative h-[18px] w-8 rounded-full transition",
                    availableOnly ? "bg-leaf" : "bg-line",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 size-3.5 rounded-full bg-white shadow transition-all",
                      availableOnly ? "left-[1.05rem]" : "left-0.5",
                    )}
                  />
                </span>
                Available only
              </button>

              <div className="relative">
                <select
                  aria-label="Sort the menu"
                  value={sort}
                  onChange={(event) => setSort(event.target.value as SortKey)}
                  className="h-10 appearance-none rounded-full border border-line bg-white pr-8 pl-3.5 text-[13px] font-semibold text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
                >
                  {(Object.keys(sortLabels) as SortKey[]).map((key) => (
                    <option key={key} value={key}>
                      {sortLabels[key]}
                    </option>
                  ))}
                </select>
                <svg
                  viewBox="0 0 24 24"
                  className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-muted"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          ) : null}
        </div>

        {categories.length > 0 ? (
          <div className="no-scrollbar -mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            <CategoryChip
              label="All dishes"
              count={counts.All}
              active={category === "All"}
              onClick={() => setCategory("All")}
            />
            {categories.map((item) => (
              <CategoryChip
                key={item}
                label={item}
                count={counts[item] ?? 0}
                active={category === item}
                onClick={() => setCategory(item)}
              />
            ))}
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between gap-3 text-sm text-muted">
          <p>
            {products === null
              ? "Loading the menu…"
              : products.length === 0
                ? "No dishes on the menu yet"
                : `${filtered.length} ${filtered.length === 1 ? "dish" : "dishes"}${
                    hasFilters ? " match your filters" : " on the menu"
                  }`}
          </p>
          {hasFilters && hasProducts ? (
            <button
              type="button"
              onClick={resetFilters}
              className="text-xs font-semibold text-brand hover:text-brand-dark"
            >
              Clear filters
            </button>
          ) : null}
        </div>

        <div className="mt-5">
          {products === null && !error ? <ProductGridSkeleton /> : null}

          {error ? (
            <EmptyState
              title="The menu didn't load"
              description={error}
              action={<Button onClick={() => void load()}>Try again</Button>}
              icon={
                <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M12 8v5M12 16.5v.5" strokeLinecap="round" />
                  <circle cx="12" cy="12" r="9" />
                </svg>
              }
            />
          ) : null}

          {products !== null && !error && products.length === 0 ? (
            <EmptyState
              title="No food items available yet."
              description="The kitchen has not published any dishes. Please check back soon."
              icon={
                <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M4 11h16a8 8 0 0 1-16 0Z" strokeLinejoin="round" />
                  <path d="M8 7c0-1 1-2 1-2M12 7c0-1 1-2 1-2M16 7c0-1 1-2 1-2" strokeLinecap="round" />
                  <path d="M8 19h8" strokeLinecap="round" />
                </svg>
              }
            />
          ) : null}

          {products !== null &&
          !error &&
          products.length > 0 &&
          filtered.length === 0 ? (
            <EmptyState
              title="Nothing matched that craving"
              description="Try a different word, or clear the filters to see the whole menu."
              action={
                <Button variant="secondary" onClick={resetFilters}>
                  Show everything
                </Button>
              }
            />
          ) : null}

          {products !== null && !error && filtered.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((product, index) => (
                <div
                  key={product.id}
                  className="animate-fade-up"
                  style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
                >
                  <ProductCard product={product} onOpen={setSelected} />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <ProductDialog product={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function CategoryChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-semibold transition",
        active
          ? "border-ink bg-ink text-cream"
          : "border-line bg-white text-muted hover:border-ink/25 hover:text-ink",
      )}
    >
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
          active ? "bg-cream/20 text-cream" : "bg-cream-deep text-muted",
        )}
      >
        {count}
      </span>
    </button>
  );
}
