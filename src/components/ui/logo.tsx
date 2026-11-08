import { cn } from "@/lib/format";

export function Logo({
  className,
  compact = false,
  tone = "ink",
}: {
  className?: string;
  compact?: boolean;
  tone?: "ink" | "cream";
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "relative flex size-10 items-center justify-center rounded-2xl shadow-[0_10px_20px_-12px_rgba(223,68,46,0.9)]",
          tone === "ink" ? "bg-brand text-white" : "bg-cream text-brand",
        )}
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path
            d="M3.5 11.5h17c0 4.6-3.8 8.3-8.5 8.3s-8.5-3.7-8.5-8.3Z"
            strokeLinejoin="round"
          />
          <path d="M3.5 11.5c0-1 .8-1.7 1.7-1.7h13.6c1 0 1.7.8 1.7 1.7" strokeLinecap="round" />
          <path d="M8 6.6c0-1.3 1-1.9 1-3M12 6c0-1.4 1.1-2 1.1-3.2M16 6.6c0-1.3 1-1.9 1-3" strokeLinecap="round" />
        </svg>
      </span>
      {!compact ? (
        <span className="leading-none">
          <span
            className={cn(
              "block font-display text-[1.35rem] font-semibold tracking-tight",
              tone === "ink" ? "text-ink" : "text-cream",
            )}
          >
            KainTayo
          </span>
          <span
            className={cn(
              "mt-0.5 block text-[10px] font-semibold tracking-[0.22em] uppercase",
              tone === "ink" ? "text-muted" : "text-cream/60",
            )}
          >
            Filipino kitchen
          </span>
        </span>
      ) : null}
    </span>
  );
}
