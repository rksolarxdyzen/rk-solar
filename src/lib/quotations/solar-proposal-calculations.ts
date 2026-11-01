import type { SolarProposalTemplate } from "@/lib/quotations/quotation-template";
import type { QuotationBankAccount } from "@/lib/quotations/bank-accounts";
import { resolveQuotationSubsidyBreakdown } from "@/lib/quotations/subsidy";

export type ProposalLineItem = {
  item_name_snapshot: string;
  brand_snapshot?: string | null;
  model_snapshot?: string | null;
  quantity: number;
  unit: string;
  rate: number;
  gst_percent: number;
  line_total: number;
  image_url_snapshot?: string | null;
  brand_image_url_snapshot?: string | null;
};

export type ProposalInput = {
  quotationNo: string;
  quoteDate: string;
  validTill?: string | null;
  customerName: string;
  customerPhone: string;
  customerAddress?: string | null;
  projectType?: "residential" | "commercial";
  subsidyScheme?: "residential" | "society_common_meter" | "none";
  siteCharges?: unknown;
  items: ProposalLineItem[];
  subtotal: number;
  discountTotal: number;
  taxableTotal: number;
  gstTotal: number;
  grandTotal: number;
  subsidy?: number;
  terms?: string | null;
  notes?: string | null;
  paymentTerms?: string | null;
  moduleTypeName?: string | null;
  moduleCompanyName?: string | null;
  moduleCapacityLabel?: string | null;
  inverterTypeName?: string | null;
  inverterSizeLabel?: string | null;
  systemSizeKw?: number | null;
  panelCount?: number | null;
  systemCost?: number | null;
  discountAmount?: number | null;
  meterPhase?: string | null;
  meterChargeAmount?: number | null;
  meterPhaseLabel?: string | null;
  panelMountType?: string | null;
  tierType?: "premium" | "regular" | null;
};

export type CompanyInfo = {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  gstin?: string | null;
  bankAccountName?: string | null;
  bankName?: string | null;
  accountNumber?: string | null;
  ifscCode?: string | null;
  branch?: string | null;
  /** Enabled accounts to print (already capped). When set, replaces the single flat bank block. */
  bankAccounts?: QuotationBankAccount[];
};

export type BomRow = {
  component: string;
  specification: string;
  brand?: string | null;
  brandImageUrl?: string | null;
  qty: string;
  rate: number | null;
  gstPercent: number | null;
  lineTotal: number | null;
  showPricing: boolean;
  imageUrl?: string | null;
  isTotal?: boolean;
};

export type BomPricingPermissions = {
  canViewQuotationPricing?: boolean;
  canViewItemPricing?: boolean;
};

const MONTHLY_WEIGHTS = [0.09, 0.09, 0.1, 0.1, 0.1, 0.08, 0.067, 0.067, 0.072, 0.081, 0.081, 0.093];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtMoney(v: number) {
  return `₹ ${Math.round(v).toLocaleString("en-IN")}`;
}

export function formatProposalDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function scopeItems(text: string) {
  return text.split("\n").map((s) => s.trim()).filter(Boolean);
}

const BOOKING_ADVANCE = 5000;
const POST_INSTALL_HOLD = 5000;

/**
 * Default payment schedule text for the builder's "reset to default" action —
 * mirrors the schedule rendered on the proposal when no custom terms are set.
 */
export const DEFAULT_ELECTRICITY_BOARD_LABEL = "State Electricity Board";

export function meterFileSubmitLabel(electricityBoardLabel?: string | null) {
  const board = electricityBoardLabel?.trim() || DEFAULT_ELECTRICITY_BOARD_LABEL;
  return `After Installation Before ${board} Meter File Submit`;
}

export function formatDefaultPaymentTerms(payable: number, electricityBoardLabel?: string | null) {
  const base = Math.max(0, Number(payable) || 0);
  const material = Math.max(0, base - BOOKING_ADVANCE - POST_INSTALL_HOLD);
  return [
    `ADV — ${fmtMoney(BOOKING_ADVANCE)} — Advance / Booking Amount Along With Documents`,
    `${fmtMoney(material)} — At The Time Of Material Received`,
    `${fmtMoney(POST_INSTALL_HOLD)} — ${meterFileSubmitLabel(electricityBoardLabel)}`,
  ].join("\n");
}

function deriveSystemCapacity(items: ProposalLineItem[]) {
  let panelKw = 0;
  let inverterKw = 0;
  for (const item of items) {
    const name = `${item.brand_snapshot ?? ""} ${item.item_name_snapshot ?? ""}`.toLowerCase();
    const wp = name.match(/(\d{3,4})\s*w(p)?/);
    if (wp && (name.includes("panel") || name.includes("module") || name.includes("solar") || name.includes("wp"))) {
      panelKw += (Number(wp[1]) * item.quantity) / 1000;
    }
    const inv = name.match(/(\d+(?:\.\d+)?)\s*kw/);
    if (inv && name.includes("inverter")) {
      inverterKw = Math.max(inverterKw, Number(inv[1]) * item.quantity);
    }
  }
  panelKw = Math.round(panelKw * 10) / 10;
  inverterKw = Math.round(inverterKw * 10) / 10;
  return {
    panelKw,
    inverterKw,
    capacityKw: panelKw || inverterKw,
  };
}

