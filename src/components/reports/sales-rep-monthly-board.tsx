"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTransition } from "react";
import { formatCurrency } from "@/lib/utils";
import { Label } from "@/components/ui/input";
import {
  UNASSIGNED_REP_ID,
  type SalesRepMonthlyReport,
  type SalesRepOption,
} from "@/lib/reports/sales-rep-monthly-types";

function monthInputValue(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function SalesRepMonthlyBoard({
  report,
  options,
  selectedRepId,
}: {
  report: SalesRepMonthlyReport;
  options: SalesRepOption[];
  selectedRepId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function updateParams(next: { month?: string; rep?: string }) {
    const params = new URLSearchParams();
    const monthVal =
      next.month ?? monthInputValue(report.year, report.month);
    const repVal = next.rep ?? selectedRepId;
    params.set("month", monthVal);
    if (repVal && repVal !== "all") params.set("rep", repVal);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <div className={`space-y-4 ${pending ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[10rem]">
          <Label htmlFor="sales-rep-month">Month</Label>
          <input
            id="sales-rep-month"
            type="month"
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-dark)]"
            value={monthInputValue(report.year, report.month)}
            onChange={(e) => updateParams({ month: e.target.value })}
          />
        </div>
        <div className="min-w-[12rem] flex-1 sm:max-w-xs">
          <Label htmlFor="sales-rep-filter">Sales rep</Label>
          <select
            id="sales-rep-filter"
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-dark)]"
            value={selectedRepId}
            onChange={(e) => updateParams({ rep: e.target.value })}
          >
            <option value="all">All sales reps</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
            <option value={UNASSIGNED_REP_ID}>Unassigned</option>
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Closed deals" value={String(report.totals.closedDeals)} />
        <Stat
          label="Booked value"
          value={formatCurrency(report.totals.bookedValue)}
        />
        <Stat
          label="Payments recorded"
          value={formatCurrency(report.totals.paymentsRecorded)}
        />
        <Stat
          label="Verified"
          value={formatCurrency(report.totals.paymentsVerified)}
        />
      </div>

      <p className="text-sm text-[var(--text-muted)]">{report.rangeLabel}</p>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-xl border border-[var(--border)] bg-white md:block">
        <table className="min-w-full text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--bg)] text-left text-[0.7rem] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            <tr>
              <th className="px-4 py-3">Sales rep</th>
              <th className="px-4 py-3 text-right">Closed deals</th>
              <th className="px-4 py-3 text-right">Booked value</th>
              <th className="px-4 py-3 text-right">Payments recorded</th>
              <th className="px-4 py-3 text-right">Verified</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-[var(--text-muted)]"
                >
                  No closed deals or payments for this month.
                </td>
              </tr>
            ) : (
              report.rows.map((row) => (
                <tr
                  key={row.salesRepId}
                  className="border-b border-[var(--border)] last:border-0"
                >
                  <td className="px-4 py-3 font-medium text-[var(--text-dark)]">
                    {row.salesRepName}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {row.closedDeals}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCurrency(row.bookedValue)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCurrency(row.paymentsRecorded)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCurrency(row.paymentsVerified)}
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
                  {report.totals.closedDeals}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatCurrency(report.totals.bookedValue)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatCurrency(report.totals.paymentsRecorded)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatCurrency(report.totals.paymentsVerified)}
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="space-y-3 md:hidden">
        {report.rows.length === 0 ? (
          <li className="rounded-xl border border-[var(--border)] bg-white px-4 py-8 text-center text-sm text-[var(--text-muted)]">
            No closed deals or payments for this month.
          </li>
        ) : (
          report.rows.map((row) => (
            <li
              key={row.salesRepId}
              className="rounded-xl border border-[var(--border)] bg-white px-4 py-3"
            >
              <p className="font-semibold text-[var(--text-dark)]">
                {row.salesRepName}
              </p>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-[var(--text-muted)]">Closed</dt>
                  <dd className="font-medium tabular-nums">{row.closedDeals}</dd>
                </div>
                <div>
                  <dt className="text-[var(--text-muted)]">Booked</dt>
                  <dd className="font-medium tabular-nums">
                    {formatCurrency(row.bookedValue)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--text-muted)]">Recorded</dt>
                  <dd className="font-medium tabular-nums">
                    {formatCurrency(row.paymentsRecorded)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--text-muted)]">Verified</dt>
                  <dd className="font-medium tabular-nums">
                    {formatCurrency(row.paymentsVerified)}
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
