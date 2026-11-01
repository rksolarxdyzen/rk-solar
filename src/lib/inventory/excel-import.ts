import type { WorkBook } from "xlsx";
import { composeInventoryItemName } from "@/lib/inventory/format";
import { normalizeSerial } from "@/lib/inventory/serial-parse";
import type { InventoryUnit } from "@/lib/inventory/types";
import type { CategoryRef, NamedRef, PickerItem, SubcategoryRef } from "@/lib/inventory/queries";

export const MAX_IMPORT_SERIALS = 5000;

const STOCK_HEADERS = [
  "Master Group",
  "Group",
  "Category",
  "Sub-Category",
  "SKU",
  "Unit",
  "Quantity",
  "Low stock threshold",
  "Unit cost",
];
const SERIAL_HEADERS = [
  "Master Group",
  "Group",
  "Category",
  "Sub-Category",
  "SKU",
  "Serial number",
  "Unit cost",
];

const SERIAL_NAME = /^(panel|inverter)s?$/i;

export async function downloadTemplate() {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([STOCK_HEADERS]), "Stock");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([SERIAL_HEADERS]), "Serials");
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["How to fill this file"],
      [""],
      ["Stock sheet", "Bulk items (cable, structure, MC4, boxes). One row per item."],
      ["", "Required: Master Group, Category, Sub-Category, Unit (Nos / Kg / M), Quantity."],
      ["", "Optional: Group, SKU, Low stock, Unit cost. Item name is auto-built: Master › Group › Category › Sub."],
      ["", "Example: Solar | Polycab | Cables | DC | DC4 | M | 500 | 100 | 32"],
      [""],
      ["Serials sheet", "Panels and inverters. One row per unit (quantity = number of rows)."],
      ["", "Required: Master Group, Category, Sub-Category, Serial number (or match an existing SKU)."],
      ["", "Example: Solar | Adani | Panel | 545W | ADN545 | ADN2409123456 | 12500"],
      ["", "Serial tracking applies when Master Group or Category is Panel / Inverter."],
      [""],
      ["Unit cost", "Only saved for people allowed to set purchase cost. Leave empty otherwise."],
      ["Limit", `Up to ${MAX_IMPORT_SERIALS} serial rows per file. Split bigger files.`],
    ]),
    "How to fill"
  );
  XLSX.writeFile(wb, "sumeru-opening-stock-template.xlsx");
}

export type RowStatus = "ok" | "warn" | "error";

export interface ImportRow {
  id: string;
  sheet: "Stock" | "Serials";
  rowNo: number;
  itemName: string;
  sku: string;
  masterGroupName: string;
  categoryName: string;
  subcategoryName: string;
  brandName: string;
  unit: InventoryUnit | null;
  quantity: number | null;
  threshold: number | null;
  serial: string | null;
  unitCost: number | null;
  /** Resolved existing item id, or a new-item key. */
  itemId: string | null;
  itemKey: string;
  status: RowStatus;
  messages: string[];
}

export interface NewItemDraft {
  key: string;
  name: string;
  sku: string;
  masterGroupId: string | null;
  categoryId: string | null;
  subcategoryId: string | null;
  categoryName: string;
  brandId: string | null;
  unit: InventoryUnit;
  threshold: number;
  serial: boolean;
}

export interface ParsedImport {
  rows: ImportRow[];
  newItems: NewItemDraft[];
  ignoredCost: boolean;
}

const norm = (v: unknown) => String(v ?? "").trim();
const key = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");

function headerIndex(header: string[], names: string[]): number {
  const wanted = names.map(key);
  return header.findIndex((h) => wanted.includes(key(h)));
}

function parseUnit(v: string): InventoryUnit | null {
  const k = key(v);
  if (["nos", "no", "pcs", "pc", "nums", "unit", "units", "piece", "pieces"].includes(k)) return "nos";
  if (["kg", "kgs", "kilogram", "kilograms"].includes(k)) return "kg";
  if (["m", "mtr", "mtrs", "meter", "meters", "metre", "metres"].includes(k)) return "m";
  return null;
}

