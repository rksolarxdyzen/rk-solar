import { INVENTORY_UNIT_LABELS, type InventoryUnit } from "@/lib/inventory/types";

const qtyFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });
const inrFmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

/** Display name: Master Group › Group › Category › Sub-Category · SKU (omit empty). */
export function composeInventoryItemName(parts: {
  masterGroup?: string | null;
  category?: string | null;
  subcategory?: string | null;
  brand?: string | null;
  sku?: string | null;
}): string {
  const segments = [parts.masterGroup, parts.brand, parts.category, parts.subcategory]
    .map((s) => (s ?? "").trim())
    .filter(Boolean);
  let name = segments.join(" › ");
  const sku = (parts.sku ?? "").trim();
  if (sku) name = name ? `${name} · ${sku}` : sku;
  return name;
}

/**
 * Every word must appear somewhere in the hierarchy.
 * "polycab 2.5" matches "CABLE › polycab › 2.5 sq/mm › Ac black".
 */
export function inventorySearchMatches(parts: Array<string | null | undefined>, query: string): boolean {
  const tokens = query
    .toLowerCase()
    .split(/[\s›>·,/]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = parts
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

export function formatQty(qty: number | null | undefined, unit?: InventoryUnit): string {
  const n = qtyFmt.format(Number(qty ?? 0));
  return unit ? `${n} ${INVENTORY_UNIT_LABELS[unit]}` : n;
}

export function formatInr(value: number | null | undefined): string {
  return value == null ? "—" : inrFmt.format(value);
}

/** Inc-GST amount from ex-GST cost and percent (null/empty gst → cost). */
export function costIncGst(exGst: number | null | undefined, gstPercent: number | null | undefined): number | null {
  if (exGst == null || !Number.isFinite(exGst)) return null;
  const g = gstPercent == null || !Number.isFinite(gstPercent) ? 0 : gstPercent;
  return Math.round(exGst * (1 + g / 100) * 100) / 100;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
