"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTransition } from "react";
import { formatCurrency } from "@/lib/utils";
import { Label } from "@/components/ui/input";
import {
  type DealerMonthlyReport,
  type DealerReportOption,
} from "@/lib/reports/dealer-monthly-types";

function monthInputValue(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function DealerMonthlyBoard({
  report,
  options,
  selectedDealerId,
}: {
  report: DealerMonthlyReport;
  options: DealerReportOption[];
  selectedDealerId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function updateParams(next: { month?: string; dealer?: string }) {
    const params = new URLSearchParams();
    const monthVal = next.month ?? monthInputValue(report.year, report.month);
    const dealerVal = next.dealer ?? selectedDealerId;
    params.set("month", monthVal);
    if (dealerVal && dealerVal !== "all") params.set("dealer", dealerVal);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <div className={`space-y-4 ${pending ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[10rem]">
          <Label htmlFor="dealer-report-month">Month</Label>
          <input
            id="dealer-report-month"
            type="month"
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-dark)]"
            value={monthInputValue(report.year, report.month)}
            onChange={(e) => updateParams({ month: e.target.value })}
          />
        </div>
        <div className="min-w-[12rem] flex-1 sm:max-w-xs">
          <Label htmlFor="dealer-report-filter">Dealer</Label>
          <select
            id="dealer-report-filter"
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-dark)]"
            value={selectedDealerId}
            onChange={(e) => updateParams({ dealer: e.target.value })}
          >
            <option value="all">All dealers</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Leads submitted" value={String(report.totals.leadsSubmitted)} />
        <Stat label="Files won" value={String(report.totals.filesWon)} />
        <Stat
          label="Quotations submitted"
          value={String(report.totals.quotationsSubmitted)}
        />
        <Stat
          label="Booked value"
          value={formatCurrency(report.totals.bookedValue)}
        />
      </div>

      <p className="text-sm text-[var(--text-muted)]">{report.rangeLabel}</p>

      <div className="hidden overflow-x-auto rounded-xl border border-[var(--border)] bg-white md:block">
        <table className="min-w-full text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--bg)] text-left text-[0.7rem] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            <tr>
              <th className="px-4 py-3">Dealer</th>
              <th className="px-4 py-3 text-right">Leads</th>
              <th className="px-4 py-3 text-right">Files won</th>
              <th className="px-4 py-3 text-right">Quotations</th>
              <th className="px-4 py-3 text-right">Booked value</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-[var(--text-muted)]"
                >
                  No dealer leads or files for this month.
                </td>
              </tr>
            ) : (
              report.rows.map((row) => (
                <tr
                  key={row.dealerId}
                  className="border-b border-[var(--border)] last:border-0"
                >
                  <td className="px-4 py-3 font-medium text-[var(--text-dark)]">
                    {row.dealerName}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {row.leadsSubmitted}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.filesWon}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {row.quotationsSubmitted}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCurrency(row.bookedValue)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {report.rows.length > 0 ? (
            <tfoot className="border-t border-[var(--border)] bg-[var(--bg)] font-semibold">
              <tr>
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {report.totals.leadsSubmitted}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {report.totals.filesWon}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {report.totals.quotationsSubmitted}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatCurrency(report.totals.bookedValue)}
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      <ul className="space-y-3 md:hidden">
        {report.rows.length === 0 ? (
          <li className="rounded-xl border border-[var(--border)] bg-white px-4 py-8 text-center text-sm text-[var(--text-muted)]">
            No dealer leads or files for this month.
          </li>
        ) : (
          report.rows.map((row) => (
            <li
              key={row.dealerId}
              className="rounded-xl border border-[var(--border)] bg-white px-4 py-3"
            >
              <p className="font-semibold text-[var(--text-dark)]">{row.dealerName}</p>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-[var(--text-muted)]">Leads</dt>
                  <dd className="font-medium tabular-nums">{row.leadsSubmitted}</dd>
                </div>
                <div>
                  <dt className="text-[var(--text-muted)]">Files won</dt>
                  <dd className="font-medium tabular-nums">{row.filesWon}</dd>
                </div>
                <div>
                  <dt className="text-[var(--text-muted)]">Quotations</dt>
                  <dd className="font-medium tabular-nums">
                    {row.quotationsSubmitted}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--text-muted)]">Booked</dt>
                  <dd className="font-medium tabular-nums">
                    {formatCurrency(row.bookedValue)}
                  </dd>
                </div>
              </dl>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white px-4 py-3">
      <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold text-[var(--text-dark)]">{value}</p>
    </div>
  );
}
