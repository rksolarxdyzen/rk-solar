export type StockCategoryKind = "panel" | "inverter" | "other";

export type CategoryStockSource = {
  name: string;
  sku?: string | null;
  master_group_name?: string | null;
  category_name?: string | null;
  subcategory_name?: string | null;
  brand_name?: string | null;
  on_hand: number;
};

export type CategoryWattageRow = {
  wattage: string;
  on_hand: number;
  item_count: number;
};

export type CategoryCompanyGroup = {
  company: string;
  on_hand: number;
  item_count: number;
  wattages: CategoryWattageRow[];
};

export type CategoryStockGroup = {
  kind: "panel" | "inverter";
  label: string;
  on_hand: number;
  item_count: number;
  companies: CategoryCompanyGroup[];
};

const PANEL_LABEL = /^(solar\s*)?(panel|module)s?$/i;
const INVERTER_LABEL = /^inverters?$/i;
const PANEL_WORD = /\b(panels?|modules?)\b/i;
const INVERTER_WORD = /\binverters?\b/i;

export function classifyStockCategory(row: CategoryStockSource): StockCategoryKind {
  const labels = [row.master_group_name, row.category_name, row.subcategory_name];
  for (const label of labels) {
    const t = (label ?? "").trim();
    if (!t) continue;
    if (INVERTER_LABEL.test(t)) return "inverter";
    if (PANEL_LABEL.test(t)) return "panel";
  }
  const nameParts = row.name.split(/[›>·]/).map((p) => p.trim()).filter(Boolean);
  for (const part of nameParts) {
    if (INVERTER_LABEL.test(part)) return "inverter";
    if (PANEL_LABEL.test(part)) return "panel";
  }
  const hay = [row.master_group_name, row.category_name, row.name].join(" ");
  if (INVERTER_WORD.test(hay)) return "inverter";
  if (PANEL_WORD.test(hay)) return "panel";
  return "other";
}

export function parseStockWattage(row: CategoryStockSource): { label: string; sortKey: number } {
  const text = [row.subcategory_name, row.sku, row.name].filter(Boolean).join(" ");
  const kw = text.match(/(\d+(?:\.\d+)?)\s*kW\b/i);
  if (kw) {
    const n = Number(kw[1]);
    return { label: `${kw[1]} kW`, sortKey: Number.isFinite(n) ? n * 1000 : 9e9 };
  }
  const watt = text.match(/(\d{3,4})\s*(?:Wp|WP|W(?:att)?s?)\b/i) ?? text.match(/(?:^|[^\d])(\d{3,4})(?:\b|$)/);
  if (watt) {
    const n = Number(watt[1]);
    return { label: `${watt[1]}W`, sortKey: Number.isFinite(n) ? n : 9e9 };
  }
  const sub = (row.subcategory_name ?? "").trim();
  if (sub) return { label: sub, sortKey: 8e9 };
  return { label: "Unspecified", sortKey: 9e9 };
}

export function companyName(row: CategoryStockSource): string {
  return (row.brand_name ?? "").trim() || "Unspecified company";
}

export function groupPanelInverterStock(rows: CategoryStockSource[]): CategoryStockGroup[] {
  type Bucket = {
    on_hand: number;
    item_count: number;
    sortKey: number;
  };
  const kinds: Array<{ kind: "panel" | "inverter"; label: string }> = [
    { kind: "panel", label: "Solar panels" },
    { kind: "inverter", label: "Inverters" },
  ];

  return kinds.map(({ kind, label }) => {
    const companies = new Map<string, Map<string, Bucket>>();
    let onHand = 0;
    let itemCount = 0;
    for (const row of rows) {
      if (classifyStockCategory(row) !== kind) continue;
      const qty = Number(row.on_hand) || 0;
      onHand += qty;
      itemCount += 1;
      const company = companyName(row);
      const watt = parseStockWattage(row);
      let wattMap = companies.get(company);
      if (!wattMap) {
        wattMap = new Map();
        companies.set(company, wattMap);
      }
      const prev = wattMap.get(watt.label) ?? { on_hand: 0, item_count: 0, sortKey: watt.sortKey };
      prev.on_hand += qty;
      prev.item_count += 1;
      wattMap.set(watt.label, prev);
    }

    const companyRows: CategoryCompanyGroup[] = [...companies.entries()]
      .map(([company, wattMap]) => {
        const wattages = [...wattMap.entries()]
          .map(([wattage, b]) => ({
            wattage,
            on_hand: b.on_hand,
            item_count: b.item_count,
            sortKey: b.sortKey,
          }))
          .sort((a, b) => a.sortKey - b.sortKey || a.wattage.localeCompare(b.wattage));
        return {
          company,
          on_hand: wattages.reduce((sum, w) => sum + w.on_hand, 0),
          item_count: wattages.reduce((sum, w) => sum + w.item_count, 0),
          wattages: wattages.map(({ sortKey: _s, ...w }) => w),
        };
      })
      .sort((a, b) => a.company.localeCompare(b.company, undefined, { sensitivity: "base" }));

    return { kind, label, on_hand: onHand, item_count: itemCount, companies: companyRows };
  });
}

export function categoryStockCsv(groups: CategoryStockGroup[]): string {
  const head = ["Category", "Company", "Wattage", "On hand", "Item SKUs"];
  function cell(value: string | number): string {
    const s = String(value);
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  }
  const lines = [head.map(cell).join(",")];
  for (const group of groups) {
    if (group.companies.length === 0) {
      lines.push([group.label, "", "", 0, 0].map(cell).join(","));
      continue;
    }
    for (const company of group.companies) {
      for (const watt of company.wattages) {
        lines.push(
          [group.label, company.company, watt.wattage, watt.on_hand, watt.item_count].map(cell).join(",")
        );
      }
    }
  }
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}
