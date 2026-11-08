"use client";

import { useEffect } from "react";
import Link from "next/link";
import { buttonStyles } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[kaintayo]", error);
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-cream px-5 py-12">
      <div className="w-full max-w-lg rounded-4xl border border-line bg-card p-8 text-center shadow-lift">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-brand/10 text-brand">
          <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 8v5M12 16.5v.5" strokeLinecap="round" />
            <circle cx="12" cy="12" r="9" />
          </svg>
        </div>
        <h1 className="mt-5 text-3xl text-ink">Something burnt in the kitchen</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          An unexpected error interrupted this page. Your cart is safe — try again, or head
          back to the menu.
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-[11px] text-muted">digest · {error.digest}</p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={reset} className={buttonStyles("primary", "md")}>
            Try again
          </button>
          <Link href="/order" className={buttonStyles("secondary", "md")}>
            Back to menu
          </Link>
        </div>
      </div>
    </div>
  );
}