function calcProductItemsTotal(items: ProposalLineItem[]) {
  return items.reduce((sum, item) => sum + Number(item.line_total), 0);
}

function systemCapacityLabel(panelKw: number, inverterKw: number) {
  if (panelKw && inverterKw) return `${panelKw} kW solar + ${inverterKw} kW inverter`;
  if (panelKw) return `${panelKw} kW solar system`;
  if (inverterKw) return `${inverterKw} kW inverter system`;
  return "Solar system";
}

function classifyProposalItem(item: ProposalLineItem): "panel" | "inverter" | "other" {
  const snapshot = item.item_name_snapshot ?? "";
  const name = snapshot.toLowerCase();
  if (/^solar module$/i.test(snapshot) || name.includes("solar module") || name.includes("pv module")) {
    return "panel";
  }
  if (name.includes("inverter")) return "inverter";
  if (name.includes("panel") || name.includes("module")) return "panel";
  return "other";
}

function proposalToBomRow(item: ProposalLineItem, showPricing: boolean): BomRow {
  const brand = item.brand_snapshot?.trim() || null;
  const name = (item.item_name_snapshot ?? "").trim() || "Item";
  const model = item.model_snapshot?.trim();
  const sizeMatch = name.match(/(\d+(?:\.\d+)?\s*(?:kw|wp|w)\b.*)$/i);
  return {
    component: name,
    specification: model || sizeMatch?.[1]?.trim() || "As Per System",
    brand,
    brandImageUrl: item.brand_image_url_snapshot?.trim() || null,
    qty: `${item.quantity} ${item.unit}`,
    rate: showPricing ? item.rate : null,
    gstPercent: showPricing ? item.gst_percent : null,
    lineTotal: showPricing ? Number(item.line_total) : null,
    showPricing: showPricing && Number(item.rate) > 0,
    imageUrl: item.image_url_snapshot?.trim() || null,
  };
}

/** BOM rows mapped from quotation line items and fixed template BOS. */
export function buildBomRows(
  items: ProposalLineItem[],
  _siteCharges?: unknown,
  permissions?: BomPricingPermissions,
  standardBomItems?: SolarProposalTemplate["standardBomItems"]
): BomRow[] {
  const canViewQuote = permissions?.canViewQuotationPricing ?? true;
  const canViewItems = permissions?.canViewItemPricing ?? true;
  const showItemPricing = canViewQuote && canViewItems;

  const panels: ProposalLineItem[] = [];
  const inverters: ProposalLineItem[] = [];
  const others: ProposalLineItem[] = [];

  for (const item of items ?? []) {
    if (/solar pv system package/i.test(item.item_name_snapshot ?? "")) continue;
    const kind = classifyProposalItem(item);
    if (kind === "panel") panels.push(item);
    else if (kind === "inverter") inverters.push(item);
    else others.push(item);
  }

  const rows: BomRow[] = [];
  for (const item of [...panels, ...inverters]) {
    rows.push(proposalToBomRow(item, showItemPricing));
  }

  for (const fixed of standardBomItems ?? []) {
    rows.push({
      component: fixed.component,
      specification: fixed.specification || "As Per System",
      brand: fixed.brand ?? null,
      brandImageUrl: fixed.brandImageUrl ?? null,
      qty: fixed.qty || "—",
      rate: null,
      gstPercent: null,
      lineTotal: null,
      showPricing: false,
    });
  }

  for (const item of others) {
    rows.push(proposalToBomRow(item, showItemPricing));
  }

  const pricedTotal = rows.filter((r) => r.showPricing).reduce((sum, row) => sum + (row.lineTotal ?? 0), 0);
  if (canViewQuote && rows.some((r) => r.showPricing)) {
    rows.push({
      component: "BOM Total (incl. GST)",
      specification: "",
      qty: "",
      rate: null,
      gstPercent: null,
      lineTotal: pricedTotal,
      showPricing: true,
      isTotal: true,
    });
  }

  return rows;
}

