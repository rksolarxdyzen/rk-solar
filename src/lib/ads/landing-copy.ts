import { BRAND as QUOTE_BRAND } from "@/lib/quotations/brand";

export const ADS_LANDING = {
  brand: QUOTE_BRAND.name,
  shortBrand: QUOTE_BRAND.shortName,
  headline: `${QUOTE_BRAND.heroLine1} ${QUOTE_BRAND.heroLine2} ${QUOTE_BRAND.heroLine3}`,
  sub: QUOTE_BRAND.heroSub,
  coverTagline: QUOTE_BRAND.coverTagline,
  ctaPrimary: "Get a free quote",
  ctaCall: "Call us",
  formTitle: "Get a free rooftop quote",
  formSub: "Share your details — we’ll call you back shortly.",
  successTitle: "Thank you",
  successBody: "Our team will contact you shortly.",
  trustLine: QUOTE_BRAND.quotationTagline,
  services: QUOTE_BRAND.services,
  benefits: QUOTE_BRAND.benefits.slice(0, 4),
  coverImage: QUOTE_BRAND.logo.coverHome,
  poweredBy: QUOTE_BRAND.poweredBy,
  colors: QUOTE_BRAND.colors,
} as const;

export function adsPhoneFromEnv(): string | null {
  const raw = (process.env.NEXT_PUBLIC_ADS_PHONE ?? "").trim();
  return raw || null;
}
