"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PaymentMethod } from "@/lib/types";
import { PAYMENT_METHODS } from "@/lib/types";
import { api, ApiClientError } from "@/lib/api-client";
import { formatPeso } from "@/lib/format";
import { useToast } from "@/components/providers/toast-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Outcome = "paid" | "failed" | "cancelled";

const themes: Record<PaymentMethod, { background: string; panel: string; accent: string }> = {
  gcash: {
    background: "bg-[#0066cc]",
    panel: "bg-white",
    accent: "bg-[#0070e0]",
  },
  paymaya: {
    background: "bg-[#0f9d58]",
    panel: "bg-white",
    accent: "bg-[#19b36b]",
  },
  card: {
    background: "bg-ink",
    panel: "bg-[#1b2430]",
    accent: "bg-[#273445]",
  },
};

export function MockGateway({
  reference,
  method,
  total,
  subtotal,
  deliveryFee,
  customerName,
  itemCount,
}: {
  reference: string;
  method: PaymentMethod;
  total: number;
  subtotal: number;
  deliveryFee: number;
  customerName: string;
  itemCount: number;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [busy, setBusy] = useState<Outcome | null>(null);
  const [error, setError] = useState("");
  const methodMeta = PAYMENT_METHODS.find((entry) => entry.id === method);
  const theme = themes[method];

  async function decide(outcome: Outcome) {
    setError("");
    setBusy(outcome);
    try {
      await api(`/api/payments/mock/${encodeURIComponent(reference)}`, {
        method: "POST",
        body: JSON.stringify({ outcome }),
      });

      if (outcome === "cancelled") {
        router.push(`/payment/cancel?ref=${encodeURIComponent(reference)}`);
      } else {
        router.push(`/payment/success?ref=${encodeURIComponent(reference)}`);
      }
    } catch (submitError) {
      setBusy(null);
      const message =
        submitError instanceof ApiClientError
          ? submitError.message
          : "The payment page could not process that. Please try again.";
      setError(message);
      push({ title: "Payment issue", description: message, variant: "error" });
    }
  }

  return (
    <div className={`min-h-[calc(100dvh-4.5rem)] ${theme.background} px-4 py-10 sm:py-14`}>
      <div className="mx-auto w-full max-w-md">
        <div className="mb-5 flex items-center justify-between text-cream">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] uppercase">
            <span className="flex size-7 items-center justify-center rounded-lg bg-cream text-[11px] font-black text-ink">
              KT
            </span>
            KainTayo checkout
          </div>
          <Badge tone="mango" className="bg-mango text-ink">
            Secure checkout
          </Badge>
        </div>

        <div className="overflow-hidden rounded-4xl bg-white shadow-2xl">
          <div className={`flex items-center gap-3 px-6 py-5 ${theme.accent}`}>
            <span className="flex size-11 items-center justify-center rounded-2xl bg-white/15 text-lg font-black text-white">
              {method === "card" ? (
                <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
                  <path d="M3 10h18" />
                </svg>
              ) : (
                methodMeta?.label.charAt(0)
              )}
            </span>
            <div className="text-white">
              <p className="text-sm font-semibold">{methodMeta?.label}</p>
              <p className="text-[11px] text-white/70">Encrypted · verified on our servers</p>
            </div>
          </div>

          <div className="px-6 py-6">
            <p className="text-xs font-semibold tracking-[0.14em] text-muted uppercase">
              Amount due
            </p>
            <p className="mt-1 font-display text-4xl font-semibold text-ink">
              {formatPeso(total)}
            </p>
            <p className="mt-1 text-xs text-muted">
              {itemCount} {itemCount === 1 ? "dish" : "dishes"} · for {customerName}
            </p>

            <dl className="mt-5 space-y-2 rounded-2xl bg-cream p-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Merchant</dt>
                <dd className="font-semibold text-ink">KainTayo Filipino Kitchen</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Order reference</dt>
                <dd className="font-mono text-xs font-semibold text-ink">{reference}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Subtotal</dt>
                <dd className="text-ink">{formatPeso(subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Delivery</dt>
                <dd className="text-ink">
                  {deliveryFee === 0 ? "Free" : formatPeso(deliveryFee)}
                </dd>
              </div>
            </dl>

            {error ? (
              <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </p>
            ) : null}

            <div className="mt-6 space-y-2.5">
              <Button
                className="w-full"
                size="lg"
                loading={busy === "paid"}
                disabled={busy !== null}
                onClick={() => void decide("paid")}
              >
                Authorize {formatPeso(total)}
              </Button>
              <Button
                variant="secondary"
                className="w-full"
                loading={busy === "failed"}
                disabled={busy !== null}
                onClick={() => void decide("failed")}
              >
                Decline this payment
              </Button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void decide("cancelled")}
                className="w-full py-2 text-xs font-semibold text-muted transition hover:text-ink disabled:opacity-50"
              >
                Cancel and go back
              </button>
            </div>

            <p className="mt-5 text-center text-[11px] leading-relaxed text-muted">
              Payment details are encrypted, and this order is confirmed only after
              the payment is verified on our servers.
            </p>
          </div>
        </div>

        <p className="mt-5 text-center text-[11px] text-white/70">
          Payment verified on our servers before your order is confirmed
        </p>
      </div>
    </div>
  );
}
