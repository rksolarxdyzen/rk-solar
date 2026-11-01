import { type CatalogItem } from "@/lib/quotations/types";
import type { ProposalLineItem } from "@/lib/quotations/solar-proposal-calculations";

export type BomTier = "premium" | "regular";

export function tierFromQuote(quote: {
  tier_type?: string | null;
  template_kind?: string | null;
}): BomTier {
  if (quote.tier_type === "regular") return "regular";
  if (quote.tier_type === "premium") return "premium";
  if (quote.template_kind === "premium") return "premium";
  return "premium";
}

/** Load BOM catalogue rows for solar tier PDF (by model prefix, not template_kind). */
export function catalogItemsForBomTier(catalog: CatalogItem[], tier: BomTier): CatalogItem[] {
  const prefix = tier === "premium" ? "PREMIUM-BOM-" : "REGULAR-BOM-";
  return catalog.filter((item) => (item.model ?? "").startsWith(prefix));
}

function bomSortKey(model: string | null | undefined) {
  const match = model?.match(/(?:PREMIUM|REGULAR)-BOM-(\d+)/i);
  return match ? Number(match[1]) : 9999;
}

/** Default material quantities for BOM print (images + qty, no pricing). */
export function defaultBomQuantity(
  model: string | null | undefined,
  panelCount: number,
  systemKw: number,
  tier: BomTier = "premium"
): number {
  const num = model?.match(/(?:PREMIUM|REGULAR)-BOM-(\d+)/i)?.[1];
  const panels = Math.max(1, panelCount || 0);
  const kw = Math.max(0.5, systemKw || 0);

  if (tier === "regular") {
    switch (num) {
      case "01":
        return panels;
      case "02":
      case "03":
      case "06":
      case "07":
      case "12":
        return 1;
      case "04":
        return Math.max(panels * 4, 4);
      case "05":
        return Math.max(panels * 2, 2);
      case "08":
        return Math.round(Math.max(kw * 15, 20));
      case "09":
        return Math.round(Math.max(kw * 10, 15));
      case "10":
        return Math.round(Math.max(kw * 8, 12));
      case "11":
        return Math.round(Math.max(kw * 5, 10));
      case "13":
        return Math.round(Math.max(kw * 12, 15));
      default:
        return 1;
    }
  }

  switch (num) {
    case "01":
      return panels;
    case "02":
      return 1;
    case "03":
    case "08":
      return 1;
    case "04":
      return Math.max(panels * 4, 4);
    case "05":
      return Math.max(panels * 2, 2);
    case "06":
    case "07":
      return Math.max(panels, 4);
    case "09":
    case "10":
    case "11":
    case "16":
    case "19":
      return 1;
    case "12":
      return Math.round(Math.max(kw * 15, 20));
    case "13":
      return Math.round(Math.max(kw * 10, 15));
    case "14":
      return Math.round(Math.max(kw * 8, 12));
    case "15":
      return Math.round(Math.max(kw * 5, 10));
    case "17":
      return Math.round(Math.max(kw * 12, 15));
    case "18":
      return Math.max(panels * 2, 10);
    default:
      return 1;
  }
}

function bomLineNumber(model: string | null | undefined): string | null {
  const match = model?.match(/(?:PREMIUM|REGULAR)-BOM-(\d+)/i);
  return match ? match[1].padStart(2, "0") : null;
}

function joinMake(make: string, extra?: string | null) {
  const extraTrim = extra?.trim() ?? "";
  if (!extraTrim) return make;
  if (make.toLowerCase().includes(extraTrim.toLowerCase())) return make;
  return `${make} · ${extraTrim}`;
}

/** Replace catalog placeholder makes on module (BOM-01) and inverter (BOM-02) with the quote selection. */
export function overlayQuoteEquipmentOnBom(
  items: ProposalLineItem[],
  opts: {
    moduleTypeName?: string | null;
    moduleCompanyName?: string | null;
    moduleCapacityLabel?: string | null;
    inverterTypeName?: string | null;
    inverterSizeLabel?: string | null;
  }
): ProposalLineItem[] {
  const panelMake = (opts.moduleTypeName || opts.moduleCompanyName || "").trim();
  const panelBrand = panelMake ? joinMake(panelMake, opts.moduleCapacityLabel) : "";
  const inverterMake = (opts.inverterTypeName || "").trim();
  const inverterBrand = inverterMake ? joinMake(inverterMake, opts.inverterSizeLabel) : "";

  if (!panelBrand && !inverterBrand) return items;

  return items.map((item) => {
    const num = bomLineNumber(item.model_snapshot);
    const isModule =
      num === "01" ||
      /^solar module$/i.test(item.item_name_snapshot) ||
      /pv solar module/i.test(item.item_name_snapshot);
    const isInverter = num === "02" || /inverter/i.test(item.item_name_snapshot);

    if (isModule && panelBrand) {
      return { ...item, brand_snapshot: panelBrand };
    }
    if (isInverter && inverterBrand) {
      return { ...item, brand_snapshot: inverterBrand };
    }
    return item;
  });
}

export function buildTierBomPrintLines(
  catalog: CatalogItem[],
  input: {
    tier: BomTier;
    panelCount?: number | null;
    systemSizeKw?: number | null;
    moduleTypeName?: string | null;
    moduleCompanyName?: string | null;
    moduleCapacityLabel?: string | null;
    inverterTypeName?: string | null;
    inverterSizeLabel?: string | null;
  }
): ProposalLineItem[] {
  const panelCount = Number(input.panelCount) || 0;
  const systemKw = Number(input.systemSizeKw) || 0;

  const lines = catalogItemsForBomTier(catalog, input.tier)
    .sort((a, b) => bomSortKey(a.model) - bomSortKey(b.model) || a.item_name.localeCompare(b.item_name))
    .map((item) => {
      const brand = Array.isArray(item.brand) ? item.brand[0] : item.brand;
      const qty = defaultBomQuantity(item.model, panelCount, systemKw, input.tier);
      return {
        item_name_snapshot: item.item_name,
        brand_snapshot: brand?.name ?? null,
        model_snapshot: item.model,
        quantity: qty,
        unit: item.unit || "nos",
        rate: 0,
        gst_percent: 0,
        line_total: 0,
        image_url_snapshot: item.image_url ?? null,
        brand_image_url_snapshot: null,
      };
    });

  return overlayQuoteEquipmentOnBom(lines, input);
}
