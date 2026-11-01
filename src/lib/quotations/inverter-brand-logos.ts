/**
 * Built-in inverter brand logos for the quotation BOM Brand column.
 * Uploaded brand logos (quote_brands.logo_url) take priority when snapshotted on the line item.
 */
const INVERTER_BRAND_LOGOS: Record<string, string> = {
  polycab: "/brand/inverters/polycab.png",
};

function normalizeInverterBrandKey(brand: string): string {
  return brand
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\binverter\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Returns a public URL for a known inverter brand logo, or null if unknown. */
export function resolveInverterBrandImageUrl(brand: string | null | undefined): string | null {
  if (!brand?.trim()) return null;
  const key = normalizeInverterBrandKey(brand);
  if (INVERTER_BRAND_LOGOS[key]) return INVERTER_BRAND_LOGOS[key];
  for (const [known, url] of Object.entries(INVERTER_BRAND_LOGOS)) {
    if (key === known || key.startsWith(`${known} `) || key.includes(known)) return url;
  }
  return null;
}
