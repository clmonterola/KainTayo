import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line/70 bg-cream-deep/40 pb-10">
      <div className="container-page grid gap-8 pt-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-56 text-sm leading-relaxed text-muted">
            Filipino comfort food, cooked slow and delivered warm. Sarap ng
            sama-sama.
          </p>
        </div>
        <div>
          <p className="text-[11px] font-bold tracking-[0.18em] text-muted uppercase">Order</p>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li><Link className="hover:text-ink" href="/order">Full menu</Link></li>
            <li><Link className="hover:text-ink" href="/cart">Your bag</Link></li>
            <li><Link className="hover:text-ink" href="/orders">Order history</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-[11px] font-bold tracking-[0.18em] text-muted uppercase">Kitchen</p>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>Open daily · 10:00 AM – 9:00 PM</li>
            <li>Delivery in 35–50 minutes</li>
            <li>Free delivery over ₱999</li>
          </ul>
        </div>
        <div className="rounded-3xl border border-line bg-card p-4">
          <p className="text-sm font-semibold text-ink">Demo mode</p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            Payments run through PayMongo test mode or the built-in demo gateway.
            No real money is charged.
          </p>
          <p className="mt-3 text-[10px] font-semibold tracking-[0.16em] text-muted uppercase">
            Secured by PayMongo
          </p>
        </div>
      </div>
      <div className="container-page mt-8 flex flex-col gap-2 border-t border-line/70 pt-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} KainTayo. A demo for learning, not a real restaurant.</p>
        <p>Made with rice, rain, and React.</p>
      </div>
    </footer>
  );
}
