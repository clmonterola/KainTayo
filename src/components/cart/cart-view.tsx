"use client";

import Link from "next/link";
import { useState } from "react";
import type { CartItem } from "@/lib/types";
import { formatPeso } from "@/lib/format";
import { computeTotals, FREE_DELIVERY_THRESHOLD } from "@/lib/pricing";
import { useCart } from "@/components/providers/cart-provider";
import { buttonStyles } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/feedback";
import { Spinner } from "@/components/ui/spinner";
import { QuantityStepper } from "@/components/catalog/quantity-stepper";

export function CartView() {
  const { items, hydrated, setQuantity, remove, clear } = useCart();
  const [removeTarget, setRemoveTarget] = useState<CartItem | null>(null);
  const [clearOpen, setClearOpen] = useState(false);

  const totals = computeTotals(items);
  const progress = Math.min(100, Math.round((totals.subtotal / FREE_DELIVERY_THRESHOLD) * 100));

  if (!hydrated) {
    return (
      <div className="container-page flex min-h-72 items-center justify-center py-20 text-muted">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="container-page py-10 sm:py-14">
        <div className="mx-auto max-w-2xl">
          <EmptyState
            icon={
              <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M5 8h14l-1 11H6L5 8Z" strokeLinejoin="round" />
                <path d="M9 8V6.5a3 3 0 0 1 6 0V8" strokeLinecap="round" />
              </svg>
            }
            title="Your bag is empty"
            description="The adobo is calling. Browse the menu and add a few Filipino classics to get started."
            action={
              <Link href="/order" className={buttonStyles("primary", "md")}>
                Browse the menu
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="container-page py-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold tracking-[0.2em] text-brand uppercase">
            Almost there
          </p>
          <h1 className="mt-1.5 text-3xl text-ink sm:text-4xl">Your bag</h1>
          <p className="mt-1.5 text-sm text-muted">
            {items.length} {items.length === 1 ? "dish" : "dishes"} ·{" "}
            {items.reduce((sum, item) => sum + item.quantity, 0)} servings
          </p>
        </div>
        <Link
          href="/order"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:text-brand-dark"
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5m0 0 5-5m-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Continue shopping
        </Link>
      </div>

      <div className="mt-7 grid gap-6 lg:grid-cols-[1.55fr_0.9fr] lg:items-start">
        <div className="overflow-hidden rounded-3xl border border-line bg-card">
          <ul className="divide-y divide-line/80">
            {items.map((item) => (
              <li key={item.productId} className="flex gap-4 p-4 sm:p-5">
                <Link
                  href="/order"
                  className="relative size-20 shrink-0 overflow-hidden rounded-2xl bg-cream-deep sm:size-24"
                >
                  <img src={item.image} alt={item.name} className="size-full object-cover" />
                </Link>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-semibold text-ink">{item.name}</h2>
                      <p className="mt-0.5 text-xs text-muted">
                        {formatPeso(item.price)} per serving
                      </p>
                    </div>
                    <p className="shrink-0 font-semibold text-ink">
                      {formatPeso(item.price * item.quantity)}
                    </p>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <QuantityStepper
                      value={item.quantity}
                      onChange={(next) => setQuantity(item.productId, next)}
                      label={item.name}
                      size="sm"
                      min={0}
                    />
                    <button
                      type="button"
                      onClick={() => setRemoveTarget(item)}
                      className="text-xs font-semibold text-muted underline-offset-2 transition hover:text-brand hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/80 bg-cream/50 px-4 py-3.5 sm:px-5">
            <button
              type="button"
              onClick={() => setClearOpen(true)}
              className="text-xs font-semibold text-muted transition hover:text-brand"
            >
              Clear the bag
            </button>
            <p className="text-[11px] text-muted">
              You can review everything again at checkout.
            </p>
          </div>
        </div>

        <aside className="lg:sticky lg:top-24">
          <div className="rounded-3xl border border-line bg-card p-5 shadow-lift sm:p-6">
            <h2 className="text-xl text-ink">Order summary</h2>

            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Subtotal</dt>
                <dd className="font-semibold text-ink">{formatPeso(totals.subtotal)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Delivery fee</dt>
                <dd className="font-semibold text-ink">
                  {totals.deliveryFee === 0 ? (
                    <span className="text-leaf">Free</span>
                  ) : (
                    formatPeso(totals.deliveryFee)
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-line pt-3 text-base">
                <dt className="font-semibold text-ink">Total</dt>
                <dd className="font-display text-2xl font-semibold text-brand">
                  {formatPeso(totals.total)}
                </dd>
              </div>
            </dl>

            <div className="mt-4 rounded-2xl bg-cream/70 p-3">
              <div className="flex items-center justify-between text-[11px] font-semibold text-muted">
                <span>
                  {totals.freeDelivery
                    ? "Free delivery unlocked"
                    : `${formatPeso(totals.remainingForFreeDelivery)} away from free delivery`}
                </span>
                <span className="tabular-nums">{progress}%</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-mango to-brand transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <Link
              href="/checkout"
              className={buttonStyles("primary", "lg", "mt-5 w-full")}
            >
              Go to checkout
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14m0 0-5-5m5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>

            <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted">
              <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="4.5" y="10" width="15" height="10" rx="2.5" />
                <path d="M8 10V7.5a4 4 0 0 1 8 0V10" strokeLinecap="round" />
              </svg>
              Secure checkout with PayMongo
            </p>
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={Boolean(removeTarget)}
        title="Remove this dish?"
        description={
          removeTarget
            ? `${removeTarget.name} will be taken out of your bag. You can always add it again from the menu.`
            : ""
        }
        confirmLabel="Remove"
        cancelLabel="Keep it"
        onClose={() => setRemoveTarget(null)}
        onConfirm={() => {
          if (removeTarget) remove(removeTarget.productId);
          setRemoveTarget(null);
        }}
      />

      <ConfirmDialog
        open={clearOpen}
        title="Clear your whole bag?"
        description="Every dish and quantity will be removed. This cannot be undone."
        confirmLabel="Clear bag"
        cancelLabel="Keep my dishes"
        onClose={() => setClearOpen(false)}
        onConfirm={() => {
          clear();
          setClearOpen(false);
        }}
      />
    </div>
  );
}
