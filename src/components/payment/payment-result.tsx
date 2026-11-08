"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Order, OrderStatus } from "@/lib/types";
import { PAYMENT_METHODS } from "@/lib/types";
import { api, ApiClientError } from "@/lib/api-client";
import { formatDateTime, formatPeso } from "@/lib/format";
import { useCart } from "@/components/providers/cart-provider";
import { useToast } from "@/components/providers/toast-provider";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { buttonStyles, Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Spinner } from "@/components/ui/spinner";

type LoadState = "loading" | "ready" | "notfound" | "error";

const MAX_POLLS = 5;

const statusCopy: Record<
  OrderStatus,
  { title: string; description: string; tone: "leaf" | "mango" | "red" | "neutral" }
> = {
  paid: {
    title: "Payment confirmed",
    description: "Salamat! The kitchen has your order and will start cooking shortly.",
    tone: "leaf",
  },
  pending: {
    title: "Confirming your payment",
    description:
      "We're checking the payment with PayMongo. This usually takes a few seconds — no need to refresh.",
    tone: "mango",
  },
  failed: {
    title: "Payment failed",
    description: "The payment didn't go through. You can try again with another method.",
    tone: "red",
  },
  cancelled: {
    title: "Payment cancelled",
    description: "You backed out of checkout, so nothing was charged. Your bag is still saved.",
    tone: "neutral",
  },
};

