import type { QuoteItemInput } from "@/lib/quotations/types";
import { resolveInverterBrandImageUrl } from "@/lib/quotations/inverter-brand-logos";
import type { RateCardInverter } from "@/lib/quotations/rate-card-inverters";
import { inverterSizeLabel } from "@/lib/quotations/rate-card-inverters";

export type CatalogItem = {
  id: string;
  item_name: string;
  model?: string | null;
  capacity_label?: string | null;
  unit: string;
  base_rate: number;
  gst_percent: number;
  brand?: string | null;
  /** Brand logo URL (from quote_brands) — used in BOM Brand column for inverters. */
  brand_image_url?: string | null;
  category?: string | null;
  image_url?: string | null;
};

export function parsePanelWatts(item: Pick<CatalogItem, "item_name" | "model" | "capacity_label">): number {
  const fromLabel = item.capacity_label?.match(/(\d{3,4})\s*w/i);
  if (fromLabel) return Number(fromLabel[1]);
  const text = `${item.item_name ?? ""} ${item.model ?? ""}`;
  const wp = text.match(/(\d{3,4})\s*w(p)?/i);
  return wp ? Number(wp[1]) : 0;
}

export function parseInverterKw(item: Pick<CatalogItem, "item_name" | "model" | "capacity_label">): number {
  const fromLabel = item.capacity_label?.match(/(\d+(?:\.\d+)?)\s*kw/i);
  if (fromLabel) return Number(fromLabel[1]);
  const text = `${item.item_name ?? ""} ${item.model ?? ""}`;
  const kw = text.match(/(\d+(?:\.\d+)?)\s*kw/i);
  return kw ? Number(kw[1]) : 0;
}

export function isPanelItem(item: CatalogItem) {
  const cat = (item.category ?? "").toLowerCase();
  const name = (item.item_name ?? "").toLowerCase();
  if (cat.includes("inverter") || name.includes("inverter")) return false;
  if (cat === "panel" || cat.includes("module") || cat.includes("panel")) return true;
  const watts = parsePanelWatts(item);
  return watts >= 400;
}

export function isInverterItem(item: CatalogItem) {
  const cat = (item.category ?? "").toLowerCase();
  const name = (item.item_name ?? "").toLowerCase();
  // Category names like "On-Grid Inverters" (not just exact "inverter")
  if (cat.includes("inverter")) return true;
  if (cat === "panel" || cat.includes("module")) return false;
  if (name.includes("inverter")) return true;
  const kw = parseInverterKw(item);
  if (kw > 0 && parsePanelWatts(item) < 400) return true;
  return /^(sungrow|growatt|delta|fimer|luminous|microtek|polycab|sineng|vsole|solis|havells|waaree)\b/i.test(
    item.item_name ?? ""
  );
}

export function filterPanels(catalog: CatalogItem[]) {
  return catalog.filter(isPanelItem);
}

export function filterInverters(catalog: CatalogItem[]) {
  return catalog.filter(isInverterItem);
}

export function filterOtherItems(catalog: CatalogItem[]) {
  return catalog.filter((item) => !isPanelItem(item) && !isInverterItem(item));
}

export function otherItemOptionLabel(item: CatalogItem) {
  const brand = item.brand ? `${item.brand} · ` : "";
  const detail = item.model || item.capacity_label || "";
  return detail ? `${brand}${item.item_name} (${detail})` : `${brand}${item.item_name}`;
}

export function panelOptionLabel(item: CatalogItem) {
  const brand = item.brand ? `${item.brand} · ` : "";
  const cap = item.capacity_label || item.model || "";
  return cap ? `${brand}${item.item_name} (${cap})` : `${brand}${item.item_name}`;
}

export function inverterOptionLabel(item: CatalogItem) {
  const brand = item.brand ? `${item.brand} · ` : "";
  const cap = item.capacity_label || item.model || "";
  return cap ? `${brand}${item.item_name} (${cap})` : `${brand}${item.item_name}`;
}

export function calcPanelSystemKw(item: CatalogItem | null | undefined, qty: number) {
  if (!item || qty <= 0) return 0;
  const watts = parsePanelWatts(item);
  if (!watts) return 0;
  return Math.round((watts * qty) / 100) / 100;
}

export function catalogItemToLine(item: CatalogItem, quantity: number): QuoteItemInput {
  const brandImageUrl =
    item.brand_image_url?.trim() ||
    (isInverterItem(item) ? resolveInverterBrandImageUrl(item.brand) : null) ||
    undefined;
  return {
    itemId: item.id,
    itemName: item.item_name,
    brand: item.brand ?? "",
    model: item.model ?? "",
    quantity,
    unit: item.unit,
    rate: Number(item.base_rate),
    gstPercent: Number(item.gst_percent),
    discountValue: 0,
    imageUrl: item.image_url ?? undefined,
    brandImageUrl,
  };
}

