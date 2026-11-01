/** Quotation line + header math. */

import { calcSiteChargesTotals, defaultSiteCharges, type SiteCharges } from "@/lib/quotations/site-charges";

/** Minimal shape needed for line math — QuoteItemInput satisfies it. */
export type QuoteLineInput = {
  quantity: number;
  rate: number;
  gstPercent: number;
  discountValue: number;
};

const r2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

export function calcLineTotal(item: QuoteLineInput) {
  const base = Math.max(0, item.quantity * item.rate - item.discountValue);
  return r2(base + (base * item.gstPercent) / 100);
}

export function calcItemTotals(items: QuoteLineInput[]) {
  const s = items.reduce(
    (acc, item) => {
      const gross = item.quantity * item.rate;
      const base = Math.max(0, gross - item.discountValue);
      const gst = (base * item.gstPercent) / 100;
      return {
        subtotal: acc.subtotal + gross,
        discount: acc.discount + item.discountValue,
        taxable: acc.taxable + base,
        gst: acc.gst + gst,
        total: acc.total + base + gst,
      };
    },
    { subtotal: 0, discount: 0, taxable: 0, gst: 0, total: 0 }
  );
  return {
    subtotal: r2(s.subtotal),
    discount: r2(s.discount),
    taxable: r2(s.taxable),
    gst: r2(s.gst),
    total: r2(s.total),
  };
}

/**
 * Rate-card (solar) builder totals: line items plus optional site charges.
 * Meter / GEDA charges are added on top by the caller since they are stored
 * as their own snapshot columns.
 */
export function calcQuotationTotals(items: QuoteLineInput[], siteCharges?: SiteCharges) {
  const itemsPart = calcItemTotals(items);
  const site = calcSiteChargesTotals(siteCharges ?? defaultSiteCharges());
  return {
    subtotal: r2(itemsPart.subtotal + site.subtotal),
    discount: itemsPart.discount,
    taxable: r2(itemsPart.taxable + site.subtotal),
    gst: r2(itemsPart.gst + site.gst),
    total: r2(itemsPart.total + site.total),
    itemsSubtotal: itemsPart.subtotal,
    itemsGst: itemsPart.gst,
    itemsTotal: itemsPart.total,
    siteSubtotal: site.subtotal,
    siteGst: site.gst,
    siteTotal: site.total,
    siteLines: site.lines,
  };
}

/**
 * Simple (non-solar) totals: header discount ₹ applied after line totals,
 * then meter charges and subsidy.
 */
export function calcSimpleQuotationTotals(input: {
  items: QuoteLineInput[];
  headerDiscountValue?: number;
  headerDiscountPercent?: number;
  meterCharges?: number;
  subsidy?: number;
}) {
  const itemsPart = calcItemTotals(input.items);
  let headerDiscount = r2(input.headerDiscountValue ?? 0);
  const pct = input.headerDiscountPercent ?? 0;
  if (pct > 0 && !(input.headerDiscountValue && input.headerDiscountValue > 0)) {
    headerDiscount = r2((itemsPart.taxable * pct) / 100);
  }

  const afterDiscount = Math.max(0, itemsPart.taxable - headerDiscount);
  // Re-attribute GST proportionally to remaining taxable (simplified: keep item gst ratio)
  const gstRatio = itemsPart.taxable > 0 ? itemsPart.gst / itemsPart.taxable : 0;
  const gst = r2(afterDiscount * gstRatio);
  const meter = r2(input.meterCharges ?? 0);
  const subsidy = r2(input.subsidy ?? 0);
  const taxable = r2(afterDiscount + meter);
  const grand = r2(taxable + gst - subsidy);

  return {
    subtotal: itemsPart.subtotal,
    lineDiscount: itemsPart.discount,
    discountTotal: r2(itemsPart.discount + headerDiscount),
    headerDiscount,
    taxableTotal: taxable,
    gstTotal: gst,
    meterCharges: meter,
    subsidy,
    grandTotal: Math.max(0, grand),
  };
}

export function discountPercentFromAmount(taxableBeforeHeader: number, amount: number) {
  if (taxableBeforeHeader <= 0) return 0;
  return r2((amount / taxableBeforeHeader) * 100);
}

export function discountAmountFromPercent(taxableBeforeHeader: number, percent: number) {
  return r2((taxableBeforeHeader * percent) / 100);
}
