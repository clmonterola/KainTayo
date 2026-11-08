"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import type { Customer, PaymentMethod } from "@/lib/types";
import { PAYMENT_METHODS } from "@/lib/types";
import { api, ApiClientError } from "@/lib/api-client";
import { formatPeso } from "@/lib/format";
import { computeTotals } from "@/lib/pricing";
import { hasErrors, validateCustomer, type FieldErrors } from "@/lib/validation";
import { useCart } from "@/components/providers/cart-provider";
import { useToast } from "@/components/providers/toast-provider";
import { buttonStyles } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

type CreatePaymentResponse = {
  reference: string;
  checkoutUrl: string;
  mode: "paymongo" | "demo";
  total: number;
};

const METHOD_MARKS: Record<PaymentMethod, ReactNode> = {
  gcash: (
    <span className="flex size-9 items-center justify-center rounded-xl bg-[#0070e0] text-sm font-black text-white">
      G
    </span>
  ),
  paymaya: (
    <span className="flex size-9 items-center justify-center rounded-xl bg-[#19b36b] text-sm font-black text-white">
      M
    </span>
  ),
  card: (
    <span className="flex size-9 items-center justify-center rounded-xl bg-ink text-cream">
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
        <path d="M3 10h18" />
      </svg>
    </span>
  ),
};

