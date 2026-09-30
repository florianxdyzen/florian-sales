import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

const logoSrc = `${BRAND.logoPath}?v=${BRAND.logoCache}`;

export function BrandMark({
  className,
  imageClassName,
  variant = "full",
  plate = "none",
}: {
  className?: string;
  imageClassName?: string;
  variant?: "full" | "mark" | "header";
  /** White circle behind the lockup. Used on the login page. */
  plate?: "none" | "circle";
}) {
  const isHeader = variant === "header";
  const isMark = variant === "mark";
  const circled = plate === "circle";

  return (
    <div className={cn("flex min-w-0 items-center", className)}>
      <div
        className={cn(
          "flex items-center justify-center",
          circled &&
            "size-40 rounded-full bg-white p-5 shadow-[0_12px_32px_rgba(0,0,0,0.22)] ring-1 ring-white sm:size-44"
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- official PNG; skip Next image cache of the old generated mark */}
        <img
          src={logoSrc}
          alt={`${BRAND.name} logo`}
          width={isHeader ? 71 : 358}
          height={isHeader ? 56 : 283}
          className={cn(
            "object-contain",
            circled
              ? "h-auto w-full"
              : isHeader
                ? "h-14 w-auto"
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
