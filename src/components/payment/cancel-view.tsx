"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { api } from "@/lib/api-client";
import { buttonStyles } from "@/components/ui/button";

export function CancelView({ reference }: { reference?: string }) {
  const marked = useRef(false);

  useEffect(() => {
    if (!reference || marked.current) return;
    marked.current = true;
    // Best-effort: record the cancellation, but never block the UI on it.
    void api(`/api/payments/${encodeURIComponent(reference)}/cancel`, {
      method: "POST",
    }).catch(() => undefined);
  }, [reference]);

  return (
    <div className="container-page py-12 sm:py-16">
      <div className="mx-auto max-w-2xl">
        <div className="overflow-hidden rounded-4xl border border-line bg-card p-7 text-center shadow-lift sm:p-10">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-cream-deep text-muted">
            <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5m0 0 5-5m-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <p className="mt-6 text-[11px] font-bold tracking-[0.2em] text-muted uppercase">
            Checkout cancelled
          </p>
          <h1 className="mt-2 text-3xl text-ink sm:text-4xl">No charge, no worries.</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
            You left the payment page before finishing, so nothing was charged. Your
            bag is still saved — you can pick up right where you left off.
          </p>

          {reference ? (
            <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-line bg-cream px-3.5 py-1.5 font-mono text-xs text-muted">
              Order {reference}
            </p>
          ) : null}

          <div className="mt-7 flex flex-wrap justify-center gap-2">
            <Link href="/checkout" className={buttonStyles("primary", "md")}>
              Return to checkout
            </Link>
            <Link href="/order" className={buttonStyles("secondary", "md")}>
              Back to menu
            </Link>
            <Link href="/orders" className={buttonStyles("ghost", "md")}>
              View my orders
            </Link>
          </div>

          <div className="mt-8 rounded-2xl border border-dashed border-line bg-cream/60 px-4 py-3 text-left text-[11px] leading-relaxed text-muted">
            <strong className="font-semibold text-ink">Already paid?</strong> PayMongo may
            still be confirming the transaction. Open your order history — the status there
            is driven by server-side verification and webhooks, not this page.
          </div>
        </div>
      </div>
    </div>
  );
}