export function PaymentResult({ reference }: { reference: string }) {
  const { clear } = useCart();
  const { push } = useToast();
  const [order, setOrder] = useState<Order | null>(null);
  const [state, setState] = useState<LoadState>(reference ? "loading" : "notfound");
  const [warning, setWarning] = useState("");
  const [checking, setChecking] = useState(false);
  const cleared = useRef(false);

  const load = useCallback(async () => {
    if (!reference) return null;
    try {
      const data = await api<{ order: Order; warning?: string; verified?: boolean }>(
        `/api/payments/${encodeURIComponent(reference)}`,
      );
      setOrder(data.order);
      setState("ready");
      setWarning(data.warning ?? "");
      return data.order;
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 404) {
        setState("notfound");
      } else {
        setState((current) => (current === "ready" ? current : "error"));
      }
      return null;
    }
  }, [reference]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll(attempt: number) {
      const result = await load();
      if (cancelled) return;
      if (result?.status === "pending" && attempt < MAX_POLLS) {
        timer = setTimeout(() => void poll(attempt + 1), 2600);
      }
    }

    if (reference) void poll(0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [load, reference]);

  useEffect(() => {
    if (order?.status !== "paid" || cleared.current) return;

    // Only empty the bag for the order created in this tab — opening an old
    // receipt must not wipe a cart the customer is currently building.
    let pendingReference: string | null = null;
    try {
      pendingReference = window.sessionStorage.getItem("kaintayo.pendingOrder");
    } catch {
      return;
    }
    if (pendingReference !== order.reference) return;

    cleared.current = true;
    try {
      window.sessionStorage.removeItem("kaintayo.pendingOrder");
    } catch {
      // ignore
    }
    clear();
    push({
      title: "Order paid",
      description: `Reference ${order.reference} · ${formatPeso(order.total)}`,
      variant: "success",
    });
  }, [order, clear, push]);

  async function checkAgain() {
    setChecking(true);
    const result = await load();
    setChecking(false);
    if (result?.status === "pending") {
      push({
        title: "Still waiting on PayMongo",
        description: "Give it a few more seconds, then check again.",
        variant: "info",
      });
    }
  }

  if (state === "loading") {
    return (
      <div className="container-page flex flex-col items-center justify-center py-24 text-center">
        <div className="relative flex size-16 items-center justify-center">
          <span className="absolute inset-0 rounded-full border-2 border-brand/20" />
          <span className="absolute inset-0 animate-ping rounded-full border border-brand/30" />
          <Spinner className="size-7 text-brand" />
        </div>
        <h1 className="mt-6 text-2xl text-ink">Confirming your payment…</h1>
        <p className="mt-2 max-w-sm text-sm text-muted">
          We&apos;re asking PayMongo for the trusted server-side status of{" "}
          <span className="font-mono text-xs">{reference}</span>.
        </p>
      </div>
    );
  }

  if (state === "notfound") {
    return (
      <div className="container-page py-12">
        <div className="mx-auto max-w-2xl">
          <EmptyState
            title="We couldn't find that order"
            description="The reference may be mistyped, or the order record was cleared. Check your order history for payment records."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/orders" className={buttonStyles("primary", "md")}>
                  View my orders
                </Link>
                <Link href="/order" className={buttonStyles("secondary", "md")}>
                  Back to menu
                </Link>
              </div>
            }
          />
        </div>
      </div>
    );
  }

  if (state === "error" || !order) {
    return (
      <div className="container-page py-12">
        <div className="mx-auto max-w-2xl">
          <EmptyState
            title="We couldn't verify the payment"
            description="The app could not reach the payment record. Your order was saved — check your order history or try again."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => void load()}>Try again</Button>
                <Link href="/orders" className={buttonStyles("secondary", "md")}>
                  Order history
                </Link>
              </div>
            }
          />
        </div>
      </div>
    );
  }

  const copy = statusCopy[order.status];
  const methodLabel =
    PAYMENT_METHODS.find((entry) => entry.id === order.payment.method)?.label ??
    order.payment.method;
  const providerLabel =
    order.payment.provider === "paymongo" ? "PayMongo (test mode)" : "Built-in demo gateway";

  function copyReference() {
    void navigator.clipboard
      ?.writeText(order!.reference)
      .then(() => push({ title: "Reference copied", variant: "info" }))
      .catch(() => push({ title: "Could not copy", variant: "error" }));
  }

  return (
    <div className="container-page py-8 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <section
          className={`relative overflow-hidden rounded-4xl border p-6 sm:p-8 ${
            copy.tone === "leaf"
              ? "border-leaf/20 bg-leaf/5"
              : copy.tone === "mango"
                ? "border-mango/30 bg-mango/10"
                : copy.tone === "red"
                  ? "border-red-200 bg-red-50"
                  : "border-line bg-card"
          }`}
        >
          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
            <StatusIcon status={order.status} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  tone={copy.tone === "mango" ? "mango" : copy.tone === "red" ? "red" : copy.tone}
                >
                  {order.status === "paid" ? "Paid" : order.status === "pending" ? "Pending" : order.status === "failed" ? "Failed" : "Cancelled"}
                </Badge>
                <span className="text-xs text-muted">{formatDateTime(order.createdAt)}</span>
              </div>
              <h1 className="mt-2 text-3xl text-ink sm:text-4xl">{copy.title}</h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
                {order.status === "failed" && order.payment.failureReason
                  ? order.payment.failureReason
                  : copy.description}
              </p>
            </div>
          </div>

          {order.status === "pending" ? (
            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-mango/20 pt-5">
              <Button size="sm" onClick={() => void checkAgain()} loading={checking}>
                Check payment status
              </Button>
              <Link href="/orders" className={buttonStyles("secondary", "sm")}>
                View my orders
              </Link>
              <p className="text-[11px] text-muted">
                Auto-checking {MAX_POLLS} times, then you can refresh manually.
              </p>
            </div>
          ) : null}

          {order.status === "paid" ? (
            <div className="mt-6 flex flex-wrap gap-2 border-t border-leaf/15 pt-5">
              <Link href="/order" className={buttonStyles("primary", "md")}>
                Order something else
              </Link>
              <Link href="/orders" className={buttonStyles("secondary", "md")}>
                View my orders
              </Link>
            </div>
          ) : null}

          {(order.status === "failed" || order.status === "cancelled") ? (
            <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-5">
              <Link href="/checkout" className={buttonStyles("primary", "md")}>
                Try checkout again
              </Link>
              <Link href="/order" className={buttonStyles("secondary", "md")}>
                Back to menu
              </Link>
            </div>
          ) : null}

          <span
            aria-hidden="true"
            className={`pointer-events-none absolute -right-6 -bottom-8 font-display text-[7rem] font-bold opacity-[0.05] ${
              order.status === "paid" ? "text-leaf" : "text-ink"
            }`}
          >
            {order.status === "paid" ? "PAID" : order.status.toUpperCase()}
          </span>
        </section>

        {warning ? (
          <p className="mt-4 rounded-2xl border border-mango/30 bg-mango/10 px-4 py-3 text-xs leading-relaxed text-[#7a5207]">
            {warning} The status shown is what we have stored locally; webhooks will keep it
            in sync.
          </p>
        ) : null}

        <section className="mt-5 overflow-hidden rounded-3xl border border-line bg-card">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-dashed border-line px-6 py-5">
            <div>
              <p className="text-[11px] font-bold tracking-[0.2em] text-muted uppercase">
                Receipt
              </p>
              <div className="mt-1 flex items-center gap-2">
                <p className="font-mono text-lg font-semibold text-ink">{order.reference}</p>
                <button
                  type="button"
                  onClick={copyReference}
                  className="rounded-full border border-line p-1.5 text-muted transition hover:text-ink"
                  aria-label="Copy order reference"
                  title="Copy reference"
                >
                  <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="9" y="9" width="11" height="11" rx="2" />
                    <path d="M15 6V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h1" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>
            <StatusBadge status={order.status} />
          </div>

          <div className="grid gap-6 px-6 py-5 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-bold tracking-[0.16em] text-muted uppercase">
                Deliver to
              </p>
              <p className="mt-1.5 text-sm font-semibold text-ink">{order.customer.name}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">
                {order.customer.address}
                <br />
                {order.customer.barangay}, {order.customer.city} {order.customer.postalCode}
                <br />
                {order.customer.phone} · {order.customer.email}
              </p>
              {order.customer.notes ? (
                <p className="mt-2 rounded-xl bg-cream px-2.5 py-1.5 text-[11px] text-muted">
                  “{order.customer.notes}”
                </p>
              ) : null}
            </div>

            <div>
              <p className="text-[11px] font-bold tracking-[0.16em] text-muted uppercase">
                Payment
              </p>
              <dl className="mt-1.5 space-y-1.5 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Method</dt>
                  <dd className="font-semibold text-ink">{methodLabel}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Processed by</dt>
                  <dd className="font-semibold text-ink">{providerLabel}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Provider state</dt>
                  <dd className="font-semibold text-ink">
                    {order.payment.providerStatus ?? "—"}
                  </dd>
                </div>
                {order.payment.paidAt ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Paid at</dt>
                    <dd className="font-semibold text-ink">
                      {formatDateTime(order.payment.paidAt)}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </div>

          <div className="border-t border-line px-6 py-5">
            <p className="text-[11px] font-bold tracking-[0.16em] text-muted uppercase">
              Your order
            </p>
            <ul className="mt-3 space-y-2.5">
              {order.items.map((item) => (
                <li key={item.productId} className="flex items-center gap-3">
                  <div className="size-10 shrink-0 overflow-hidden rounded-lg bg-cream-deep">
                    <img src={item.image} alt="" className="size-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{item.name}</p>
                    <p className="text-[11px] text-muted">
                      {item.quantity} × {formatPeso(item.unitPrice)}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-ink">{formatPeso(item.lineTotal)}</p>
                </li>
              ))}
            </ul>

            <dl className="mt-4 space-y-2 border-t border-dashed border-line pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Subtotal</dt>
                <dd className="text-ink">{formatPeso(order.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Delivery fee</dt>
                <dd className="text-ink">
                  {order.deliveryFee === 0 ? "Free" : formatPeso(order.deliveryFee)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between border-t border-line pt-2">
                <dt className="font-semibold text-ink">Total</dt>
                <dd className="font-display text-2xl font-semibold text-brand">
                  {formatPeso(order.total)}
                </dd>
              </div>
            </dl>
          </div>

          <details className="group border-t border-line bg-cream/40 px-6 py-4">
            <summary className="cursor-pointer list-none text-[11px] font-bold tracking-[0.14em] text-muted uppercase marker:hidden">
              <span className="inline-flex items-center gap-1.5">
                Payment audit trail
                <svg viewBox="0 0 24 24" className="size-3.5 transition group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </summary>
            <div className="mt-3 space-y-2 font-mono text-[11px] text-muted">
              {order.payment.sessionId ? (
                <p>session · {order.payment.sessionId}</p>
              ) : null}
              {order.payment.paymentIntentId ? (
                <p>intent · {order.payment.paymentIntentId}</p>
              ) : null}
              {order.payment.paymentId ? <p>payment · {order.payment.paymentId}</p> : null}
              <ul className="mt-3 space-y-1.5 border-t border-line pt-3 font-sans text-[11px]">
                {order.events.map((event, index) => (
                  <li key={`${event.at}-${index}`} className="flex flex-wrap gap-x-2">
                    <span className="tabular-nums text-muted/70">
                      {formatDateTime(event.at)}
                    </span>
                    <span className="text-ink">{event.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        </section>

        <p className="mt-4 px-1 text-center text-[11px] leading-relaxed text-muted">
          Payment status is verified on the server through PayMongo&apos;s API and webhooks.
          A checkout redirect alone never marks an order as paid.
        </p>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: OrderStatus }) {
  const tone =
    status === "paid"
      ? "bg-leaf text-white"
      : status === "pending"
        ? "bg-mango text-ink"
        : status === "failed"
          ? "bg-brand text-white"
          : "bg-cream-deep text-muted";

  return (
    <div className="relative shrink-0">
      {status === "pending" ? (
        <span className="absolute inset-0 animate-ping rounded-full bg-mango/40" />
      ) : null}
      <div className={`relative flex size-16 items-center justify-center rounded-full ${tone}`}>
        {status === "paid" ? (
          <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : status === "pending" ? (
          <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7.5V12l3 2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M7 7l10 10M17 7 7 17" strokeLinecap="round" />
          </svg>
        )}
      </div>
    </div>
  );
}
