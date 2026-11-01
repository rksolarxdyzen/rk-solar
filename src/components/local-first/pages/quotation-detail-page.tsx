"use client";

import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  QuotationDetailActions,
  QuotationSummaryCard,
} from "@/components/quotations/quotation-detail-actions";
import { DeleteQuotationButton } from "@/components/quotations/delete-quotation-button";
import { SoftLink } from "@/components/local-first/soft-link";
import { useLocalFirstSession } from "@/components/local-first/local-first-session";
import { useRkClientNav } from "@/components/local-first/rk-client-nav";
import { hasAuth, roleIn } from "@/lib/local-first/access";
import { matchQuotationDetailId } from "@/lib/local-first/quotation-detail-path";
import {
  invalidateQuotationDetail,
  quotationDetailOptions,
  quotationShellFromListCache,
} from "@/lib/local-first/queries/quotation-detail";
import {
  quoteShellToPlaceholder,
  type QuoteListShell,
} from "@/lib/quotations/quote-shell";
import { formatCurrency } from "@/lib/utils";

export default function QuotationDetailPage() {
  const nav = useRkClientNav();
  const path = nav?.path || "";
  const quoteId = matchQuotationDetailId(path) ?? "";
  const { profile, authorities, companyId } = useLocalFirstSession();
  const queryClient = useQueryClient();

  const can =
    roleIn(profile, ["admin", "sales_manager", "sales_executive"]) ||
    hasAuth(authorities, "view_quotations") ||
    hasAuth(authorities, "create_quotations");
  const canDeleteQuotations =
    roleIn(profile, ["admin"]) || hasAuth(authorities, "manage_quotations");

  const listShell = useMemo(() => {
    if (!quoteId) return null;
    const row = quotationShellFromListCache(queryClient, companyId, quoteId);
    if (!row?.id || !row.quotation_no) return null;
    return {
      id: String(row.id),
      quotation_no: String(row.quotation_no),
      template_kind: String(row.template_kind ?? "solar"),
      tier_type: (row.tier_type as string | null) ?? null,
      customer_name: String(row.customer_name ?? ""),
      customer_phone: (row.customer_phone as string | null) ?? null,
      status: String(row.status ?? "draft"),
      quote_date: String(row.quote_date ?? new Date().toISOString()),
      grand_total: row.grand_total != null ? Number(row.grand_total) : null,
      lead_id: (row.lead_id as string | null) ?? null,
      system_size_kw:
        row.system_size_kw != null ? Number(row.system_size_kw) : null,
    } satisfies QuoteListShell;
  }, [queryClient, companyId, quoteId]);

  const placeholder =
    listShell && listShell.id === quoteId
      ? quoteShellToPlaceholder(listShell, companyId)
      : undefined;

  const {
    data: quote,
    isPending,
    isFetching,
    isPlaceholderData,
    refetch,
    isError,
  } = useQuery({
    ...quotationDetailOptions(companyId, quoteId),
    enabled: Boolean(can && quoteId),
    placeholderData: placeholder,
  });

  const shellPaint = Boolean(
    isPlaceholderData || (quote && placeholder && isPending)
  );

  useEffect(() => {
    if (!can) nav?.navigate("/pipeline");
  }, [can, nav]);

  async function refresh() {
    if (!quoteId) return;
    invalidateQuotationDetail(queryClient, companyId, quoteId);
    await refetch();
    void queryClient.invalidateQueries({ queryKey: ["rk", "quotations", companyId] });
  }

  if (!can || !quoteId) return null;

  const showSpinner = isPending && !quote;

  return (
    <div className="space-y-6">
      {showSpinner && (
        <div className="flex items-center justify-center py-16 text-[var(--text-muted)]">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}

      {!showSpinner && !quote && (
        <div className="rounded-xl border border-[var(--border)] bg-white px-6 py-12 text-center">
          <p className="text-sm text-[var(--text-muted)]">
            {isError
              ? "Quotation not found or you do not have access."
              : "Quotation not found."}
          </p>
          <SoftLink
            href="/quotations"
            className="mt-3 inline-block text-sm font-semibold text-[var(--primary)]"
          >
            ← Back to quotations
          </SoftLink>
        </div>
      )}

      {quote && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <QuotationSummaryCard quote={quote} />
              {(isFetching || shellPaint) && (
                <p className="mt-2 text-[0.65rem] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                  Syncing
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <QuotationDetailActions
                quote={quote}
                onMutated={() => void refresh()}
                disableMutations={shellPaint}
              />
              {canDeleteQuotations && !shellPaint && (
                <DeleteQuotationButton
                  quoteId={quote.id}
                  quotationNo={quote.quotation_no}
                  customerName={quote.customer_name}
                  blockers={[]}
                  variant="button"
                  redirectTo="/quotations"
                />
              )}
            </div>
          </div>

          {quote.lead_id && (
            <p className="text-sm text-[var(--text-muted)]">
              Linked lead:{" "}
              <SoftLink
                href="/pipeline"
                className="font-semibold text-[var(--primary)]"
              >
                open in pipeline
              </SoftLink>
            </p>
          )}

          <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--bg)] text-xs uppercase tracking-wider text-[var(--text-muted)]">
                <tr>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2">Qty</th>
                  <th className="px-3 py-2">Rate</th>
                  <th className="px-3 py-2">GST%</th>
                  <th className="px-3 py-2">Disc</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {(quote.items ?? []).length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-3 py-8 text-center text-[var(--text-muted)]"
                    >
                      {shellPaint ? "Loading line items…" : "No line items."}
                    </td>
                  </tr>
                ) : (
                  (quote.items ?? []).map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-[var(--border-light)]"
                    >
                      <td className="px-3 py-2">
                        <p className="font-medium">{item.item_name_snapshot}</p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {[item.brand_snapshot, item.model_snapshot]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </td>
                      <td className="px-3 py-2">
                        {item.quantity} {item.unit}
                      </td>
                      <td className="px-3 py-2">
                        {formatCurrency(Number(item.rate))}
                      </td>
                      <td className="px-3 py-2">{item.gst_percent}%</td>
                      <td className="px-3 py-2">
                        {formatCurrency(Number(item.discount_value))}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">
                        {formatCurrency(Number(item.line_total))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Subtotal" value={formatCurrency(Number(quote.subtotal))} />
            <Stat
              label="Discount"
              value={formatCurrency(Number(quote.discount_total))}
            />
            <Stat label="GST" value={formatCurrency(Number(quote.gst_total))} />
            <Stat
              label="Grand total"
              value={formatCurrency(Number(quote.grand_total))}
            />
          </div>

          {(quote.notes || quote.terms) && (
            <div className="grid gap-4 sm:grid-cols-2">
              {quote.notes && (
                <div className="rounded-xl border border-[var(--border)] bg-white p-4">
                  <h3 className="text-sm font-semibold">Notes</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--text-body)]">
                    {quote.notes}
                  </p>
                </div>
              )}
              {quote.terms && (
                <div className="rounded-xl border border-[var(--border)] bg-white p-4">
                  <h3 className="text-sm font-semibold">Terms</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--text-body)]">
                    {quote.terms}
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-[var(--text-dark)]">{value}</p>
    </div>
  );
}
