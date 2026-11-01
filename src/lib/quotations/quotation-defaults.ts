import { normalizeSiteCharges } from "@/lib/quotations/site-charges";
import { parseProjectType } from "@/lib/quotations/project-type";
import { parseSubsidyScheme } from "@/lib/quotations/subsidy";
import { normalizeCommercialGstPercent, parsePanelMountType } from "@/lib/quotations/commercial";
import { METER_PHASES, type MeterPhase } from "@/lib/quotations/meter-phase";
import type { QuotationPayload } from "@/lib/quotations/validations";
import type { QuotationRow } from "@/lib/quotations/types";

const num = (v: unknown) => (v == null ? null : Number(v));

function parseMeterPhase(value: unknown): MeterPhase | null {
  return (METER_PHASES as readonly string[]).includes(String(value))
    ? (value as MeterPhase)
    : null;
}

/** Maps a saved quotation row onto the solar builder's form defaults. */
export function quotationToBuilderDefaults(
  quote: QuotationRow
): Partial<QuotationPayload> & { id: string } {
  const systemCost = num(quote.system_cost) ?? 0;
  const discountAmount = Number(quote.discount_total ?? 0);

  return {
    id: quote.id,
    leadId: quote.lead_id ?? undefined,
    customerName: quote.customer_name,
    customerPhone: quote.customer_phone ?? "",
    address: quote.customer_address ?? "",
    projectType: parseProjectType(quote.project_type ?? "residential"),
    quotationNo: quote.quotation_no,
    quoteDate: quote.quote_date,
    validTill: quote.valid_till ?? quote.quote_date,
    status: quote.status,
    notes: quote.notes ?? "",
    terms: quote.terms ?? "",
    siteCharges: normalizeSiteCharges(quote.site_charges),
    items: (quote.items ?? []).map((item) => ({
      itemId: item.item_id ?? undefined,
      itemName: item.item_name_snapshot,
      brand: item.brand_snapshot ?? "",
      model: item.model_snapshot ?? "",
      quantity: Number(item.quantity),
      unit: item.unit,
      rate: Number(item.rate),
      gstPercent: Number(item.gst_percent),
      discountValue: Number(item.discount_value),
      imageUrl: item.image_url_snapshot ?? undefined,
      brandImageUrl: item.brand_image_url_snapshot ?? undefined,
    })),
    ratePackageId: quote.rate_package_id ?? null,
    moduleTypeName: quote.module_type_name ?? null,
    moduleCompanyName: quote.module_company_name ?? null,
    moduleCapacityLabel: quote.module_capacity_label ?? null,
    inverterTypeName: quote.inverter_type_name ?? null,
    inverterSizeLabel: quote.inverter_size_label ?? null,
    systemSizeKw: num(quote.system_size_kw),
    panelCount: num(quote.panel_count),
    systemCost,
    minSalePriceSnapshot: num(quote.min_sale_price_snapshot),
    discountPercent: Number(quote.discount_percent ?? 0),
    discountAmount,
    subsidyScheme: parseSubsidyScheme(quote.subsidy_scheme),
    subsidy: num(quote.subsidy),
    meterPhase: parseMeterPhase(quote.meter_phase),
    meterChargeAmount: num(quote.meter_charge_amount) ?? num(quote.meter_charges),
    meterPhaseLabel: quote.meter_phase_label ?? null,
    pricePerKwExclGst: num(quote.price_per_kw_excl_gst),
    commercialGstPercent:
      quote.commercial_gst_percent != null
        ? normalizeCommercialGstPercent(Number(quote.commercial_gst_percent))
        : null,
    gedaChargeAmount: num(quote.geda_charge_amount),
    panelMountType: parsePanelMountType(quote.panel_mount_type),
    tierType: quote.tier_type === "regular" ? "regular" : "premium",
    ratePerKwSnapshot: num(quote.rate_per_kw_snapshot),
    netPayableAmount: num(quote.net_payable_amount),
  };
}
