"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Order, OrderStatus } from "@/lib/types";
import { PAYMENT_METHODS } from "@/lib/types";
import { api } from "@/lib/api-client";
import { cn, formatDate, formatPeso } from "@/lib/format";
import { buttonStyles, Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { StatusBadge } from "@/components/ui/badge";

type Filter = "all" | OrderStatus;

const filters: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "paid", label: "Paid" },
  { id: "failed", label: "Failed" },
  { id: "cancelled", label: "Cancelled" },
];

export function OrdersView() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  async function load() {
    setError("");
    try {
      const data = await api<{ orders: Order[] }>("/api/orders");
      setOrders(data.orders);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load orders.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const counts = useMemo(() => {
    const base: Record<Filter, number> = {
      all: orders?.length ?? 0,
      pending: 0,
      paid: 0,
      failed: 0,
      cancelled: 0,
    };
    for (const order of orders ?? []) base[order.status] += 1;
    return base;
  }, [orders]);

  const visible = (orders ?? []).filter((order) => filter === "all" || order.status === filter);

  return (
    <div className="container-page py-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold tracking-[0.2em] text-brand uppercase">
            Your records
          </p>
          <h1 className="mt-1.5 text-3xl text-ink sm:text-4xl">My orders</h1>
          <p className="mt-1.5 text-sm text-muted">
            Every payment attempt, with the reference you can track from checkout
            to delivery.
          </p>
        </div>
        <Link href="/order" className={buttonStyles("primary", "md")}>
          Order again
        </Link>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          { label: "Orders", value: counts.all },
          { label: "Paid", value: counts.paid },
          { label: "Awaiting payment", value: counts.pending },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-line bg-card px-4 py-3">
            <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">
              {stat.label}
            </p>
            <p className="mt-0.5 font-display text-2xl font-semibold text-ink">
              {orders === null ? "—" : stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="no-scrollbar mt-6 flex gap-2 overflow-x-auto pb-1">
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            aria-pressed={filter === item.id}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-[13px] font-semibold transition",
              filter === item.id
                ? "border-ink bg-ink text-cream"
                : "border-line bg-white text-muted hover:text-ink",
            )}
          >
            {item.label}
            <span
              className={cn(
                "rounded-full px-1.5 text-[10px] font-bold tabular-nums",
                filter === item.id ? "bg-cream/20 text-cream" : "bg-cream-deep text-muted",
              )}
            >
              {counts[item.id]}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {orders === null && !error
          ? Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="rounded-3xl border border-line bg-card p-4">
                <div className="flex items-center gap-4">
                  <Skeleton className="size-16 rounded-2xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-4 w-52" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-7 w-20 rounded-full" />
                </div>
              </div>
            ))
          : null}

        {error ? (
          <EmptyState
            title="We couldn't load your orders"
            description={error}
            action={<Button onClick={() => void load()}>Try again</Button>}
          />
        ) : null}

        {orders !== null && !error && visible.length === 0 ? (
          <EmptyState
            title={counts.all === 0 ? "No orders yet" : "Nothing in this status"}
            description={
              counts.all === 0
                ? "Your payment records will appear here once you place your first order."
                : "Try another filter, or place a new order to add to your history."
            }
            action={
              counts.all === 0 ? (
                <Link href="/order" className={buttonStyles("primary", "md")}>
                  Browse the menu
                </Link>
              ) : (
                <Button variant="secondary" onClick={() => setFilter("all")}>
                  Show all orders
                </Button>
              )
            }
          />
        ) : null}

        {visible.map((order) => (
          <OrderRow key={order.reference} order={order} />
        ))}
      </div>

      <p className="mt-6 text-center text-[11px] leading-relaxed text-muted">
        Orders and payment records are stored securely and updated automatically
        through server-side payment verification.
      </p>
    </div>
  );
}

function OrderRow({ order }: { order: Order }) {
  const methodLabel =
    PAYMENT_METHODS.find((entry) => entry.id === order.payment.method)?.label ??
    order.payment.method;

  return (
    <article className="rounded-3xl border border-line bg-card p-4 transition hover:border-brand/25 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex -space-x-3">
          {order.items.slice(0, 3).map((item) => (
            <div
              key={item.productId}
              className="size-14 overflow-hidden rounded-2xl border-2 border-card bg-cream-deep"
            >
              <img src={item.image} alt="" className="size-full object-cover" />
            </div>
          ))}
          {order.items.length > 3 ? (
            <div className="flex size-14 items-center justify-center rounded-2xl border-2 border-card bg-cream-deep text-xs font-bold text-muted">
              +{order.items.length - 3}
            </div>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-xs font-semibold text-muted">{order.reference}</p>
            <StatusBadge status={order.status} />
          </div>
          <p className="mt-1 truncate text-sm font-semibold text-ink">
            {order.items.map((item) => `${item.quantity}× ${item.name}`).join(", ")}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">
            {formatDate(order.createdAt)} · {methodLabel} · {order.items.length}{" "}
            {order.items.length === 1 ? "dish" : "dishes"}
          </p>
        </div>

        <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
          <p className="font-display text-xl font-semibold text-brand">
            {formatPeso(order.total)}
          </p>
          <Link
            href={`/payment/success?ref=${encodeURIComponent(order.reference)}`}
            className="text-xs font-semibold text-brand hover:text-brand-dark"
          >
            View receipt →
          </Link>
        </div>
      </div>
    </article>
  );
}