export function CheckoutForm({
  mode,
  defaultName,
  defaultEmail,
}: {
  mode: "paymongo" | "demo";
  defaultName: string;
  defaultEmail: string;
}) {
  const router = useRouter();
  const { items, hydrated, count } = useCart();
  const { push } = useToast();

  const [customer, setCustomer] = useState<Customer>({
    name: defaultName,
    email: defaultEmail,
    phone: "",
    address: "",
    barangay: "",
    city: "",
    postalCode: "",
    notes: "",
  });
  const [method, setMethod] = useState<PaymentMethod>("gcash");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const totals = computeTotals(items);

  function update<K extends keyof Customer>(key: K, value: Customer[K]) {
    setCustomer((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: "" }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBanner("");

    const localErrors = validateCustomer(customer);
    if (hasErrors(localErrors)) {
      setErrors(localErrors);
      const first = Object.keys(localErrors)[0];
      document.getElementById(first)?.focus();
      push({
        title: "Check your details",
        description: "A few fields still need your attention.",
        variant: "error",
      });
      return;
    }

    if (items.length === 0) {
      setBanner("Your bag is empty. Add a dish before checking out.");
      return;
    }

    setErrors({});
    setSubmitting(true);

    try {
      const result = await api<CreatePaymentResponse>("/api/payments/create", {
        method: "POST",
        body: JSON.stringify({
          customer,
          method,
          items: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        }),
      });

      push({
        title:
          result.mode === "paymongo"
            ? "Redirecting to secure checkout"
            : "Opening secure checkout",
        description: `Order ${result.reference} · ${formatPeso(result.total)}`,
        variant: "info",
      });

      // Remember which order this tab is paying for so the receipt only clears
      // the cart for a fresh payment, never for an old receipt.
      try {
        window.sessionStorage.setItem("kaintayo.pendingOrder", result.reference);
      } catch {
        // Storage may be unavailable in private modes; the receipt still works.
      }

      // Demo checkout stays in-app; PayMongo takes over the browser.
      if (result.mode === "paymongo") {
        window.location.assign(result.checkoutUrl);
      } else {
        router.push(result.checkoutUrl);
      }
    } catch (error) {
      setSubmitting(false);
      if (error instanceof ApiClientError) {
        setBanner(error.message);
        if (error.fields) {
          setErrors(error.fields);
          const first = Object.keys(error.fields)[0];
          document.getElementById(first)?.focus();
        }
        push({ title: "Could not start checkout", description: error.message, variant: "error" });
      } else {
        setBanner("Something went wrong while preparing your payment. Please try again.");
        push({ title: "Unexpected error", variant: "error" });
      }
    }
  }

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
            title="Nothing to check out yet"
            description="Your bag is empty, so there's no payment to prepare. Browse the menu and add a few dishes first."
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold tracking-[0.2em] text-brand uppercase">
            Step 2 of 3 · almost there
          </p>
          <h1 className="mt-1.5 text-3xl text-ink sm:text-4xl">Checkout</h1>
          <p className="mt-1.5 text-sm text-muted">
            Tell us where to bring the food and how you&apos;d like to pay.
          </p>
        </div>
        <Link href="/cart" className="text-sm font-semibold text-brand hover:text-brand-dark">
          ← Back to bag
        </Link>
      </div>

      <form onSubmit={onSubmit} noValidate className="mt-7 grid gap-6 lg:grid-cols-[1.55fr_0.9fr] lg:items-start">
        <div className="space-y-5">
          {banner ? (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              <svg viewBox="0 0 24 24" className="mt-0.5 size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5M12 16.5v.5" strokeLinecap="round" />
              </svg>
              <span>{banner}</span>
            </div>
          ) : null}

          <Section step="1" title="Contact details" hint="We'll send your receipt here.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" htmlFor="name" error={errors.name} required>
                <Input
                  id="name"
                  name="name"
                  autoComplete="name"
                  placeholder="Juan Dela Cruz"
                  value={customer.name}
                  onChange={(event) => update("name", event.target.value)}
                  invalid={Boolean(errors.name)}
                />
              </Field>
              <Field label="Email address" htmlFor="email" error={errors.email} required>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="juan@email.com"
                  value={customer.email}
                  onChange={(event) => update("email", event.target.value)}
                  invalid={Boolean(errors.email)}
                />
              </Field>
              <Field
                label="Mobile number"
                htmlFor="phone"
                error={errors.phone}
                hint="GCash and Maya receipts go to this number."
                required
                className="sm:col-span-2"
              >
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="0917 123 4567"
                  value={customer.phone}
                  onChange={(event) => update("phone", event.target.value)}
                  invalid={Boolean(errors.phone)}
                />
              </Field>
            </div>
          </Section>

          <Section step="2" title="Delivery address" hint="Metro Manila only.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="House number, street, landmark"
                htmlFor="address"
                error={errors.address}
                required
                className="sm:col-span-2"
              >
                <Input
                  id="address"
                  name="address"
                  autoComplete="street-address"
                  placeholder="123 Mabini Street, near the barangay hall"
                  value={customer.address}
                  onChange={(event) => update("address", event.target.value)}
                  invalid={Boolean(errors.address)}
                />
              </Field>
              <Field label="Barangay" htmlFor="barangay" error={errors.barangay} required>
                <Input
                  id="barangay"
                  name="barangay"
                  placeholder="Poblacion"
                  value={customer.barangay}
                  onChange={(event) => update("barangay", event.target.value)}
                  invalid={Boolean(errors.barangay)}
                />
              </Field>
              <Field label="City / municipality" htmlFor="city" error={errors.city} required>
                <Input
                  id="city"
                  name="city"
                  autoComplete="address-level2"
                  placeholder="Makati City"
                  value={customer.city}
                  onChange={(event) => update("city", event.target.value)}
                  invalid={Boolean(errors.city)}
                />
              </Field>
              <Field label="Postal code" htmlFor="postalCode" error={errors.postalCode} required>
                <Input
                  id="postalCode"
                  name="postalCode"
                  inputMode="numeric"
                  maxLength={4}
                  autoComplete="postal-code"
                  placeholder="1200"
                  value={customer.postalCode}
                  onChange={(event) =>
                    update("postalCode", event.target.value.replace(/\D/g, "").slice(0, 4))
                  }
                  invalid={Boolean(errors.postalCode)}
                />
              </Field>
              <Field
                label="Delivery notes (optional)"
                htmlFor="notes"
                error={errors.notes}
                hint="Gate code, floor, or “extra sauce please”."
                className="sm:col-span-2"
              >
                <Textarea
                  id="notes"
                  name="notes"
                  maxLength={240}
                  placeholder="Leave at the lobby guard, please call when nearby."
                  value={customer.notes}
                  onChange={(event) => update("notes", event.target.value)}
                  invalid={Boolean(errors.notes)}
                />
              </Field>
            </div>
          </Section>

          <Section
            step="3"
            title="Payment method"
            hint="You'll continue to a secure payment page to finish this order."
          >
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Payment method">
                {PAYMENT_METHODS.map((option) => {
                  const active = method === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setMethod(option.id)}
                      className={
                        active
                          ? "flex items-center gap-3 rounded-2xl border-2 border-brand bg-brand/5 p-3.5 text-left transition"
                          : "flex items-center gap-3 rounded-2xl border-2 border-line bg-white p-3.5 text-left transition hover:border-ink/20"
                      }
                    >
                      {METHOD_MARKS[option.id]}
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                          {option.label}
                          {active ? (
                            <svg viewBox="0 0 24 24" className="size-4 text-brand" fill="none" stroke="currentColor" strokeWidth="2.6">
                              <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-muted">
                          {option.blurb}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <div
                className={
                  mode === "paymongo"
                    ? "flex items-start gap-2.5 rounded-2xl border border-leaf/20 bg-leaf/5 px-4 py-3 text-xs leading-relaxed text-leaf"
                    : "flex items-start gap-2.5 rounded-2xl border border-mango/30 bg-mango/10 px-4 py-3 text-xs leading-relaxed text-[#7a5207]"
                }
              >
                <svg viewBox="0 0 24 24" className="mt-0.5 size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 11v5M12 7.5v.5" strokeLinecap="round" />
                </svg>
                {mode === "paymongo" ? (
                  <span>
                    <strong className="font-semibold">Secure checkout.</strong> You&apos;ll
                    be taken to an encrypted payment page hosted by our payment
                    provider to authorise this order. Your card and wallet details
                    are never stored on our servers.
                  </span>
                ) : (
                  <span>
                    <strong className="font-semibold">Secure checkout.</strong> You&apos;ll
                    confirm this payment on an encrypted page, and our servers
                    verify it before your order is sent to the kitchen.
                  </span>
                )}
              </div>
            </div>
          </Section>

          <p className="px-1 text-[11px] leading-relaxed text-muted">
            By placing this order you confirm the delivery details above and agree
            to the KainTayo terms of service. Payment is encrypted and verified on
            our servers before your order is confirmed.
          </p>
        </div>

        <aside className="lg:sticky lg:top-24">
          <div className="rounded-3xl border border-line bg-card p-5 shadow-lift sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl text-ink">Order summary</h2>
              <Link href="/cart" className="text-xs font-semibold text-brand hover:text-brand-dark">
                Edit
              </Link>
            </div>

            <ul className="mt-4 max-h-64 space-y-3 overflow-y-auto pr-1">
              {items.map((item) => (
                <li key={item.productId} className="flex items-center gap-3">
                  <div className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-cream-deep">
                    <img src={item.image} alt="" className="size-full object-cover" />
                    <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-ink text-[10px] font-bold text-cream">
                      {item.quantity}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{item.name}</p>
                    <p className="text-[11px] text-muted">{formatPeso(item.price)} each</p>
                  </div>
                  <p className="text-sm font-semibold text-ink">
                    {formatPeso(item.price * item.quantity)}
                  </p>
                </li>
              ))}
            </ul>

            <dl className="mt-5 space-y-2.5 border-t border-line pt-4 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Subtotal ({count} servings)</dt>
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
              <div className="flex justify-between gap-3 border-t border-line pt-3">
                <dt className="font-semibold text-ink">Total</dt>
                <dd className="font-display text-2xl font-semibold text-brand">
                  {formatPeso(totals.total)}
                </dd>
              </div>
            </dl>

            <Button type="submit" size="lg" className="mt-5 w-full" loading={submitting}>
              {submitting
                ? "Preparing payment…"
                : `Pay ${formatPeso(totals.total)}`}
            </Button>

            <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted">
              <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="4.5" y="10" width="15" height="10" rx="2.5" />
                <path d="M8 10V7.5a4 4 0 0 1 8 0V10" strokeLinecap="round" />
              </svg>
              Encrypted · verified server-side
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
}

function Section({
  step,
  title,
  hint,
  children,
}: {
  step: string;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-line bg-card p-5 sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-bold text-cream">
          {step}
        </span>
        <div>
          <h2 className="text-lg text-ink">{title}</h2>
          <p className="text-xs text-muted">{hint}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
