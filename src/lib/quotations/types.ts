export const QUOTE_TEMPLATE_KINDS = ["solar", "premium", "non_solar"] as const;
export type QuoteTemplateKind = (typeof QUOTE_TEMPLATE_KINDS)[number];

export const QUOTE_STATUSES = ["draft", "sent", "accepted", "rejected"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_TEMPLATE_LABELS: Record<QuoteTemplateKind, string> = {
  solar: "Regular solar quotation",
  premium: "Premium solar quotation",
  non_solar: "Non-solar quotation",
};

/** Solar turnkey builder (per-kW rate card) — includes legacy `premium` template_kind. */
export function usesSolarRateCardBuilder(kind: QuoteTemplateKind): boolean {
  return kind === "solar" || kind === "premium";
}

/** Premium tier: explicit tier_type, legacy template_kind, or default for solar quotes. */
export function isPremiumSolarQuote(quote: {
  template_kind?: string | null;
  tier_type?: string | null;
}): boolean {
  if (quote.template_kind === "premium") return true;
  if (quote.template_kind !== "solar") return false;
  return quote.tier_type !== "regular";
}

export function quoteTemplateDisplayLabel(quote: {
  template_kind: string;
  tier_type?: string | null;
}): string {
  if (quote.template_kind === "non_solar") return QUOTE_TEMPLATE_LABELS.non_solar;
  if (isPremiumSolarQuote(quote)) return QUOTE_TEMPLATE_LABELS.premium;
  return "Regular (general) solar quotation";
}

/** Normalize DB / legacy values before choosing a print layout. */
export function resolvePrintTemplateKind(kind: string | null | undefined): QuoteTemplateKind {
  if (kind === "premium" || kind === "non_solar" || kind === "solar") return kind;
  return "solar";
}

/** Multi-page solar proposal PDF (regular + premium per-kW packages). */
export function usesSolarProposalPrint(kind: QuoteTemplateKind): boolean {
  return kind === "solar" || kind === "premium";
}

/** @deprecated Legacy BOM-only PDF — new premium quotes use solar proposal print. */
export function usesBomProposalPrint(_kind: QuoteTemplateKind): boolean {
  return false;
}

/** Standalone appliance PDF (heat pump, SWH, RO, etc.). */
export function usesApplianceProposalPrint(kind: QuoteTemplateKind): boolean {
  return kind === "non_solar";
}

/** Premium BOM builder — system size, meter, subsidy fields. */
export function usesResidentialBomFields(kind: QuoteTemplateKind): boolean {
  return kind === "premium";
}

/** Non-PV appliance quotes — unit pricing, no solar BOM fields. */
export function isApplianceQuotation(kind: QuoteTemplateKind): boolean {
  return kind === "non_solar";
}

export function isBomCatalogModel(model: string | null | undefined): boolean {
  const m = model ?? "";
  return m.startsWith("PREMIUM-BOM-") || m.startsWith("REGULAR-BOM-");
}

export function isApplianceCatalogModel(model: string | null | undefined): boolean {
  return (model ?? "").startsWith("APPLIANCE-");
}

/** Match catalogue rows to a quotation template (includes legacy BOM model prefixes). */
export function catalogItemMatchesTemplate(
  item: Pick<CatalogItem, "model" | "template_kind">,
  templateKind: QuoteTemplateKind
): boolean {
  const model = item.model ?? "";

  if (templateKind === "non_solar") {
    if (isBomCatalogModel(model)) return false;
    return (
      isApplianceCatalogModel(model) ||
      item.template_kind === "non_solar" ||
      item.template_kind === "both"
    );
  }

  if (item.template_kind === templateKind || item.template_kind === "both") return true;
  if (templateKind === "premium" && model.startsWith("PREMIUM-BOM-")) return true;
  if (templateKind === "solar" && model.startsWith("REGULAR-BOM-")) return true;
  return false;
}

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  rejected: "Rejected",
};

export type CatalogItem = {
  id: string;
  item_name: string;
  model: string | null;
  capacity_label: string | null;
  unit: string;
  gst_percent: number;
  base_rate: number;
  template_kind: string;
  image_url?: string | null;
  brand?: { id: string; name: string } | { id: string; name: string }[] | null;
  category?:
    | { id: string; name: string; kind: string }
    | { id: string; name: string; kind: string }[]
    | null;
};

export type QuotationItemRow = {
  id?: string;
  item_id: string | null;
  sort_order: number;
  item_name_snapshot: string;
  brand_snapshot: string | null;
  model_snapshot: string | null;
  quantity: number;
  unit: string;
  rate: number;
  gst_percent: number;
  discount_value: number;
  line_total: number;
  image_url_snapshot?: string | null;
  brand_image_url_snapshot?: string | null;
};

export type QuotationRow = {
  id: string;
  company_id: string;
  quotation_no: string;
  lead_id: string | null;
  template_kind: QuoteTemplateKind;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string | null;
  customer_city: string | null;
  status: QuoteStatus;
  quote_date: string;
  valid_till: string | null;
  system_size_kw: number | null;
  meter_charges: number;
  subsidy: number;
  subtotal: number;
  discount_total: number;
  discount_percent: number;
  taxable_total: number;
  gst_total: number;
  grand_total: number;
  notes: string | null;
  terms: string | null;
  created_at: string;
  updated_at: string;
  /** Rate-card package snapshot (solar builder) */
  project_type?: string | null;
  rate_package_id?: string | null;
  module_type_name?: string | null;
  module_company_name?: string | null;
  module_capacity_label?: string | null;
  inverter_type_name?: string | null;
  inverter_size_label?: string | null;
  panel_count?: number | null;
  system_cost?: number | null;
  min_sale_price_snapshot?: number | null;
  subsidy_scheme?: string | null;
  meter_phase?: string | null;
  meter_charge_amount?: number | null;
  meter_phase_label?: string | null;
  price_per_kw_excl_gst?: number | null;
  commercial_gst_percent?: number | null;
  geda_charge_amount?: number | null;
  panel_mount_type?: string | null;
  site_charges?: unknown;
  tier_type?: string | null;
  rate_per_kw_snapshot?: number | null;
  net_payable_amount?: number | null;
  items?: QuotationItemRow[];
};

/** Builder line payload (camelCase) used by the solar rate-card builder. */
export type QuoteItemInput = {
  itemId?: string;
  itemName: string;
  brand?: string;
  model?: string;
  quantity: number;
  unit: string;
  rate: number;
  gstPercent: number;
  discountValue: number;
  imageUrl?: string;
  /** Brand logo for BOM Brand column (e.g. inverter brand). */
  brandImageUrl?: string;
};
