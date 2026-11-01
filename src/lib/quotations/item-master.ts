import type { CatalogItem } from "@/lib/quotations/catalog-items";
import { isInverterItem, isPanelItem } from "@/lib/quotations/catalog-items";

export type ItemMasterRow = {
  id: string;
  item_name: string;
  model?: string | null;
  capacity_label?: string | null;
  unit: string;
  gst_percent: number;
  base_rate: number;
  warranty_text?: string | null;
  is_active: boolean;
  brand_id?: string | null;
  category_id?: string | null;
  image_url?: string | null;
  image_storage_path?: string | null;
  brands?: { name: string; logo_url?: string | null } | { name: string; logo_url?: string | null }[] | null;
  item_categories?: { name: string } | { name: string }[] | null;
};

export type ItemType = "panel" | "inverter" | "other";

export function relName(rel: { name: string } | { name: string }[] | null | undefined) {
  if (!rel) return null;
  return Array.isArray(rel) ? rel[0]?.name ?? null : rel.name;
}

export function toCatalogShape(row: ItemMasterRow): CatalogItem {
  const brandRel = row.brands
    ? Array.isArray(row.brands)
      ? row.brands[0]
      : row.brands
    : null;
  return {
    id: row.id,
    item_name: row.item_name,
    model: row.model,
    capacity_label: row.capacity_label,
    unit: row.unit,
    base_rate: Number(row.base_rate),
    gst_percent: Number(row.gst_percent),
    brand: brandRel?.name ?? null,
    brand_image_url: brandRel?.logo_url ?? null,
    category: relName(row.item_categories),
    image_url: row.image_url ?? null,
  };
}

export function detectItemType(row: ItemMasterRow): ItemType {
  const cat = toCatalogShape(row);
  if (isPanelItem(cat)) return "panel";
  if (isInverterItem(cat)) return "inverter";
  return "other";
}

export function groupItemsByType(items: ItemMasterRow[]) {
  const panels: ItemMasterRow[] = [];
  const inverters: ItemMasterRow[] = [];
  const other: ItemMasterRow[] = [];
  for (const item of items) {
    const type = detectItemType(item);
    if (type === "panel") panels.push(item);
    else if (type === "inverter") inverters.push(item);
    else other.push(item);
  }
  return { panels, inverters, other };
}

export function findCategoryId(categories: { id: string; name: string }[], type: ItemType) {
  const name = type === "panel" ? "Panel" : type === "inverter" ? "Inverter" : "";
  if (!name) return "";
  return categories.find((c) => c.name.toLowerCase() === name.toLowerCase())?.id ?? "";
}

export const PANEL_CAPACITY_PRESETS = ["440W", "540W", "545W", "550W"] as const;
export const INVERTER_CAPACITY_PRESETS = ["3kW", "5kW", "6kW", "8kW", "10kW"] as const;

export function suggestItemName(brandName: string, capacityLabel: string, type: ItemType) {
  const cap = capacityLabel.trim();
  const brand = brandName.trim();
  if (!cap && !brand) return "";
  if (type === "panel") return brand ? `${brand} ${cap} Panel`.trim() : `${cap} Panel`.trim();
  if (type === "inverter") return brand ? `${brand} ${cap} Inverter`.trim() : `${cap} Inverter`.trim();
  return brand || cap;
}

export function defaultGstForType(type: ItemType) {
  return type === "panel" ? 12 : 18;
}
