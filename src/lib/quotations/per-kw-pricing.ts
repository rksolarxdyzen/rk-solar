import type { QuoteTier } from "@/components/quotations/quote-tier-toggle";
import type { RateCardCompany } from "@/lib/quotations/rate-card";
import type { ProjectType } from "@/lib/quotations/project-type";

export function parsePanelWattage(capacityLabel: string, fallback = 540): number {
  const match = capacityLabel.match(/(\d{3,4})/);
  if (!match) return fallback;
  const n = Number(match[1]);
  return n >= 300 && n <= 800 ? n : fallback;
}

export function calcSystemKw(panelWattage: number, panelCount: number): number {
  if (panelWattage <= 0 || panelCount <= 0) return 0;
  return Math.round(((panelWattage * panelCount) / 1000) * 100) / 100;
}

export function calcTurnkeySystemCost(systemKw: number, ratePerKw: number): number {
  if (systemKw <= 0 || ratePerKw <= 0) return 0;
  return Math.round(systemKw * ratePerKw * 100) / 100;
}

export type PerKwRateSource = Pick<
  RateCardCompany,
  | "panel_wattage"
  | "panel_watt_peak"
  | "residential_regular_rate_per_kw"
  | "residential_premium_rate_per_kw"
  | "commercial_regular_rate_per_kw"
  | "commercial_premium_rate_per_kw"
  | "use_per_kw_pricing"
>;

export function companyUsesPerKwPricing(company: PerKwRateSource | null | undefined): boolean {
  if (!company) return false;
  return (
    getPerKwRate(company, "residential", "regular") != null ||
    getPerKwRate(company, "residential", "premium") != null ||
    getPerKwRate(company, "commercial", "regular") != null ||
    getPerKwRate(company, "commercial", "premium") != null
  );
}

export function getPerKwRate(
  company: PerKwRateSource,
  projectType: ProjectType,
  tier: QuoteTier
): number | null {
  const isCommercial = projectType === "commercial";
  const isPremium = tier === "premium";

  const primary = isCommercial
    ? isPremium
      ? company.commercial_premium_rate_per_kw
      : company.commercial_regular_rate_per_kw
    : isPremium
      ? company.residential_premium_rate_per_kw
      : company.residential_regular_rate_per_kw;

  if (primary != null && Number(primary) > 0) return Number(primary);

  // Fall back to the other tier for the same project type so quotes still price
  // when only one of Premium/Regular is configured.
  const fallback = isCommercial
    ? isPremium
      ? company.commercial_regular_rate_per_kw
      : company.commercial_premium_rate_per_kw
    : isPremium
      ? company.residential_regular_rate_per_kw
      : company.residential_premium_rate_per_kw;

  if (fallback != null && Number(fallback) > 0) return Number(fallback);
  return null;
}

export function resolvePanelWattage(
  company: PerKwRateSource | null | undefined,
  capacityLabel: string
): number {
  if (company?.panel_watt_peak?.trim()) {
    return parsePanelWattage(company.panel_watt_peak.trim());
  }
  if (company?.panel_wattage && company.panel_wattage > 0) {
    return company.panel_wattage;
  }
  return parsePanelWattage(capacityLabel);
}

export function calcPerKwQuotePricing(input: {
  company: PerKwRateSource;
  capacityLabel: string;
  panelCount: number;
  projectType: ProjectType;
  tier: QuoteTier;
}) {
  const panelWattage = resolvePanelWattage(input.company, input.capacityLabel);
  const systemKw = calcSystemKw(panelWattage, input.panelCount);
  const ratePerKw = getPerKwRate(input.company, input.projectType, input.tier);
  const systemCost = ratePerKw ? calcTurnkeySystemCost(systemKw, ratePerKw) : 0;

  return {
    panelWattage,
    systemKw,
    ratePerKw: ratePerKw ?? 0,
    systemCost,
    minSalePrice: systemCost,
  };
}
