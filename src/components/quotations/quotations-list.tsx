"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SoftLink } from "@/components/local-first/soft-link";
import { DeleteQuotationButton } from "@/components/quotations/delete-quotation-button";
import { usePrefetchQuotationDetail } from "@/lib/leads/use-prefetch-quotation-detail";
import {
  isPremiumSolarQuote,
  quoteTemplateDisplayLabel,
} from "@/lib/quotations/types";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

type QuoteRow = {
  id: string;
  quotation_no: string;
  template_kind: string;
  tier_type?: string | null;
  customer_name: string;
  customer_phone: string | null;
  status: string;
  quote_date: string;
  grand_total: number | null;
};

const TABS = [
  { id: "solar", label: "Solar" },
  { id: "premium", label: "Premium" },
  { id: "non_solar", label: "Non-solar" },
  { id: "all", label: "All" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function matchesTab(quote: QuoteRow, tab: TabId): boolean {
  if (tab === "all") return true;
  if (tab === "non_solar") return quote.template_kind === "non_solar";
  if (tab === "premium") return isPremiumSolarQuote(quote);
  return quote.template_kind === "solar" && quote.tier_type === "regular";
}

function newQuoteHref(tab: TabId): string {
  if (tab === "non_solar") return "/quotations/new?kind=non_solar";
  if (tab === "premium") return "/quotations/new?kind=premium";
  return "/quotations/new?kind=solar";
}

export function QuotationsList({
  quotes,
  canCreate,
  canDelete = false,
  deleteBlockers = {},
}: {
  quotes: QuoteRow[];
  canCreate: boolean;
  canDelete?: boolean;
  deleteBlockers?: Record<string, string[]>;
}) {
  const [tab, setTab] = useState<TabId>("solar");
  const prefetchQuote = usePrefetchQuotationDetail();

  const counts = useMemo(() => {
    const solar = quotes.filter((q) => matchesTab(q, "solar")).length;
    const premium = quotes.filter((q) => matchesTab(q, "premium")).length;
    const non_solar = quotes.filter((q) => matchesTab(q, "non_solar")).length;
    return { solar, premium, non_solar, all: quotes.length };
  }, [quotes]);

  const filtered = useMemo(() => quotes.filter((q) => matchesTab(q, tab)), [quotes, tab]);

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-[var(--border)]">
        {TABS.map((t) => {
          const count = counts[t.id];
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "border-b-2 px-3 py-2.5 text-sm font-medium transition",
                tab === t.id
                  ? "border-[var(--primary)] text-[var(--primary)]"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-dark)]"
              )}
            >
              {t.label}
              <span
                className={cn(
                  "ml-1.5 rounded-full px-1.5 py-0.5 text-[0.65rem] font-bold",
                  tab === t.id
                    ? "bg-[var(--primary-light)] text-[var(--primary)]"
                    : "bg-[var(--bg)] text-[var(--text-muted)]"
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--bg)] text-xs uppercase tracking-wider text-[var(--text-muted)]">
            <tr>
              <th className="px-3 py-2">Quote #</th>
              <th className="px-3 py-2">Customer</th>
              {tab === "all" && <th className="px-3 py-2">Template</th>}
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2 text-right">Total</th>
              {canDelete && <th className="w-12 px-3 py-2" aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {filtered.map((q) => (
              <tr key={q.id} className="border-b border-[var(--border-light)]">
                <td className="px-3 py-2">
                  <SoftLink
                    href={`/quotations/${q.id}`}
                    className="font-semibold text-[var(--primary)]"
                    onMouseEnter={() => prefetchQuote(q.id)}
                    onFocus={() => prefetchQuote(q.id)}
                    onPointerDown={() => prefetchQuote(q.id)}
                  >
                    {q.quotation_no}
                  </SoftLink>
                </td>
                <td className="px-3 py-2">
                  <p className="font-medium text-[var(--text-dark)]">{q.customer_name}</p>
                  <p className="text-xs text-[var(--text-muted)]">{q.customer_phone}</p>
                </td>
                {tab === "all" && (
                  <td className="px-3 py-2">{quoteTemplateDisplayLabel(q)}</td>
                )}
                <td className="px-3 py-2">{formatDate(q.quote_date)}</td>
                <td className="px-3 py-2 text-right font-semibold">
                  {formatCurrency(Number(q.grand_total))}
                </td>
                {canDelete && (
                  <td className="px-2 py-1 text-right">
                    <DeleteQuotationButton
                      quoteId={q.id}
                      quotationNo={q.quotation_no}
                      customerName={q.customer_name}
                      blockers={deleteBlockers[q.id] ?? []}
                    />
                  </td>
                )}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={(tab === "all" ? 5 : 4) + (canDelete ? 1 : 0)}
                  className="px-3 py-10 text-center text-[var(--text-muted)]"
                >
                  {tab === "solar"
                    ? "No regular solar quotations yet."
                    : tab === "premium"
                      ? "No premium solar quotations yet."
                      : tab === "non_solar"
                        ? "No non-solar quotations yet."
                        : "No quotations yet."}
                  {canCreate && (
                    <>
                      {" "}
                      <Link href={newQuoteHref(tab)} className="font-semibold text-[var(--primary)]">
                        Create one
                      </Link>
                    </>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
