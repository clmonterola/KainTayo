"use client";

import { cn } from "@/lib/format";

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 20,
  size = "md",
  label = "quantity",
  disabled = false,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  size?: "sm" | "md";
  label?: string;
  disabled?: boolean;
}) {
  const button =
    "flex items-center justify-center rounded-full text-ink transition hover:bg-cream-deep disabled:pointer-events-none disabled:opacity-40";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-line bg-white p-1",
        size === "sm" ? "h-9" : "h-11",
      )}
    >
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className={cn(button, size === "sm" ? "size-7" : "size-9")}
      >
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M5 12h14" strokeLinecap="round" />
        </svg>
      </button>
      <span
        aria-live="polite"
        className={cn(
          "min-w-6 text-center font-bold tabular-nums",
          size === "sm" ? "text-sm" : "text-[15px]",
        )}
      >
        {value}
      </span>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        disabled={disabled || value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className={cn(button, size === "sm" ? "size-7" : "size-9")}
      >
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
