import Link from "next/link";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { Card, StatCard } from "@/components/ui/card";
import { InventoryHeader } from "@/components/inventory/inventory-header";
import { getInventoryAccess } from "@/lib/inventory/queries";
import { CategoryStockReport } from "@/components/inventory/category-stock-report";
import { groupPanelInverterStock } from "@/lib/inventory/category-stock";
import { getStockReport, parseReportQuery, parseReportRange, stockRowMatchesQuery, type StockReportRow } from "@/lib/inventory/report";
import { formatDate, formatInr, formatQty } from "@/lib/inventory/format";

export const dynamic = "force-dynamic";

const COLUMNS: { key: keyof StockReportRow; label: string }[] = [
  { key: "on_hand", label: "On hand" },
  { key: "inward", label: "Inward" },
  { key: "dispatched", label: "Dispatched" },
  { key: "returned_good", label: "Returned" },
  { key: "returned_defective", label: "Defective" },
  { key: "service_issued", label: "Service" },
  { key: "adjusted", label: "Adjusted" },
];

function qty(row: StockReportRow, key: keyof StockReportRow) {
  const n = Number(row[key] ?? 0);
  return n === 0 && key !== "on_hand" ? "—" : formatQty(n, row.unit_type);
}

export default async function StockReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; q?: string }>;
}) {
  const ctx = await getInventoryAccess();
  if (!ctx) redirect("/login");
  if (!ctx.access.canView) redirect("/");

  const sp = await searchParams;
  const range = parseReportRange(sp.from, sp.to);
  const query = parseReportQuery(sp.q);
  const report = await getStockReport(range, ctx.access.canViewCost);
  const rows = report.rows.filter((row) => stockRowMatchesQuery(row, query));
  const { withValue } = report;
  const moved = rows.filter((r) => r.inward || r.dispatched || r.returned_good || r.returned_defective || r.service_issued || r.adjusted).length;
  const totalValue = rows.reduce((sum, r) => sum + (r.stock_value ?? 0), 0);
  const qs = new URLSearchParams();
  if (range.from) qs.set("from", range.from);
  if (range.to) qs.set("to", range.to);
  if (query) qs.set("q", query);
  const csvHref = `/api/inventory/report${qs.size ? `?${qs}` : ""}`;
  const categoryCsv = new URLSearchParams(qs);
  categoryCsv.set("view", "category");
  const categoryCsvHref = `/api/inventory/report?${categoryCsv}`;
  const categoryGroups = groupPanelInverterStock(rows);
  const rangeLabel =
    range.from || range.to ? `${range.from ? formatDate(range.from) : "Start"} – ${range.to ? formatDate(range.to) : "today"}` : "All time";

  return (
    <div>
      <InventoryHeader title="Stock report" subtitle={`Movement totals: ${rangeLabel}. On hand is as of now.`} backHref="/inventory" actions={false} />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <label className="flex min-w-[16rem] flex-1 flex-col text-xs font-semibold text-[var(--text-muted)]">
          Search
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Hierarchy, item, SKU, or group"
            aria-label="Search stock report by hierarchy, item name, SKU, or group"
            className="mt-1 min-h-[44px] rounded-lg border border-[var(--border)] bg-white px-3 text-sm text-[var(--text-body)]"
          />
        </label>
        <label className="flex flex-col text-xs font-semibold text-[var(--text-muted)]">
          From
          <input type="date" name="from" defaultValue={range.from ?? ""} className="mt-1 min-h-[44px] rounded-lg border border-[var(--border)] bg-white px-3 text-sm text-[var(--text-body)]" />
        </label>
        <label className="flex flex-col text-xs font-semibold text-[var(--text-muted)]">
          To
          <input type="date" name="to" defaultValue={range.to ?? ""} className="mt-1 min-h-[44px] rounded-lg border border-[var(--border)] bg-white px-3 text-sm text-[var(--text-body)]" />
        </label>
        <button type="submit" className="min-h-[44px] rounded-lg bg-[var(--primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--primary-hover)]">
          Apply
        </button>
        {(range.from || range.to || query) && (
          <Link href="/inventory/report" className="inline-flex min-h-[44px] items-center px-2 text-sm font-medium text-[var(--primary)] hover:underline">
            Clear
          </Link>
        )}
        <a
          href={csvHref}
          download
          className="ml-auto inline-flex min-h-[44px] items-center gap-2 rounded-lg border-[1.5px] border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--text-body)] hover:border-[var(--text-muted)]"
        >
          <Download className="h-4 w-4" /> Download CSV
        </a>
        <a
          href={categoryCsvHref}
          download
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border-[1.5px] border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--text-body)] hover:border-[var(--text-muted)]"
        >
          <Download className="h-4 w-4" /> Category CSV
        </a>
      </form>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Items" value={rows.length} />
        <StatCard label="Moved in period" value={moved} />
        {withValue && <StatCard label="Stock value" value={formatInr(totalValue)} sub="At purchase cost" color="primary" />}
        {categoryGroups.map((g) => (
          <StatCard key={g.kind} label={g.label} value={formatQty(g.on_hand, "nos")} sub={`${g.item_count} SKUs`} />
        ))}
      </div>

      <CategoryStockReport groups={categoryGroups} />

      {rows.length === 0 ? (
        <Card className="py-8 text-center text-sm text-[var(--text-muted)]">
          {query ? `No items match “${query}”.` : "No items yet."}
        </Card>
      ) : (
        <>
          <Card className="hidden overflow-x-auto p-0 md:block">
            <table className="w-full text-sm" data-testid="stock-report-table">
              <thead className="bg-[var(--bg)] text-left text-xs uppercase text-[var(--text-muted)]">
                <tr>
                  <th className="px-3 py-2">Item</th>
                  {COLUMNS.map((c) => (
                    <th key={c.key} className="px-3 py-2 text-right">
                      {c.label}
                    </th>
                  ))}
                  {withValue && <th className="px-3 py-2 text-right">Value</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-light)]">
                {rows.map((r) => (
                  <tr key={r.item_id} className={r.is_active ? undefined : "opacity-60"}>
                    <td className="px-3 py-2">
                      <Link href={`/inventory/items/${r.item_id}`} className="font-medium text-[var(--text-dark)] hover:underline">
                        {r.name}
                      </Link>
                      <p className="text-xs text-[var(--text-muted)]">{[r.sku, r.category_name].filter(Boolean).join(" · ") || "—"}</p>
                    </td>
                    {COLUMNS.map((c) => (
                      <td key={c.key} className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                        {qty(r, c.key)}
                      </td>
                    ))}
                    {withValue && <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatInr(r.stock_value)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <div className="space-y-2 md:hidden">
            {rows.map((r) => (
              <Card key={r.item_id} className={r.is_active ? "space-y-2" : "space-y-2 opacity-60"}>
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/inventory/items/${r.item_id}`} className="min-w-0 font-semibold text-[var(--text-dark)] hover:underline">
                    {r.name}
                  </Link>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{formatQty(r.on_hand, r.unit_type)}</span>
                </div>
                <dl className="grid grid-cols-3 gap-x-3 gap-y-1 text-xs">
                  {COLUMNS.slice(1).map((c) => (
                    <div key={c.key} className="min-w-0">
                      <dt className="text-[var(--text-muted)]">{c.label}</dt>
                      <dd className="truncate tabular-nums">{qty(r, c.key)}</dd>
                    </div>
                  ))}
                </dl>
                {withValue && <p className="text-xs text-[var(--text-muted)]">Value {formatInr(r.stock_value)}</p>}
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
