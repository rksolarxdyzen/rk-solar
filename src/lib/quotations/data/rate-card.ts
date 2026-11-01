import { createClient } from "@/lib/supabase/server";
import type {
  RateCardCompany,
  RateCardModuleType,
  RateCardPackage,
  RateCardTree,
} from "@/lib/quotations/rate-card";
import {
  sortRateCardPanels,
  type RateCardPanel,
} from "@/lib/quotations/rate-card-panels";

const RATE_PANEL_COLS =
  "id, panel_name, name, sort_order, is_active, panel_wattage, panel_watt_peak, residential_regular_rate_per_kw, residential_premium_rate_per_kw, commercial_regular_rate_per_kw, commercial_premium_rate_per_kw, use_per_kw_pricing";

const RATE_PANEL_COLS_LEGACY =
  "id, panel_name, name, sort_order, is_active, panel_wattage, residential_regular_rate_per_kw, residential_premium_rate_per_kw, commercial_regular_rate_per_kw, commercial_premium_rate_per_kw, use_per_kw_pricing";

type RatePanelRow = {
  id: string;
  panel_name: string | null;
  name: string | null;
  sort_order: number | null;
  is_active: boolean | null;
  panel_wattage: number | null;
  panel_watt_peak?: string | null;
  residential_regular_rate_per_kw: number | null;
  residential_premium_rate_per_kw: number | null;
  commercial_regular_rate_per_kw: number | null;
  commercial_premium_rate_per_kw: number | null;
  use_per_kw_pricing: boolean | null;
};

function mapRatePanelRow(row: RatePanelRow): RateCardPanel {
  const wattage = row.panel_wattage != null ? Number(row.panel_wattage) : null;
  const wattPeak =
    row.panel_watt_peak?.trim() ||
    (wattage != null && wattage > 0 ? `${wattage}W` : null);

  return {
    id: row.id,
    panel_name: (row.panel_name ?? row.name ?? "").trim(),
    panel_wattage: wattage,
    panel_watt_peak: wattPeak,
    residential_regular_rate_per_kw:
      row.residential_regular_rate_per_kw != null
        ? Number(row.residential_regular_rate_per_kw)
        : null,
    residential_premium_rate_per_kw:
      row.residential_premium_rate_per_kw != null
        ? Number(row.residential_premium_rate_per_kw)
        : null,
    commercial_regular_rate_per_kw:
      row.commercial_regular_rate_per_kw != null
        ? Number(row.commercial_regular_rate_per_kw)
        : null,
    commercial_premium_rate_per_kw:
      row.commercial_premium_rate_per_kw != null
        ? Number(row.commercial_premium_rate_per_kw)
        : null,
    use_per_kw_pricing: row.use_per_kw_pricing ?? true,
    sort_order: row.sort_order ?? 0,
    is_active: row.is_active ?? true,
  };
}

export async function getRateCardPanels(): Promise<RateCardPanel[]> {
  const supabase = await createClient();
  const primary = await supabase
    .from("rate_card_companies")
    .select(RATE_PANEL_COLS)
    .order("sort_order")
    .order("panel_name");

  let rows: RatePanelRow[] | null = null;
  let error = primary.error;

  if (error && /panel_watt_peak/i.test(error.message ?? "")) {
    const legacy = await supabase
      .from("rate_card_companies")
      .select(RATE_PANEL_COLS_LEGACY)
      .order("sort_order")
      .order("panel_name");
    error = legacy.error;
    rows = (legacy.data ?? []) as RatePanelRow[];
  } else {
    rows = (primary.data ?? []) as RatePanelRow[];
  }

  if (error) throw error;

  return sortRateCardPanels((rows ?? []).map((row) => mapRatePanelRow(row)));
}

export async function getRateCardTree(): Promise<RateCardTree[]> {
  const supabase = await createClient();

  const [{ data: types, error: tErr }, { data: companies, error: cErr }, { data: packages, error: pErr }] =
    await Promise.all([
      supabase
        .from("rate_card_module_types")
        .select("id, name, module_family, capacity_label, sort_order, is_active")
        .order("sort_order"),
      supabase
        .from("rate_card_companies")
        .select(
          "id, module_type_id, name, panel_name, sort_order, is_active, panel_wattage, panel_watt_peak, residential_regular_rate_per_kw, residential_premium_rate_per_kw, commercial_regular_rate_per_kw, commercial_premium_rate_per_kw, use_per_kw_pricing"
        )
        .order("sort_order"),
      supabase
        .from("rate_card_packages")
        .select(
          "id, rate_company_id, system_size_kw, panel_count, list_price, min_sale_price, sort_order, is_active"
        )
        .order("sort_order"),
    ]);

  if (tErr) throw tErr;
  if (cErr) throw cErr;
  if (pErr) throw pErr;

  const pkgsByCompany = new Map<string, RateCardPackage[]>();
  for (const p of packages ?? []) {
    const row: RateCardPackage = {
      id: p.id,
      rate_company_id: p.rate_company_id,
      system_size_kw: Number(p.system_size_kw),
      panel_count: Number(p.panel_count),
      list_price: Number(p.list_price),
      min_sale_price: Number(p.min_sale_price),
      sort_order: p.sort_order,
      is_active: p.is_active,
    };
    const list = pkgsByCompany.get(p.rate_company_id) ?? [];
    list.push(row);
    pkgsByCompany.set(p.rate_company_id, list);
  }

  const cosByType = new Map<string, Array<RateCardCompany & { packages: RateCardPackage[] }>>();
  for (const co of companies ?? []) {
    const row = {
      id: co.id,
      module_type_id: co.module_type_id,
      name: co.name,
      panel_name: co.panel_name ?? null,
      sort_order: co.sort_order,
      is_active: co.is_active,
      panel_wattage: co.panel_wattage != null ? Number(co.panel_wattage) : null,
      panel_watt_peak: co.panel_watt_peak?.trim() || null,
      residential_regular_rate_per_kw:
        co.residential_regular_rate_per_kw != null
          ? Number(co.residential_regular_rate_per_kw)
          : null,
      residential_premium_rate_per_kw:
        co.residential_premium_rate_per_kw != null
          ? Number(co.residential_premium_rate_per_kw)
          : null,
      commercial_regular_rate_per_kw:
        co.commercial_regular_rate_per_kw != null
          ? Number(co.commercial_regular_rate_per_kw)
          : null,
      commercial_premium_rate_per_kw:
        co.commercial_premium_rate_per_kw != null
          ? Number(co.commercial_premium_rate_per_kw)
          : null,
      use_per_kw_pricing: co.use_per_kw_pricing ?? true,
      packages: pkgsByCompany.get(co.id) ?? [],
    };
    const list = cosByType.get(co.module_type_id) ?? [];
    list.push(row);
    if (co.module_type_id) {
      cosByType.set(co.module_type_id, list);
    }
  }

  return (types ?? []).map((t: RateCardModuleType) => ({
    ...t,
    companies: cosByType.get(t.id) ?? [],
  }));
}

export async function getRateCardPackageById(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rate_card_packages")
    .select(
      `
      id, rate_company_id, system_size_kw, panel_count, list_price, min_sale_price, sort_order, is_active,
      rate_company:rate_card_companies(
        id, name, module_type_id,
        module_type:rate_card_module_types(id, name, module_family, capacity_label)
      )
    `
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}
