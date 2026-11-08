import type { ReactNode } from "react";
import { cn } from "@/lib/format";

export type BadgeTone = "brand" | "mango" | "leaf" | "neutral" | "blue" | "dark" | "red";

const tones: Record<BadgeTone, string> = {
  brand: "bg-brand/10 text-brand-dark",
  mango: "bg-mango/20 text-[#8a5a06]",
  leaf: "bg-leaf/10 text-leaf",
  neutral: "bg-cream-deep text-muted",
  blue: "bg-blue-50 text-blue-700",
  dark: "bg-ink text-cream",
  red: "bg-red-50 text-red-700",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide uppercase",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const statusTone: Record<string, BadgeTone> = {
  paid: "leaf",
  pending: "mango",
  failed: "red",
  cancelled: "neutral",
};

export function StatusBadge({ status }: { status: string }) {
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <Badge tone={statusTone[status] ?? "neutral"}>
      <span
        className={cn(
          "size-1.5 rounded-full",
          status === "paid" && "bg-leaf",
          status === "pending" && "bg-mango",
          status === "failed" && "bg-red-500",
          status === "cancelled" && "bg-muted",
        )}
      />
      {label}
    </Badge>
  );
}