export function calculateSolarProposal(data: ProposalInput, template: SolarProposalTemplate) {
  const derived = deriveSystemCapacity(data.items);
  const panelKw =
    data.systemSizeKw != null && data.systemSizeKw > 0 ? Number(data.systemSizeKw) : derived.panelKw;
  const inverterKw = derived.inverterKw;
  const capacityKw = panelKw || derived.capacityKw;

  const itemsTotal = calcProductItemsTotal(data.items);
  const listSystemCost =
    data.systemCost != null && Number(data.systemCost) > 0 ? Number(data.systemCost) : itemsTotal;
  const discountAmt = Math.max(
    0,
    Math.min(
      data.discountAmount != null && Number.isFinite(Number(data.discountAmount))
        ? Number(data.discountAmount)
        : Number(data.discountTotal) || 0,
      listSystemCost
    )
  );
  const systemPackageTotal = Math.max(0, listSystemCost - discountAmt);

  const pr = template.performanceRatio / 100;
  const systemPrice = data.taxableTotal;
  const gstAmt = data.gstTotal;
  const gstPct = systemPrice > 0 ? Math.round((gstAmt / systemPrice) * 1000) / 10 : 0;
  const add = template.additionalCharges;
  const nm =
    data.meterChargeAmount != null && Number.isFinite(Number(data.meterChargeAmount))
      ? Number(data.meterChargeAmount)
      : template.netMeterCharges;
  const meterPhaseLabel = data.meterPhaseLabel?.trim() || null;

  const projectType = data.projectType ?? "residential";
  const subsidyBreakdown = resolveQuotationSubsidyBreakdown({
    systemSizeKw: capacityKw,
    projectType,
    subsidyScheme: data.subsidyScheme,
    subsidy: data.subsidy,
  });
  const sub = subsidyBreakdown.total;

  const payableBeforeSubsidy = systemPackageTotal + add + nm;
  const totalCost = payableBeforeSubsidy - sub;

  const annualGen = capacityKw * template.yieldPerKw * pr;
  const annualSav = annualGen * template.tariff;
  const payback = annualSav > 0 ? totalCost / annualSav : 0;
  const co2 = (annualGen * template.co2Factor) / 1000;
  const trees = annualGen * template.treeFactor;

  const monthlyGen = MONTHLY_WEIGHTS.map((w) => annualGen * w);
  const monthlySav = monthlyGen.map((v) => v * template.tariff);
  const esc = template.escalation / 100;
  const beforeSolar = Array.from({ length: 30 }, (_, i) => annualSav * Math.pow(1 + esc, i));
  const afterSolar = beforeSolar.map((v) => Math.max(0, v - annualSav));

  const y1Dep = totalCost * 0.4;
  const y1Bal = totalCost - y1Dep;
  const y2Dep = y1Bal * 0.4;
  const y2Bal = y1Bal - y2Dep;
  const y3Dep = y2Bal * 0.25;
  const taxBenefitTotal = (y1Dep + y2Dep + y3Dep) * 0.3;

  const intro = (template.aboutIntro || "")
    .replace(/\{company\}/g, "our company")
    .replace(/\{capacity\}/g, String(capacityKw || "—"))
    .replace(/\{client\}/g, data.customerName)
    .replace(/\{address\}/g, data.customerAddress ?? "your site");

  const dynamicIntro = `${intro} Based on a ${capacityKw || "—"} kW system, expected annual generation is approximately ${Math.round(annualGen).toLocaleString("en-IN")} units with estimated savings of ${fmtMoney(annualSav)} per year and a payback of about ${payback.toFixed(1)} years.`;

  const benefits = [
    ...(Array.isArray(template.keyBenefits) ? template.keyBenefits.slice(0, 3) : []),
    `Tax depreciation benefit up to ${fmtMoney(taxBenefitTotal)} over 3 years`,
    `CO₂ reduction of ${co2.toFixed(2)} tonnes per year`,
  ];

  const bookingAdvance = 5000;
  const postInstallHold = 5000;
  const paymentBase = Math.max(0, payableBeforeSubsidy);
  const materialAmount = Math.max(0, paymentBase - bookingAdvance - postInstallHold);
  const paymentSteps = [
    {
      amount: bookingAdvance,
      tag: "ADV" as string | null,
      label: "Advance / Booking Amount Along With Documents",
      note: null as string | null,
      fixed: true,
    },
    {
      amount: materialAmount,
      tag: null as string | null,
      label: "At The Time Of Material Received",
      note: "(Cheque / DD / NEFT / RTGS / UPI proof required before installation start)",
      fixed: false,
    },
    {
      amount: postInstallHold,
      tag: null as string | null,
      label: meterFileSubmitLabel(template.electricityBoardLabel),
      note: null as string | null,
      fixed: true,
    },
  ];

  const loanTerms = scopeItems(template.loanPaymentNote);

  return {
    capacityKw,
    panelKw,
    inverterKw,
    systemCapacityLabel: systemCapacityLabel(panelKw, inverterKw),
    systemPackageTotal,
    listSystemCost,
    discountAmount: discountAmt,
    heightChargeSubtotal: 0,
    systemPrice,
    gstAmt,
    gstPct,
    add,
    nm,
    meterPhaseLabel,
    geda: 0,
    panelMountLabel: null as string | null,
    commercialPricing: null as { base: number; gst: number; total: number } | null,
    commercialGstPercent: 0,
    pricePerKwExclGst: null as number | null,
    sub,
    subsidyLines: subsidyBreakdown.lines,
    subsidyScheme: subsidyBreakdown.scheme,
    subsidyTitle: subsidyBreakdown.title,
    subsidyNotes: subsidyBreakdown.notes,
    payableBeforeSubsidy,
    totalCost: Math.max(0, totalCost),
    annualGen,
    annualSav,
    payback,
    co2,
    trees,
    monthlyGen,
    monthlySav,
    beforeSolar,
    afterSolar,
    taxBenefitTotal,
    benefits,
    dynamicIntro,
    paymentSteps,
    loanTerms,
    months: MONTHS,
  };
}