export function buildSystemLineItems(
  panel: CatalogItem | null | undefined,
  panelQty: number,
  inverter: CatalogItem | null | undefined
): QuoteItemInput[] {
  const items: QuoteItemInput[] = [];
  if (panel && panelQty > 0) items.push(catalogItemToLine(panel, panelQty));
  if (inverter) items.push(catalogItemToLine(inverter, 1));
  return items;
}

/** Package-priced system lines: inclusive system cost + module BOM row + inverter BOM. */
export function buildRateCardSystemLines(opts: {
  moduleCompanyName: string;
  moduleCapacityLabel: string;
  moduleTypeName: string;
  panelCount: number;
  systemCost: number;
  /** Quote-level discount applied to the system package (₹). */
  discountAmount?: number;
  /** Preferred: inverter brand toggle + free-text size. */
  inverterBrand?: string | null;
  inverterSizeLabel?: string;
  /** @deprecated Prefer inverterBrand + inverterSizeLabel */
  inverter?: RateCardInverter | null | undefined;
}): QuoteItemInput[] {
  const items: QuoteItemInput[] = [];
  const discount = Math.max(0, Math.min(Number(opts.discountAmount ?? 0), Number(opts.systemCost) || 0));
  if (opts.panelCount > 0) {
    items.push({
      itemName: "Solar PV System Package",
      brand: opts.moduleTypeName || opts.moduleCompanyName,
      model: opts.moduleCapacityLabel
        ? `${opts.moduleTypeName || opts.moduleCompanyName} · ${opts.moduleCapacityLabel}`.trim()
        : opts.moduleTypeName || opts.moduleCompanyName,
      quantity: 1,
      unit: "set",
      rate: opts.systemCost,
      gstPercent: 0,
      discountValue: discount,
    });
    items.push({
      itemName: "Solar Module",
      brand: opts.moduleTypeName || opts.moduleCompanyName,
      model: opts.moduleCapacityLabel,
      quantity: opts.panelCount,
      unit: "pcs",
      rate: 0,
      gstPercent: 0,
      discountValue: 0,
    });
  }

  const brandFromPicker = opts.inverterBrand?.trim() ?? "";
  const sizeFromPicker = opts.inverterSizeLabel?.trim() ?? "";
  const brand =
    brandFromPicker ||
    opts.inverter?.inverter_name?.trim() ||
    "";
  const size =
    sizeFromPicker ||
    (opts.inverter ? inverterSizeLabel(opts.inverter) : "");

  if (brand && size) {
    items.push({
      itemName: "On-Grid Inverter",
      brand,
      model: size,
      quantity: 1,
      unit: "pcs",
      rate: 0,
      gstPercent: 0,
      discountValue: 0,
      brandImageUrl: resolveInverterBrandImageUrl(brand) ?? undefined,
    });
  }
  return items;
}

export function isInverterBomLine(
  row: Pick<QuoteItemInput, "itemName" | "brand" | "model">,
  match?: { brand: string; sizeLabel?: string } | null
) {
  if (!match?.brand?.trim()) return false;
  if (!/inverter/i.test(row.itemName)) return false;
  if (row.brand?.trim() !== match.brand.trim()) return false;
  if (match.sizeLabel?.trim() && row.model?.trim() !== match.sizeLabel.trim()) {
    return false;
  }
  return true;
}

export function inferSystemSelection(
  catalog: CatalogItem[],
  items: Array<{ itemId?: string; itemName: string; quantity: number }>
) {
  let panelItemId = "";
  let panelQty = 1;
  let inverterItemId = "";

  for (const row of items) {
    const byId = row.itemId ? catalog.find((c) => c.id === row.itemId) : undefined;
    const match = byId ?? catalog.find((c) => c.item_name === row.itemName);
    if (!match) continue;
    if (isPanelItem(match)) {
      panelItemId = match.id;
      panelQty = row.quantity;
    }
    if (isInverterItem(match)) {
      inverterItemId = match.id;
    }
  }

  return { panelItemId, panelQty, inverterItemId };
}

/** Line items that are not the primary panel or inverter BOM row. */
export function extractAdditionalItems(
  catalog: CatalogItem[],
  allItems: QuoteItemInput[],
  panelItemId: string,
  panelQty: number,
  inverterBomMatch?: { brand: string; sizeLabel?: string } | null
): QuoteItemInput[] {
  return allItems.filter((row) => {
    if (panelItemId && row.itemId === panelItemId && row.quantity === panelQty) return false;
    if (isInverterBomLine(row, inverterBomMatch)) return false;
    const match = row.itemId
      ? catalog.find((c) => c.id === row.itemId)
      : catalog.find((c) => c.item_name === row.itemName);
    if (match?.id === panelItemId && row.quantity === panelQty) return false;
    if (match && isInverterItem(match) && inverterBomMatch?.brand) return false;
    return true;
  });
}
