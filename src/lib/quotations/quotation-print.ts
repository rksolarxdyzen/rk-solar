import { BRAND } from "@/lib/quotations/brand";
import type { CompanyInfo, ProposalInput } from "@/lib/quotations/solar-proposal-calculations";
import {
  DEFAULT_SOLAR_TEMPLATE,
  normalizeSolarTemplate,
  type SolarProposalTemplate,
} from "@/lib/quotations/quotation-template";
import type { QuotationRow } from "@/lib/quotations/types";
import { printableBankAccounts, resolveBankAccounts } from "@/lib/quotations/bank-accounts";

type QuotationCompanySettings = {
  quotation_template?: unknown;
  quotation_terms?: string | null;
  quotation_notes_footer?: string | null;
  from_name?: string | null;
  from_phone?: string | null;
  from_email?: string | null;
  bank_account_name?: string | null;
  bank_name?: string | null;
  account_number?: string | null;
  ifsc_code?: string | null;
  branch?: string | null;
} | null;

type CompanyRow = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  gstin?: string | null;
} | null;

export function resolveQuotationTemplate(settings?: QuotationCompanySettings): SolarProposalTemplate {
  return normalizeSolarTemplate(settings?.quotation_template, {
    termsText: settings?.quotation_terms,
    footerText: settings?.quotation_notes_footer,
    preparedBy: settings?.from_name,
    preparedByPhone: settings?.from_phone,
  });
}

export function buildQuotationPrintData(
  quote: QuotationRow,
  template: SolarProposalTemplate
): ProposalInput {
  const productItems = (quote.items ?? []).map((item) => ({
    item_name_snapshot: item.item_name_snapshot,
    brand_snapshot: item.brand_snapshot,
    model_snapshot: item.model_snapshot,
    quantity: Number(item.quantity),
    unit: item.unit || "nos",
    rate: Number(item.rate),
    gst_percent: Number(item.gst_percent),
    line_total: Number(item.line_total),
    image_url_snapshot: item.image_url_snapshot ?? null,
    brand_image_url_snapshot: item.brand_image_url_snapshot ?? null,
  }));

  const meterChargeAmount =
    quote.meter_charge_amount != null
      ? Number(quote.meter_charge_amount)
      : Number(quote.meter_charges) || 0;

  return {
    quotationNo: quote.quotation_no,
    quoteDate: quote.quote_date,
    validTill: quote.valid_till,
    customerName: quote.customer_name?.trim() || "N/A",
    customerPhone: quote.customer_phone ?? "",
    customerAddress: quote.customer_address ?? "",
    projectType: quote.project_type === "commercial" ? "commercial" : "residential",
    subsidyScheme:
      quote.subsidy_scheme === "society_common_meter"
        ? "society_common_meter"
        : quote.subsidy_scheme === "none" || quote.project_type === "commercial"
          ? "none"
          : "residential",
    siteCharges: quote.site_charges ?? null,
    items: productItems,
    subtotal: Number(quote.subtotal),
    discountTotal: Number(quote.discount_total),
    taxableTotal: Number(quote.taxable_total),
    gstTotal: Number(quote.gst_total),
    grandTotal: Number(quote.grand_total),
    notes: quote.notes ?? null,
    paymentTerms: quote.terms ?? null,
    discountAmount: Number(quote.discount_total) || 0,
    subsidy: quote.subsidy != null ? Number(quote.subsidy) : template.defaultSubsidy,
    moduleTypeName: quote.module_type_name ?? null,
    moduleCompanyName: quote.module_company_name ?? null,
    moduleCapacityLabel: quote.module_capacity_label ?? null,
    inverterTypeName: quote.inverter_type_name ?? null,
    inverterSizeLabel: quote.inverter_size_label ?? null,
    systemSizeKw: quote.system_size_kw != null ? Number(quote.system_size_kw) : null,
    panelCount: quote.panel_count != null ? Number(quote.panel_count) : null,
    systemCost: quote.system_cost != null ? Number(quote.system_cost) : null,
    meterPhase: quote.meter_phase ?? null,
    meterChargeAmount,
    meterPhaseLabel:
      quote.meter_phase_label?.trim() || (meterChargeAmount > 0 ? "As per DISCOM" : null),
    panelMountType: quote.panel_mount_type ?? null,
    tierType: quote.tier_type === "regular" ? "regular" : quote.tier_type === "premium" ? "premium" : null,
  };
}

export function buildCompanyPrintInfo(
  settings?: QuotationCompanySettings,
  company?: CompanyRow,
  template?: SolarProposalTemplate
): CompanyInfo {
  const resolvedTemplate = template ?? resolveQuotationTemplate(settings);
  return {
    bankAccounts: printableBankAccounts(resolveBankAccounts(resolvedTemplate, settings)),
    name: settings?.from_name?.trim() || company?.name?.trim() || BRAND.name,
    phone: settings?.from_phone?.trim() || company?.phone?.trim() || BRAND.contact.phone || null,
    email: settings?.from_email?.trim() || company?.email?.trim() || BRAND.contact.email || null,
    address: company?.address?.trim() || BRAND.contact.address || null,
    gstin: company?.gstin?.trim() || null,
    bankAccountName: settings?.bank_account_name?.trim() || BRAND.bank.accountName || null,
    bankName: settings?.bank_name?.trim() || BRAND.bank.bankName || null,
    accountNumber: settings?.account_number?.trim() || BRAND.bank.accountNumber || null,
    ifscCode: settings?.ifsc_code?.trim() || BRAND.bank.ifscCode || null,
    branch: settings?.branch?.trim() || BRAND.bank.branch || null,
  };
}

export { DEFAULT_SOLAR_TEMPLATE };
