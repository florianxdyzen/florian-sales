import { BRAND } from "@/lib/quotations/brand";

/** Print-safe wordmark for quotation headers / cover. */
export function BrandWordmark({
  size = "md",
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const height = size === "lg" ? 56 : size === "sm" ? 32 : 42;

  return (
    <div
      className={`sp-wordmark ${className}`.trim()}
      aria-label={BRAND.name}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={BRAND.logo.primary}
        alt={BRAND.name}
        className="sp-wordmark-mark"
        style={{ width: "auto", height, maxWidth: "100%", objectFit: "contain" }}
      />
      {size !== "sm" ? (
        <div className="sp-wordmark-text">
          <div className="sp-wordmark-tag">{BRAND.tagline}</div>
        </div>
      ) : null}
    </div>
  );
}
