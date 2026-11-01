import type { RateCardCompany, RateCardTree } from "@/lib/quotations/rate-card";
import { parsePanelWattage } from "@/lib/quotations/per-kw-pricing";

export type RateCardPanel = {
  id: string;
  panel_name: string;
  panel_wattage: number | null;
  panel_watt_peak: string | null;
  residential_regular_rate_per_kw: number | null;
  residential_premium_rate_per_kw: number | null;
  commercial_regular_rate_per_kw: number | null;
  commercial_premium_rate_per_kw: number | null;
  use_per_kw_pricing: boolean;
  sort_order: number;
  is_active: boolean;
};

export type RateCardPanelTab = "residential" | "commercial";

function companyToPanel(
  co: RateCardCompany & { panel_name?: string | null },
  fallbackCapacityLabel?: string
): RateCardPanel {
  const wattPeak =
    co.panel_watt_peak?.trim() ||
    (co.panel_wattage ? `${co.panel_wattage}W` : null) ||
    (fallbackCapacityLabel?.trim() ? fallbackCapacityLabel.trim() : null);
  const wattage =
    co.panel_wattage ??
    (wattPeak ? parsePanelWattage(wattPeak) : null) ??
    (fallbackCapacityLabel ? parsePanelWattage(fallbackCapacityLabel) : null);

  return {
    id: co.id,
    panel_name:
      co.panel_name?.trim() ||
      [co.name, fallbackCapacityLabel].filter(Boolean).join(" — ") ||
      co.name,
    panel_wattage: wattage,
    panel_watt_peak: wattPeak,
    residential_regular_rate_per_kw: co.residential_regular_rate_per_kw ?? null,
    residential_premium_rate_per_kw: co.residential_premium_rate_per_kw ?? null,
    commercial_regular_rate_per_kw: co.commercial_regular_rate_per_kw ?? null,
    commercial_premium_rate_per_kw: co.commercial_premium_rate_per_kw ?? null,
    use_per_kw_pricing: co.use_per_kw_pricing ?? true,
    sort_order: co.sort_order,
    is_active: co.is_active,
  };
}

/** Flatten legacy module → company tree into panel rows. */
export function flattenRateCardTree(tree: RateCardTree[]): RateCardPanel[] {
  const rows: RateCardPanel[] = [];
  for (const type of tree) {
    for (const co of type.companies) {
      rows.push(
        companyToPanel(
          { ...co, panel_name: (co as RateCardCompany & { panel_name?: string }).panel_name },
          type.capacity_label
        )
      );
    }
  }
  return sortRateCardPanels(rows);
}

export function sortRateCardPanels(panels: RateCardPanel[]): RateCardPanel[] {
  return [...panels].sort(
    (a, b) =>
      a.sort_order - b.sort_order ||
      a.panel_name.localeCompare(b.panel_name, undefined, { sensitivity: "base" })
  );
}

export function panelCapacityLabel(panel: RateCardPanel | null | undefined): string {
  if (panel?.panel_watt_peak?.trim()) return panel.panel_watt_peak.trim();
  if (panel?.panel_wattage) return `${panel.panel_wattage}W`;
  return "";
}

export function filterPanelsByQuery(panels: RateCardPanel[], query: string): RateCardPanel[] {
  const q = query.trim().toLowerCase();
  if (!q) return panels;
  return panels.filter((p) => p.panel_name.toLowerCase().includes(q));
}
