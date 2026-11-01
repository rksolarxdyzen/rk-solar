import { NextResponse, type NextRequest } from "next/server";
import { getInventoryAccess } from "@/lib/inventory/queries";
import { categoryStockCsv, groupPanelInverterStock } from "@/lib/inventory/category-stock";
import { getStockReport, parseReportQuery, parseReportRange, stockReportCsv, stockRowMatchesQuery } from "@/lib/inventory/report";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const ctx = await getInventoryAccess();
  if (!ctx) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!ctx.access.canView) return NextResponse.json({ error: "No access to inventory." }, { status: 403 });

  const sp = request.nextUrl.searchParams;
  const range = parseReportRange(sp.get("from"), sp.get("to"));
  const query = parseReportQuery(sp.get("q"));
  const report = await getStockReport(range, ctx.access.canViewCost);
  report.rows = report.rows.filter((row) => stockRowMatchesQuery(row, query));
  const stamp = new Date().toISOString().slice(0, 10);
  const suffix = range.from || range.to ? `-${range.from ?? "start"}-to-${range.to ?? stamp}` : `-${stamp}`;
  const categoryView = sp.get("view") === "category";
  const body = categoryView ? categoryStockCsv(groupPanelInverterStock(report.rows)) : stockReportCsv(report);
  const filename = categoryView ? `stock-report-category${suffix}.csv` : `stock-report${suffix}.csv`;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
