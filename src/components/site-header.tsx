"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { SessionUser } from "@/lib/types";
import { cn } from "@/lib/format";
import { useCart } from "@/components/providers/cart-provider";
import { useToast } from "@/components/providers/toast-provider";
import { Logo } from "@/components/ui/logo";

const navItems = [
  { href: "/order", label: "Menu" },
  { href: "/orders", label: "My orders" },
  { href: "/admin", label: "Manage menu" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const { count, hydrated } = useCart();
  const { push } = useToast();
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      push({ title: "Signed out", description: "See you again soon!", variant: "info" });
      router.replace("/login");
      router.refresh();
    } catch {
      push({ title: "Could not sign out", variant: "error" });
      setLoggingOut(false);
    }
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line/70 bg-cream/85 backdrop-blur-xl">
        <div className="container-page flex h-[72px] items-center justify-between gap-4">
          <Link href="/order" className="shrink-0" aria-label="KainTayo Filipino Kitchen · home">
            <Logo />
          </Link>

          <nav className="hidden items-center gap-1 rounded-full border border-line/80 bg-card/70 p-1.5 md:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-semibold transition",
                  isActive(pathname, item.href)
                    ? "bg-ink text-cream shadow-sm"
                    : "text-muted hover:bg-cream-deep/60 hover:text-ink",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/cart"
              className={cn(
                "relative inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition",
                isActive(pathname, "/cart")
                  ? "border-ink bg-ink text-cream"
                  : "border-line bg-white text-ink hover:border-ink/25",
              )}
            >
              <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 5h2l1.6 9.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L21 8H7" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="10" cy="19.5" r="1.2" />
                <circle cx="17.5" cy="19.5" r="1.2" />
              </svg>
              <span className="hidden sm:inline">Bag</span>
              {hydrated && count > 0 ? (
                <span className="flex min-w-5 items-center justify-center rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {count}
                </span>
              ) : null}
            </Link>

            <div className="hidden items-center gap-1 md:flex">
              <div className="flex flex-col items-end px-2 leading-tight">
                <span className="text-[11px] text-muted">Kumain ka na?</span>
                <span className="max-w-32 truncate text-sm font-semibold text-ink">{user.name}</span>
              </div>
              <button
                type="button"
                onClick={logout}
                disabled={loggingOut}
                title="Sign out"
                className="inline-flex size-10 items-center justify-center rounded-full border border-line bg-white text-muted transition hover:border-ink/25 hover:text-ink disabled:opacity-50"
              >
                <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M15 12H4m0 0 3-3m-3 3 3 3" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M10 5h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <button
              type="button"
              onClick={logout}
              disabled={loggingOut}
              aria-label="Sign out"
              className="inline-flex size-10 items-center justify-center rounded-full border border-line bg-white text-muted md:hidden"
            >
              <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M15 12H4m0 0 3-3m-3 3 3 3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M10 5h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-cream/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        <div className="grid grid-cols-4">
          <MobileTab href="/order" label="Menu" pathname={pathname} icon="menu" />
          <MobileTab href="/cart" label="Bag" pathname={pathname} icon="bag" badge={hydrated ? count : 0} />
          <MobileTab href="/orders" label="Orders" pathname={pathname} icon="receipt" />
          <MobileTab href="/admin" label="Manage" pathname={pathname} icon="sliders" />
        </div>
      </nav>
    </>
  );
}

function MobileTab({
  href,
  label,
  pathname,
  icon,
  badge,
}: {
  href: string;
  label: string;
  pathname: string;
  icon: "menu" | "bag" | "receipt" | "sliders";
  badge?: number;
}) {
  const active = isActive(pathname, href);
  return (
    <Link
      href={href}
      className={cn(
        "relative flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition",
        active ? "text-brand" : "text-muted",
      )}
    >
      <span className="relative">
        <svg viewBox="0 0 24 24" className="size-[22px]" fill="none" stroke="currentColor" strokeWidth="1.7">
          {icon === "menu" ? (
            <>
              <path d="M4 7h16M4 12h16M4 17h10" strokeLinecap="round" />
            </>
          ) : icon === "bag" ? (
            <>
              <path d="M5 8h14l-1 11H6L5 8Z" strokeLinejoin="round" />
              <path d="M9 8V6.5a3 3 0 0 1 6 0V8" strokeLinecap="round" />
            </>
          ) : icon === "receipt" ? (
            <>
              <path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2v-17Z" strokeLinejoin="round" />
              <path d="M9 8h6M9 12h6" strokeLinecap="round" />
            </>
          ) : (
            <>
              <path d="M4 7h10M18 7h2M4 17h6M14 17h6M4 12h4M12 12h8" strokeLinecap="round" />
              <circle cx="16" cy="7" r="2" />
              <circle cx="12" cy="17" r="2" />
              <circle cx="10" cy="12" r="2" />
            </>
          )}
        </svg>
        {badge ? (
          <span className="absolute -top-1.5 -right-2 flex min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[9px] font-bold text-white">
            {badge}
          </span>
        ) : null}
      </span>
      {label}
    </Link>
  );
}
