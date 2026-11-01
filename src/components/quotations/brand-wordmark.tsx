import { BRAND } from "@/lib/quotations/brand";

/** Print-safe text wordmark for quotation headers / cover. */
export function BrandWordmark({
  size = "md",
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const fontSize = size === "lg" ? 28 : size === "sm" ? 16 : 22;

  return (
    <div
      className={`sp-wordmark ${className}`.trim()}
      aria-label={BRAND.name}
    >
      <div
        className="sp-wordmark-mark"
        style={{
          fontWeight: 700,
          fontSize,
          lineHeight: 1.1,
          color: BRAND.colors.blue,
          letterSpacing: "-0.02em",
        }}
      >
        {BRAND.name}
      </div>
      {size !== "sm" ? (
        <div className="sp-wordmark-text">
          <div className="sp-wordmark-tag">{BRAND.tagline}</div>
        </div>
      ) : null}
    </div>
  );
}
