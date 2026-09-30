import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

const logoSrc = `${BRAND.logoPath}?v=${BRAND.logoCache}`;

export function BrandMark({
  className,
  imageClassName,
  variant = "full",
}: {
  className?: string;
  imageClassName?: string;
  variant?: "full" | "mark" | "header";
}) {
  const isHeader = variant === "header";
  const isMark = variant === "mark";

  return (
    <div className={cn("flex min-w-0 items-center", className)}>
      <div className="flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- official PNG; skip Next image cache of the old generated mark */}
        <img
          src={logoSrc}
          alt={`${BRAND.name} logo`}
          width={isHeader ? 71 : 358}
          height={isHeader ? 56 : 283}
          className={cn(
            "object-contain",
            isHeader
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
