import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

const logoSrc = `${BRAND.logoPath}?v=${BRAND.logoCache}`;

export function BrandMark({
  className,
  imageClassName,
  variant = "full",
  tone = "default",
}: {
  className?: string;
  imageClassName?: string;
  variant?: "full" | "mark" | "header";
  /** Lockup sits on a light plate when the header behind it is dark. */
  tone?: "default" | "onDark";
}) {
  const isHeader = variant === "header";
  const isMark = variant === "mark";
  const onDark = tone === "onDark";

  return (
    <div className={cn("flex min-w-0 items-center", className)}>
      <div
        className={cn(
          "flex items-center justify-center",
          onDark &&
            "rounded-full bg-white p-2.5 shadow-[0_10px_28px_rgba(0,0,0,0.22)] ring-1 ring-white/80"
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- official PNG; skip Next image cache of the old generated mark */}
        <img
          src={logoSrc}
          alt={`${BRAND.name} logo`}
          width={isHeader ? 44 : 1024}
          height={isHeader ? 44 : 1024}
          className={cn(
            "object-contain",
            isHeader
              ? "h-11 w-auto sm:h-12"
              : isMark
                ? "h-10 w-auto"
                : "h-auto w-28 max-w-full sm:w-36",
            imageClassName
          )}
        />
      </div>
    </div>
  );
}
