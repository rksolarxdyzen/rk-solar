import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getQuotation } from "@/actions/quotations";
import {
  QuotationDetailActions,
  QuotationSummaryCard,
} from "@/components/quotations/quotation-detail-actions";
import { DeleteQuotationButton } from "@/components/quotations/delete-quotation-button";
import { requireAuth, hasAuthority } from "@/lib/auth";
import { getQuotationContext } from "@/lib/quotations/context";
import { getQuotationDeleteBlockers } from "@/lib/quotations/actions/quotation";
import { formatCurrency } from "@/lib/utils";

export default async function QuotationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireAuth();
  const can =
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    profile.role === "sales_executive" ||
    (await hasAuthority(profile.id, "view_quotations")) ||
    (await hasAuthority(profile.id, "create_quotations"));
  if (!can) redirect("/pipeline");

  const { id } = await params;
  const quote = await getQuotation(id).catch(() => null);
  if (!quote) notFound();

  const { canDeleteQuotations } = await getQuotationContext().catch(() => ({
    canDeleteQuotations: false,
  }));
  const blockers = canDeleteQuotations
    ? ((
        await getQuotationDeleteBlockers([quote.id]).catch(
          (): Record<string, string[]> => ({})
        )
      )[quote.id] ?? [])
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <QuotationSummaryCard quote={quote} />
        <div className="flex flex-wrap items-center gap-2">
          <QuotationDetailActions quote={quote} />
          {canDeleteQuotations && (
            <DeleteQuotationButton
              quoteId={quote.id}
              quotationNo={quote.quotation_no}
              customerName={quote.customer_name}
              blockers={blockers}
              variant="button"
              redirectTo="/quotations"
            />
          )}
        </div>
      </div>

      {quote.lead_id && (
        <p className="text-sm text-[var(--text-muted)]">
          Linked lead:{" "}
          <Link href="/pipeline" className="font-semibold text-[var(--primary)]">
            open in pipeline
          </Link>
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
            {(quote.items ?? []).map((item) => (
              <tr key={item.id} className="border-b border-[var(--border-light)]">
                <td className="px-3 py-2">
                  <p className="font-medium">{item.item_name_snapshot}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {[item.brand_snapshot, item.model_snapshot].filter(Boolean).join(" · ")}
                  </p>
                </td>
                <td className="px-3 py-2">
                  {item.quantity} {item.unit}
                </td>
                <td className="px-3 py-2">{formatCurrency(Number(item.rate))}</td>
                <td className="px-3 py-2">{item.gst_percent}%</td>
                <td className="px-3 py-2">{formatCurrency(Number(item.discount_value))}</td>
                <td className="px-3 py-2 text-right font-semibold">
                  {formatCurrency(Number(item.line_total))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Subtotal" value={formatCurrency(Number(quote.subtotal))} />
        <Stat label="Discount" value={formatCurrency(Number(quote.discount_total))} />
        <Stat label="GST" value={formatCurrency(Number(quote.gst_total))} />
        <Stat label="Grand total" value={formatCurrency(Number(quote.grand_total))} />
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
