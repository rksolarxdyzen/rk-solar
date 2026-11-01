import { createClient } from "@/lib/supabase/server";
import { inventorySearchMatches } from "@/lib/inventory/format";
import { getStockList } from "@/lib/inventory/queries";
import { INVENTORY_UNIT_LABELS, type InventoryMovementType, type InventoryUnit, type ReturnCondition } from "@/lib/inventory/types";

const PAGE = 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface StockReportRange {
  from: string | null;
  to: string | null;
}

export interface StockReportRow {
  item_id: string;
  name: string;
  sku: string | null;
  master_group_name: string | null;
  category_name: string | null;
  subcategory_name: string | null;
  brand_name: string | null;
  unit_type: InventoryUnit;
  track_serials: boolean;
  is_active: boolean;
  on_hand: number;
  serials_defective: number;
  inward: number;
  dispatched: number;
  returned_good: number;
  returned_defective: number;
  service_issued: number;
  adjusted: number;
  /** Only filled when the caller may view purchase cost. */
  unit_cost?: number | null;
  stock_value?: number | null;
  missing_cost_count?: number;
}

export interface StockReport {
  range: StockReportRange;
  withValue: boolean;
  rows: StockReportRow[];
}

export function parseReportRange(from?: string | null, to?: string | null): StockReportRange {
  const f = from && DATE_RE.test(from) ? from : null;
  const t = to && DATE_RE.test(to) ? to : null;
  return f && t && f > t ? { from: t, to: f } : { from: f, to: t };
}

export function parseReportQuery(raw?: string | null): string {
  return (raw ?? "").trim().slice(0, 80);
}

/** Hierarchy words, name, SKU, group, and category. Used by the stock report search box and CSV. */
export function stockRowMatchesQuery(
  row: Pick<
    StockReportRow,
    "name" | "sku" | "master_group_name" | "category_name" | "subcategory_name" | "brand_name"
  >,
  query: string
): boolean {
  return inventorySearchMatches(
    [row.name, row.sku, row.master_group_name, row.brand_name, row.category_name, row.subcategory_name],
    query
  );
}

type LineRow = {
  item_id: string;
  quantity_delta: number;
  return_condition: ReturnCondition | null;
  movement: { movement_type: InventoryMovementType };
};

async function movementLines(range: StockReportRange): Promise<LineRow[]> {
  const supabase = await createClient();
  const out: LineRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    let q = supabase
      .from("inventory_movement_lines")
      .select("item_id,quantity_delta,return_condition,movement:inventory_movements!inner(movement_type,movement_date,reversed_by_id)")
      .is("movement.reversed_by_id", null)
      .neq("movement.movement_type", "reversal")
      .order("id")
      .range(offset, offset + PAGE - 1);
    if (range.from) q = q.gte("movement.movement_date", range.from);
    if (range.to) q = q.lte("movement.movement_date", range.to);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as unknown as LineRow[]));
    if (!data || data.length < PAGE) return out;
  }
}

/** Per-item stock report. On hand is current; movement totals follow the date range. */
export async function getStockReport(range: StockReportRange, withValue: boolean): Promise<StockReport> {
  const [stock, lines] = await Promise.all([getStockList(withValue), movementLines(range)]);
  const totals = new Map<string, Pick<StockReportRow, "inward" | "dispatched" | "returned_good" | "returned_defective" | "service_issued" | "adjusted">>();
  for (const l of lines) {
    const t = totals.get(l.item_id) ?? { inward: 0, dispatched: 0, returned_good: 0, returned_defective: 0, service_issued: 0, adjusted: 0 };
    const q = Number(l.quantity_delta);
    switch (l.movement.movement_type) {
      case "inward":
        t.inward += q;
        break;
      case "dispatch":
        t.dispatched -= q;
        break;
      case "service_issue":
        t.service_issued -= q;
        break;
      case "return":
        if (l.return_condition === "defective") t.returned_defective += q;
        else t.returned_good += q;
        break;
      case "adjustment":
        t.adjusted += q;
        break;
    }
    totals.set(l.item_id, t);
  }

  const rows = stock.map((s): StockReportRow => {
    const t = totals.get(s.item_id);
    const row: StockReportRow = {
      item_id: s.item_id,
      name: s.name,
      sku: s.sku,
      master_group_name: s.master_group_name,
      category_name: s.category_name,
      subcategory_name: s.subcategory_name,
      brand_name: s.brand_name,
      unit_type: s.unit_type,
      track_serials: s.track_serials,
      is_active: s.is_active,
      on_hand: Number(s.on_hand),
      serials_defective: Number(s.serials_defective ?? 0),
      inward: t?.inward ?? 0,
      dispatched: t?.dispatched ?? 0,
      returned_good: t?.returned_good ?? 0,
      returned_defective: t?.returned_defective ?? 0,
      service_issued: t?.service_issued ?? 0,
      adjusted: t?.adjusted ?? 0,
    };
    if (withValue) {
      row.unit_cost = s.stock_value != null && s.on_hand > 0 ? s.stock_value / s.on_hand : null;
      row.stock_value = s.stock_value;
      row.missing_cost_count = s.missing_cost_count;
    }
    return row;
  });

  return {
    range,
    withValue,
    rows: rows.filter((r) => r.is_active || r.on_hand !== 0 || totals.has(r.item_id)),
  };
}

function csvCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  const safe = /^[=+\-@\t\r]/.test(s) && typeof value === "string" ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const round = (n: number, dp = 3) => Number(n.toFixed(dp));

export function stockReportCsv(report: StockReport): string {
  const head = [
    "Item",
    "SKU",
    "Master group",
    "Group",
    "Category",
    "Sub-category",
    "Unit",
    "Serial tracked",
    "On hand",
    "Defective (serials)",
    "Inward",
    "Dispatched",
    "Returned good",
    "Returned defective",
    "Service issued",
    "Adjusted",
    ...(report.withValue ? ["Unit cost (INR)", "Stock value (INR)", "Units without cost"] : []),
  ];
  const lines = report.rows.map((r) =>
    [
      r.name,
      r.sku,
      r.master_group_name,
      r.brand_name,
      r.category_name,
      r.subcategory_name,
      INVENTORY_UNIT_LABELS[r.unit_type],
      r.track_serials ? "Yes" : "No",
      round(r.on_hand),
      r.serials_defective,
      round(r.inward),
      round(r.dispatched),
      round(r.returned_good),
      round(r.returned_defective),
      round(r.service_issued),
      round(r.adjusted),
      ...(report.withValue
        ? [r.unit_cost == null ? null : round(r.unit_cost, 2), r.stock_value == null ? null : round(r.stock_value, 2), r.missing_cost_count ?? 0]
        : []),
    ]
      .map(csvCell)
      .join(",")
  );
  return "\uFEFF" + [head.map(csvCell).join(","), ...lines].join("\r\n") + "\r\n";
}
