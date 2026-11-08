import Link from "next/link";
import { buttonStyles } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-cream px-5 py-12 text-center">
      <Logo />
      <p className="mt-10 font-display text-7xl font-semibold text-brand">404</p>
      <h1 className="mt-2 text-3xl text-ink">This dish is off the menu</h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
        The page you were looking for doesn&apos;t exist — or it was eaten before you got
        here.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link href="/order" className={buttonStyles("primary", "md")}>
          Back to the menu
        </Link>
        <Link href="/orders" className={buttonStyles("secondary", "md")}>
          My orders
        </Link>
      </div>
    </div>
  );
}
