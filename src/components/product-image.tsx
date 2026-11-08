"use client";

import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { cn } from "@/lib/format";

type ProductImageProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src" | "alt" | "className"
> & {
  src?: string | null;
  alt: string;
  className?: string;
};

/**
 * Renders a product image with a neutral fallback. Product images can come from
 * any database/storage URL, so a missing or expired reference should never
 * break the menu layout.
 */
export function ProductImage({ src, alt, className, ...props }: ProductImageProps) {
  const [failed, setFailed] = useState(!src);

  useEffect(() => {
    setFailed(!src);
  }, [src]);

  if (!src || failed) {
    return (
      <div
        className={cn("flex items-center justify-center bg-cream-deep text-muted", className)}
        role="img"
        aria-label={alt || "Product image unavailable"}
      >
        <svg
          viewBox="0 0 24 24"
          className="size-7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="16" rx="3" />
          <circle cx="9" cy="10" r="1.5" />
          <path d="m4.5 17 5-5 3 3 2.5-2.5 4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      {...props}
      onError={() => setFailed(true)}
    />
  );
}
