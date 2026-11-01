/**
 * Maps solar-module company names (rate card / brand_snapshot) to local logo assets
 * used in the quotation BOM Brand column — same pattern as fixed BOS brand images.
 */
const MODULE_BRAND_LOGOS: Record<string, string> = {
  adani: "/brand/modules/adani.png",
  waaree: "/brand/modules/waaree.png",
  waree: "/brand/modules/waaree.png",
  avaada: "/brand/modules/avaada.png",
  rayzon: "/brand/modules/rayzon.png",
  "rayzon solar": "/brand/modules/rayzon.png",
};

function normalizeModuleBrandKey(brand: string): string {
  return brand
    .trim()
    .toLowerCase()
    .replace(/[·•]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bsolar\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Returns a public URL for a known module brand logo, or null if unknown. */
export function resolveModuleBrandImageUrl(brand: string | null | undefined): string | null {
  if (!brand?.trim()) return null;
  const key = normalizeModuleBrandKey(brand);
  if (!key) return null;
  if (MODULE_BRAND_LOGOS[key]) return MODULE_BRAND_LOGOS[key];
  const first = key.split(" ")[0] ?? "";
  if (first && MODULE_BRAND_LOGOS[first]) return MODULE_BRAND_LOGOS[first];
  for (const [known, url] of Object.entries(MODULE_BRAND_LOGOS)) {
    if (key === known || key.startsWith(`${known} `)) return url;
  }
  return null;
}
