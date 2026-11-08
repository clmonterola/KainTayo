"use client";

import type { Product } from "@/lib/types";
import { cn, formatPeso } from "@/lib/format";
import { useCart } from "@/components/providers/cart-provider";
import { ProductImage } from "@/components/product-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QuantityStepper } from "./quantity-stepper";

export function ProductCard({
  product,
  onOpen,
}: {
  product: Product;
  onOpen: (product: Product) => void;
}) {
  const { add, quantityOf, setQuantity } = useCart();
  const quantity = quantityOf(product.id);

  return (
    <article
      onClick={() => onOpen(product)}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-3xl border border-line bg-card text-left shadow-[0_18px_44px_-38px_rgba(33,30,25,0.6)] transition duration-300 hover:-translate-y-1 hover:border-brand/25 hover:shadow-soft"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-cream-deep">
        <ProductImage
          src={product.image}
          alt={product.name}
          loading="lazy"
          className={cn(
            "size-full object-cover transition duration-700 group-hover:scale-[1.04]",
            !product.available && "scale-105 grayscale",
          )}
        />
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
          <Badge tone="dark" className="bg-ink/80 backdrop-blur">
            {product.category}
          </Badge>
          {!product.available ? (
            <Badge tone="red">Sold out</Badge>
          ) : product.tag ? (
            <Badge tone="mango" className="bg-mango text-ink">
              {product.tag}
            </Badge>
          ) : null}
        </div>
        {!product.available ? (
          <div className="absolute inset-0 flex items-end justify-center bg-ink/15 pb-4">
            <span className="rounded-full bg-card/95 px-4 py-1.5 text-xs font-semibold text-ink shadow-sm">
              Back on the menu soon
            </span>
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg leading-snug font-semibold text-ink">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpen(product);
              }}
              className="cursor-pointer text-left transition hover:text-brand focus-visible:text-brand"
            >
              {product.name}
            </button>
          </h3>
          <span className="shrink-0 pt-0.5 font-display text-lg font-semibold text-brand">
            {formatPeso(product.price)}
          </span>
        </div>

        <p className="line-clamp-2 text-[13px] leading-relaxed text-muted">
          {product.description}
        </p>

        <div className="mt-auto flex items-center justify-between gap-3 pt-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted">
            <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M12 7.5V12l3 2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {product.prepMinutes} min
          </span>

          {quantity > 0 ? (
            <div onClick={(event) => event.stopPropagation()} className="shrink-0">
              <QuantityStepper
                value={quantity}
                onChange={(next) => setQuantity(product.id, next)}
                label={product.name}
                size="sm"
                min={0}
              />
            </div>
          ) : (
            <Button
              size="sm"
              variant={product.available ? "primary" : "secondary"}
              disabled={!product.available}
              onClick={(event) => {
                event.stopPropagation();
                add(product, 1);
              }}
              className="shrink-0"
            >
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
              Add
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
