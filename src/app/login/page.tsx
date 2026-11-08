import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { demoAccount, getSession } from "@/server/auth";
import { LoginForm } from "@/components/auth/login-form";
import { Logo } from "@/components/ui/logo";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getSession();
  if (session) redirect("/order");

  const params = await searchParams;
  const requested = params.next ?? "";
  const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/order";
  const demo = demoAccount();

  return (
    <div className="grid min-h-dvh bg-cream lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-ink p-10 text-cream lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div className="pattern-grid absolute inset-0 opacity-70" />
        <div
          aria-hidden="true"
          className="absolute -top-24 -right-24 size-[28rem] rounded-full bg-brand/35 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-32 -left-16 size-[26rem] rounded-full bg-mango/20 blur-3xl"
        />

        <div className="relative">
          <Logo tone="cream" />
          <div className="mt-14 max-w-lg">
            <p className="text-[11px] font-bold tracking-[0.24em] text-mango uppercase">
              Sarap ng sama-sama
            </p>
            <h1 className="mt-4 text-5xl leading-[1.02] text-cream xl:text-6xl">
              Kain na,
              <br />
              <span className="text-mango">tayo na.</span>
            </h1>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-cream/70">
              Filipino comfort food, cooked with care and delivered warm. Browse today&apos;s
              live menu, build your plate, and pay securely.
            </p>
          </div>
        </div>

        <div className="relative mt-10 grid gap-4 sm:grid-cols-2">
          <div className="rounded-3xl border border-cream/10 bg-cream/5 p-5">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-mango/15 text-mango">
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                <path d="M4 10h16a8 8 0 0 1-16 0Z" strokeLinejoin="round" />
                <path d="M8 6c0-1 1-2 1-2M12 6c0-1 1-2 1-2M16 6c0-1 1-2 1-2" strokeLinecap="round" />
                <path d="M8 18h8" strokeLinecap="round" />
              </svg>
            </span>
            <p className="mt-4 text-sm font-semibold text-cream">Live menu</p>
            <p className="mt-1.5 text-xs leading-relaxed text-cream/60">
              Dishes, categories, prices, and availability come from the kitchen&apos;s
              records.
            </p>
          </div>
          <div className="rounded-3xl border border-cream/10 bg-cream/5 p-5 sm:translate-y-6">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-brand/20 text-mango">
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="3" />
                <path d="M3 10h18M7 15h3" strokeLinecap="round" />
              </svg>
            </span>
            <p className="mt-4 text-sm font-semibold text-cream">Secure checkout</p>
            <p className="mt-1.5 text-xs leading-relaxed text-cream/60">
              Pay with GCash, Maya, or card — encrypted and verified on our
              servers.
            </p>
          </div>
        </div>

        <div className="relative mt-14 flex items-center gap-3 border-t border-cream/10 pt-6">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-leaf/15 text-leaf">
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <p className="text-xs leading-relaxed text-cream/60">
            <span className="font-semibold text-cream">Always up to date.</span> The menu
            syncs with the kitchen&apos;s latest records.
          </p>
        </div>
      </aside>

      <main className="relative flex flex-col">
        <div className="flex items-center justify-between border-b border-line/70 px-5 py-4 lg:hidden">
          <Logo />
          <span className="rounded-full border border-line bg-card px-3 py-1 text-[10px] font-bold tracking-[0.14em] text-muted uppercase">
            Sign in
          </span>
        </div>

        <div className="pattern-dots flex flex-1 items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
          <div className="w-full max-w-md lg:max-w-lg">
            <LoginForm
              next={next}
              demoEmail={demo.email}
              demoPassword={demo.password}
              demoName={demo.name}
            />
          </div>
        </div>

        <div className="border-t border-line/70 px-6 py-4 text-center text-[11px] text-muted">
          KainTayo · Filipino comfort food · Metro Manila delivery
        </div>
      </main>
    </div>
  );
}
