import type { CSSProperties } from "react";
import { BRAND } from "@/lib/quotations/brand";

/** Company mark: image when URL set, otherwise text wordmark (default for RK Solar). */
export function CompanyLogoMark({
  src,
  className = "",
  alt = BRAND.name,
  textStyle,
}: {
  src?: string | null;
  className?: string;
  alt?: string;
  textStyle?: CSSProperties;
}) {
  const url = src?.trim() || BRAND.logo.primary.trim();
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img className={className} src={url} alt={alt} />
    );
  }
  return (
    <div
      className={className}
      aria-label={alt}
      style={{
        fontWeight: 700,
        color: BRAND.colors.blue,
        letterSpacing: "-0.02em",
        lineHeight: 1.1,
        whiteSpace: "nowrap",
        ...textStyle,
      }}
    >
      {BRAND.name}
    </div>
  );
}
