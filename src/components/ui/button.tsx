import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/format";
import { Spinner } from "./spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "dark" | "mango";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-white hover:bg-brand-dark shadow-[0_16px_34px_-20px_rgba(223,68,46,0.95)]",
  secondary:
    "bg-white text-ink border border-line hover:border-ink/25 hover:bg-cream-deep/40",
  ghost: "text-muted hover:text-ink hover:bg-ink/5",
  danger: "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100",
  dark: "bg-ink text-cream hover:bg-ink/90",
  mango: "bg-mango text-ink hover:bg-[#e29a12]",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-4 text-[13px] gap-1.5",
  md: "h-11 px-5 text-sm gap-2",
  lg: "h-[52px] px-7 text-base gap-2.5",
  icon: "size-10 p-0",
};

export function buttonStyles(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
) {
  return cn(
    "inline-flex select-none items-center justify-center rounded-full font-semibold transition-all duration-200 disabled:pointer-events-none disabled:opacity-55 active:scale-[0.985]",
    variants[variant],
    sizes[size],
    className,
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={buttonStyles(variant, size, className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}
