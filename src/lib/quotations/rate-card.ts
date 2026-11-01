export type RateCardModuleType = {
  id: string;
  name: string;
  module_family: string;
  capacity_label: string;
  sort_order: number;
  is_active: boolean;
};

export type RateCardCompany = {
  id: string;
  module_type_id: string | null;
  name: string;
  panel_name?: string | null;
  sort_order: number;
  is_active: boolean;
  panel_wattage?: number | null;
  panel_watt_peak?: string | null;
  residential_regular_rate_per_kw?: number | null;
  residential_premium_rate_per_kw?: number | null;
  commercial_regular_rate_per_kw?: number | null;
  commercial_premium_rate_per_kw?: number | null;
  use_per_kw_pricing?: boolean;
};

export type RateCardPackage = {
  id: string;
  rate_company_id: string;
  system_size_kw: number;
  panel_count: number;
  list_price: number;
  min_sale_price: number;
  sort_order: number;
  is_active: boolean;
};

export type RateCardTree = RateCardModuleType & {
  companies: Array<
    RateCardCompany & {
      packages: RateCardPackage[];
    }
  >;
};

export function packageOptionLabel(pkg: RateCardPackage): string {
  const size = Number(pkg.system_size_kw);
  const price = Math.round(Number(pkg.list_price)).toLocaleString("en-IN");
  return `${size} kW · ${pkg.panel_count} panels · ₹${price}`;
}
