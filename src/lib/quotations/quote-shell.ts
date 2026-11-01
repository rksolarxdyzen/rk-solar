import type { QuotationRow, QuoteStatus, QuoteTemplateKind } from "@/lib/quotations/types";

/** Fields available on the quotations list for instant detail paint. */
export type QuoteListShell = {
  id: string;
  quotation_no: string;
  template_kind: string;
  tier_type?: string | null;
  customer_name: string;
  customer_phone: string | null;
  status: string;
  quote_date: string;
  grand_total: number | null;
  lead_id?: string | null;
  system_size_kw?: number | null;
};

export function quoteShellToPlaceholder(
  shell: QuoteListShell,
  companyId: string
): QuotationRow {
  const now = new Date().toISOString();
  return {
    id: shell.id,
    company_id: companyId,
    quotation_no: shell.quotation_no,
    lead_id: shell.lead_id ?? null,
    template_kind: (shell.template_kind as QuoteTemplateKind) || "solar",
    tier_type: shell.tier_type ?? null,
    customer_name: shell.customer_name,
    customer_phone: shell.customer_phone,
    customer_address: null,
    customer_city: null,
    status: (shell.status as QuoteStatus) || "draft",
    quote_date: shell.quote_date,
    valid_till: null,
    system_size_kw: shell.system_size_kw ?? null,
    meter_charges: 0,
    subsidy: 0,
    subtotal: 0,
    discount_total: 0,
    discount_percent: 0,
    taxable_total: 0,
    gst_total: 0,
    grand_total: Number(shell.grand_total ?? 0),
    notes: null,
    terms: null,
    created_at: now,
    updated_at: now,
    items: [],
  };
}
