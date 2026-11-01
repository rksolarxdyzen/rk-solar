"use client";

import Link from "next/link";
import { SoftLink } from "@/components/local-first/soft-link";
import type { QuotationRow } from "@/lib/quotations/types";
import { quoteTemplateDisplayLabel } from "@/lib/quotations/types";
import { formatCurrency, formatDate } from "@/lib/utils";

export function QuotationDetailActions({
  quote,
}: {
  quote: QuotationRow;
  onMutated?: () => void;
  disableMutations?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <SoftLink
        href="/quotations"
        className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text-body)] hover:bg-[var(--bg)]"
      >
        ← Quotations
      </SoftLink>
      <Link
        href={`/quotations/${quote.id}/edit`}
        className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text-body)] hover:bg-[var(--bg)]"
      >
        Edit
      </Link>
      <Link
        href={`/quotations/${quote.id}/print`}
        className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text-body)] hover:bg-[var(--bg)]"
      >
        Print / PDF
      </Link>
    </div>
  );
}

export function QuotationSummaryCard({ quote }: { quote: QuotationRow }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {quoteTemplateDisplayLabel(quote)}
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--text-dark)]">
            {quote.quotation_no}
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {quote.customer_name} · {quote.customer_phone} · {formatDate(quote.quote_date)}
          </p>
        </div>
        <p className="text-2xl font-semibold text-[var(--primary)]">
          {formatCurrency(Number(quote.grand_total))}
        </p>
      </div>
    </div>
  );
}