function parseNumber(v: string): number | null {
  if (!v) return null;
  const n = Number(v.replace(/[,₹\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

function findNamed(list: NamedRef[], name: string): NamedRef | null {
  const k = key(name).replace(/s$/, "");
  return list.find((c) => key(c.name).replace(/s$/, "") === k) ?? null;
}

function findCategory(categories: CategoryRef[], name: string): CategoryRef | null {
  const k = key(name).replace(/s$/, "");
  return categories.find((c) => key(c.name).replace(/s$/, "") === k) ?? null;
}

function sheetRows(XLSX: typeof import("xlsx"), wb: WorkBook, match: RegExp): string[][] | null {
  const name = wb.SheetNames.find((n) => match.test(n));
  if (!name) return null;
  return XLSX.utils
    .sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, blankrows: false, raw: false })
    .map((r) => (r as unknown[]).map(norm));
}

export async function parseImportFile(
  file: File,
  ctx: {
    items: PickerItem[];
    masterGroups: NamedRef[];
    categories: CategoryRef[];
    subcategories: SubcategoryRef[];
    brands: NamedRef[];
    canManageCost: boolean;
  }
): Promise<ParsedImport> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const stock = sheetRows(XLSX, wb, /^stock$/i) ?? (wb.SheetNames.length === 1 ? sheetRows(XLSX, wb, /./) : null);
  const serialSheet = sheetRows(XLSX, wb, /^serials?$/i);
  if (!stock && !serialSheet) throw new Error('No "Stock" or "Serials" sheet found. Use the template.');

  const bySku = new Map(ctx.items.filter((i) => i.sku).map((i) => [key(i.sku as string), i]));
  const byName = new Map(ctx.items.map((i) => [key(i.name), i]));
  const drafts = new Map<string, NewItemDraft>();
  const rows: ImportRow[] = [];
  let ignoredCost = false;
  let n = 0;

  function resolveItem(name: string, sku: string) {
    return (sku && bySku.get(key(sku))) || (name && byName.get(key(name))) || null;
  }

  function baseRow(sheet: ImportRow["sheet"], rowNo: number): ImportRow {
    return {
      id: `r${++n}`,
      sheet,
      rowNo,
      itemName: "",
      sku: "",
      masterGroupName: "",
      categoryName: "",
      subcategoryName: "",
      brandName: "",
      unit: null,
      quantity: null,
      threshold: null,
      serial: null,
      unitCost: null,
      itemId: null,
      itemKey: "",
      status: "ok",
      messages: [],
    };
  }

  function readCost(row: ImportRow, raw: string) {
    if (!raw) return;
    if (!ctx.canManageCost) {
      ignoredCost = true;
      return;
    }
    const c = parseNumber(raw);
    if (c === null) return;
    if (Number.isNaN(c) || c < 0) row.messages.push("Unit cost must be a positive number");
    else row.unitCost = c;
  }

  if (stock && stock.length > 1) {
    const h = stock[0];
    const col = {
      name: headerIndex(h, ["Item name", "Item", "Name", "Product"]),
      master: headerIndex(h, ["Master Group", "Master group", "Group"]),
      cat: headerIndex(h, ["Category"]),
      sub: headerIndex(h, ["Sub-Category", "Sub Category", "Subcategory"]),
      brand: headerIndex(h, ["Group", "Brand", "Make"]),
      sku: headerIndex(h, ["SKU", "Code", "Item code"]),
      unit: headerIndex(h, ["Unit", "UOM"]),
      qty: headerIndex(h, ["Quantity", "Qty", "Stock"]),
      low: headerIndex(h, ["Low stock threshold", "Low stock", "Min stock", "Reorder level"]),
      cost: headerIndex(h, ["Unit cost", "Cost", "Purchase cost", "Rate"]),
    };
    stock.slice(1).forEach((r, i) => {
      const row = baseRow("Stock", i + 2);
      row.itemName = col.name >= 0 ? r[col.name] ?? "" : "";
      row.sku = col.sku >= 0 ? r[col.sku] ?? "" : "";
      row.masterGroupName = col.master >= 0 ? r[col.master] ?? "" : "";
      row.categoryName = col.cat >= 0 ? r[col.cat] ?? "" : "";
      row.subcategoryName = col.sub >= 0 ? r[col.sub] ?? "" : "";
      row.brandName = col.brand >= 0 ? r[col.brand] ?? "" : "";
      if (!row.itemName && !row.sku && !row.masterGroupName && !row.categoryName && !row.subcategoryName) return;
      const unitRaw = col.unit >= 0 ? r[col.unit] ?? "" : "";
      row.unit = parseUnit(unitRaw);
      const q = parseNumber(col.qty >= 0 ? r[col.qty] ?? "" : "");
      const low = parseNumber(col.low >= 0 ? r[col.low] ?? "" : "");
      readCost(row, col.cost >= 0 ? r[col.cost] ?? "" : "");

      if (q === null) row.messages.push("Quantity is required");
      else if (Number.isNaN(q) || q <= 0) row.messages.push("Quantity must be more than 0");
      else row.quantity = q;
      if (low !== null && !Number.isNaN(low) && low >= 0) row.threshold = low;

      const existing = resolveItem(row.itemName, row.sku);
      if (existing) {
        row.itemId = existing.id;
        if (existing.track_serials) row.messages.push("Panels / inverters go on the Serials sheet (one row per serial)");
        if (existing.unit_type === "nos" && row.quantity !== null && !Number.isInteger(row.quantity)) {
          row.messages.push("Nos quantity must be a whole number");
        }
        row.unit = existing.unit_type;
      } else {
        const master = row.masterGroupName ? findNamed(ctx.masterGroups, row.masterGroupName) : null;
        if (!row.masterGroupName) row.messages.push("Master Group is required for a new item");
        else if (!master) row.messages.push(`Unknown master group "${row.masterGroupName}"`);

        const cat = row.categoryName ? findCategory(ctx.categories, row.categoryName) : null;
        if (!row.categoryName) row.messages.push("Category is required for a new item");
        else if (!cat) row.messages.push(`Unknown category "${row.categoryName}"`);
        else if (
          SERIAL_NAME.test(cat.name.trim()) ||
          (master && SERIAL_NAME.test(master.name.trim()))
        ) {
          row.messages.push("Panels / inverters go on the Serials sheet");
        } else if (master && cat.master_group_id && cat.master_group_id !== master.id) {
          row.messages.push(`Category "${cat.name}" does not belong to master group "${row.masterGroupName}"`);
        }

        let sub: SubcategoryRef | null = null;
        if (!row.subcategoryName) row.messages.push("Sub-Category is required for a new item");
        else if (!cat) row.messages.push("Sub-category needs a valid category");
        else {
          sub =
            ctx.subcategories.find(
              (s) => s.category_id === cat.id && key(s.name) === key(row.subcategoryName)
            ) ?? null;
          if (!sub) row.messages.push(`Unknown sub-category "${row.subcategoryName}" for this category`);
        }

        const brand = findNamed(ctx.brands, row.brandName);
        const composed = composeInventoryItemName({
          masterGroup: master?.name,
          category: cat?.name,
          subcategory: sub?.name,
          brand: brand?.name,
          sku: row.sku,
        });
        if (composed) row.itemName = composed;

        if (!row.unit) row.messages.push(unitRaw ? `Unknown unit "${unitRaw}" (use Nos, Kg or M)` : "Unit is required for a new item");
        if (row.unit === "nos" && row.quantity !== null && !Number.isInteger(row.quantity)) {
          row.messages.push("Nos quantity must be a whole number");
        }
        row.itemKey = `new:${key(composed || `${row.masterGroupName}|${row.categoryName}|${row.subcategoryName}|${row.sku}`)}`;
        if (master && cat && sub && row.unit && composed && !drafts.has(row.itemKey) && row.messages.length === 0) {
          drafts.set(row.itemKey, {
            key: row.itemKey,
            name: composed,
            sku: row.sku,
            masterGroupId: master.id,
            categoryId: cat.id,
            subcategoryId: sub.id,
            categoryName: cat.name,
            brandId: brand?.id ?? null,
            unit: row.unit,
            threshold: row.threshold ?? 0,
            serial: false,
          });
        }
      }
      rows.push(row);
    });
  }

  if (serialSheet && serialSheet.length > 1) {
    const h = serialSheet[0];
    const col = {
      name: headerIndex(h, ["Item name", "Item", "Name", "Product", "Model"]),
      master: headerIndex(h, ["Master Group", "Master group", "Group"]),
      cat: headerIndex(h, ["Category"]),
      sub: headerIndex(h, ["Sub-Category", "Sub Category", "Subcategory"]),
      brand: headerIndex(h, ["Group", "Brand", "Make"]),
      sku: headerIndex(h, ["SKU", "Code", "Item code"]),
      serial: headerIndex(h, ["Serial number", "Serial no", "Serial", "S/N", "SN", "Serial No."]),
      cost: headerIndex(h, ["Unit cost", "Cost", "Purchase cost", "Rate"]),
    };
    if (col.serial < 0) throw new Error('The Serials sheet needs a "Serial number" column.');

    serialSheet.slice(1).forEach((r, i) => {
      const row = baseRow("Serials", i + 2);
      row.itemName = col.name >= 0 ? r[col.name] ?? "" : "";
      row.sku = col.sku >= 0 ? r[col.sku] ?? "" : "";
      row.masterGroupName = col.master >= 0 ? r[col.master] ?? "" : "";
      row.categoryName = col.cat >= 0 ? r[col.cat] ?? "" : "";
      row.subcategoryName = col.sub >= 0 ? r[col.sub] ?? "" : "";
      row.brandName = col.brand >= 0 ? r[col.brand] ?? "" : "";
      const rawSerial = r[col.serial] ?? "";
      if (!row.itemName && !row.sku && !row.masterGroupName && !rawSerial) return;
      row.serial = normalizeSerial(rawSerial);
      row.quantity = 1;
      row.unit = "nos";
      readCost(row, col.cost >= 0 ? r[col.cost] ?? "" : "");
      if (!row.serial) row.messages.push("Serial number is required");

      const existing = resolveItem(row.itemName, row.sku);
      if (existing) {
        row.itemId = existing.id;
        if (!existing.track_serials) row.messages.push("This item is not serial-tracked — use the Stock sheet");
      } else {
        const master = row.masterGroupName ? findNamed(ctx.masterGroups, row.masterGroupName) : null;
        if (!row.masterGroupName) row.messages.push("Master Group is required for a new item");
        else if (!master) row.messages.push(`Unknown master group "${row.masterGroupName}"`);

        const cat = row.categoryName ? findCategory(ctx.categories, row.categoryName) : null;
        if (!row.categoryName) row.messages.push("Category is required for a new item");
        else if (!cat) row.messages.push(`Unknown category "${row.categoryName}"`);
        else if (master && cat.master_group_id && cat.master_group_id !== master.id) {
          row.messages.push(`Category "${cat.name}" does not belong to master group "${row.masterGroupName}"`);
        }

        let sub: SubcategoryRef | null = null;
        if (!row.subcategoryName) row.messages.push("Sub-Category is required for a new item");
        else if (!cat) row.messages.push("Sub-category needs a valid category");
        else {
          sub =
            ctx.subcategories.find(
              (s) => s.category_id === cat.id && key(s.name) === key(row.subcategoryName)
            ) ?? null;
          if (!sub) row.messages.push(`Unknown sub-category "${row.subcategoryName}" for this category`);
        }

        const brand = findNamed(ctx.brands, row.brandName);
        const composed = composeInventoryItemName({
          masterGroup: master?.name,
          category: cat?.name,
          subcategory: sub?.name,
          brand: brand?.name,
          sku: row.sku,
        });
        if (composed) row.itemName = composed;

        const serialByMasterOrCat =
          (master && SERIAL_NAME.test(master.name.trim())) ||
          (cat && SERIAL_NAME.test(cat.name.trim()));
        if (master && cat && !serialByMasterOrCat) {
          row.messages.push("Master Group or Category must be Panel / Inverter for serial items");
        }

        row.itemKey = `new:${key(composed || `${row.masterGroupName}|${row.categoryName}|${row.subcategoryName}|${row.sku}`)}`;
        if (master && cat && sub && composed && !drafts.has(row.itemKey) && row.messages.length === 0) {
          drafts.set(row.itemKey, {
            key: row.itemKey,
            name: composed,
            sku: row.sku,
            masterGroupId: master.id,
            categoryId: cat.id,
            subcategoryId: sub.id,
            categoryName: cat.name,
            brandId: brand?.id ?? null,
            unit: "nos",
            threshold: 0,
            serial: true,
          });
        }
      }
      rows.push(row);
    });

    const seen = new Map<string, ImportRow>();
    for (const row of rows) {
      if (row.sheet !== "Serials" || !row.serial) continue;
      const first = seen.get(row.serial);
      if (first) row.messages.push(`Duplicate of row ${first.rowNo}`);
      else seen.set(row.serial, row);
    }
  }

  for (const row of rows) row.status = row.messages.length ? "error" : "ok";
  const serialRows = rows.filter((r) => r.sheet === "Serials").length;
  if (serialRows > MAX_IMPORT_SERIALS) {
    throw new Error(`This file has ${serialRows} serial rows. The limit is ${MAX_IMPORT_SERIALS} per file; split it and import in parts.`);
  }
  return { rows, newItems: [...drafts.values()], ignoredCost };
}

/** Build the RPC payload from rows that passed validation. New-item keys resolve inside the RPC. */
export function buildImportPayload(parsed: ParsedImport, fileName: string, movementDate?: string) {
  const good = parsed.rows.filter((r) => r.status !== "error");
  const usedKeys = new Set(good.filter((r) => !r.itemId).map((r) => r.itemKey));
  const groups = new Map<string, { item_id?: string; item_key?: string; quantity?: number; serials?: string[]; unit_cost?: number }>();

  for (const r of good) {
    const target = r.itemId ?? r.itemKey;
    const g = `${target}|${r.sheet}|${r.unitCost ?? ""}`;
    let line = groups.get(g);
    if (!line) {
      line = r.itemId ? { item_id: r.itemId } : { item_key: r.itemKey };
      if (r.unitCost !== null) line.unit_cost = r.unitCost;
      groups.set(g, line);
    }
    if (r.sheet === "Serials") (line.serials ??= []).push(r.serial as string);
    else line.quantity = (line.quantity ?? 0) + (r.quantity ?? 0);
  }

  return {
    file_name: fileName,
    movement_date: movementDate,
    new_items: parsed.newItems
      .filter((d) => usedKeys.has(d.key))
      .map((d) => ({
        key: d.key,
        name: d.name,
        sku: d.sku || undefined,
        master_group_id: d.masterGroupId,
        category_id: d.categoryId,
        subcategory_id: d.subcategoryId,
        brand_id: d.brandId,
        unit_type: d.unit,
        low_stock_threshold: d.threshold,
      })),
    lines: [...groups.values()],
  };
}

export async function downloadErrorReport(rows: ImportRow[]) {
  const XLSX = await import("xlsx");
  const bad = rows.filter((r) => r.status === "error");
  const ws = XLSX.utils.aoa_to_sheet([
    ["Sheet", "Row", "Item", "SKU", "Serial", "Problem"],
    ...bad.map((r) => [r.sheet, r.rowNo, r.itemName, r.sku, r.serial ?? "", r.messages.join("; ")]),
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Errors");
  XLSX.writeFile(wb, "opening-stock-errors.xlsx");
}
