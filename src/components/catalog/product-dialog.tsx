"use client";

import { useEffect, useState } from "react";
import type { Product } from "@/lib/types";
import { formatPeso } from "@/lib/format";
import { useCart } from "@/components/providers/cart-provider";
import { ProductImage } from "@/components/product-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { QuantityStepper } from "./quantity-stepper";

export function ProductDialog({
  product,
  onClose,
}: {
  product: Product | null;
  onClose: () => void;
}) {
  const { add, quantityOf } = useCart();
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (product) setQuantity(Math.max(1, quantityOf(product.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  if (!product) return null;

  return (
    <Modal
      open={Boolean(product)}
      onClose={onClose}
      title={product.name}
      description={`${product.category} · Ready in ${product.prepMinutes} minutes`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Keep browsing
          </Button>
          <Button
            onClick={() => {
              add(product, quantity);
              onClose();
            }}
            disabled={!product.available}
            className="sm:min-w-44"
          >
            {product.available
              ? `Add ${quantity} · ${formatPeso(product.price * quantity)}`
              : "Sold out"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="relative overflow-hidden rounded-3xl">
          <ProductImage
            src={product.image}
            alt={product.name}
            loading="eager"
            className="aspect-[16/9] w-full object-cover"
          />
          <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4">
            <Badge tone="dark" className="bg-ink/80 backdrop-blur">
              {product.category}
            </Badge>
            {product.tag ? (
              <Badge tone="mango" className="bg-mango text-ink">
                {product.tag}
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <p className="font-display text-3xl font-semibold text-brand">
            {formatPeso(product.price)}
          </p>
          <span className="text-xs text-muted">per serving</span>
          <span className="ml-auto">
            {product.available ? (
              <Badge tone="leaf">Available now</Badge>
            ) : (
              <Badge tone="red">Sold out</Badge>
            )}
          </span>
        </div>

        <p className="text-sm leading-relaxed text-muted">{product.description}</p>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-cream/60 px-4 py-3">
          <span className="text-sm font-semibold text-ink">Quantity</span>
          <QuantityStepper
            value={quantity}
            onChange={setQuantity}
            label={product.name}
            disabled={!product.available}
          />
        </div>

        <div className="grid gap-3 text-xs text-muted sm:grid-cols-3">
          <div className="rounded-2xl bg-cream/70 p-3">
            <p className="font-semibold text-ink">Freshly cooked</p>
            <p className="mt-0.5">Made to order, never reheated.</p>
          </div>
          <div className="rounded-2xl bg-cream/70 p-3">
            <p className="font-semibold text-ink">Careful packing</p>
            <p className="mt-0.5">Sauces packed separately.</p>
          </div>
          <div className="rounded-2xl bg-cream/70 p-3">
            <p className="font-semibold text-ink">Allergens?</p>
            <p className="mt-0.5">Leave a note at checkout.</p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
