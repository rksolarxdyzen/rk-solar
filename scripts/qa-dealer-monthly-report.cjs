/**
 * Static QA for dealer monthly report.
 * Auth: no service_role. Session SKIP without QA login.
 */
const fs = require("fs");
const path = require("path");
const appRoot = path.join(__dirname, "..");
const rows = [];
function pass(n, d) {
  rows.push({ status: "PASS", name: n, detail: d });
}
function fail(n, d) {
  rows.push({ status: "FAIL", name: n, detail: d });
}
function skip(n, d) {
  rows.push({ status: "SKIP", name: n, detail: d });
}
function read(rel) {
  return fs.readFileSync(path.join(appRoot, rel), "utf8");
}

const types = read("src/lib/reports/dealer-monthly-types.ts");
const lib = read("src/lib/reports/dealer-monthly.ts");
const action = read("src/actions/dealer-report.ts");
const page = read("src/app/(dashboard)/reports/dealers/page.tsx");
const board = read("src/components/reports/dealer-monthly-board.tsx");
const auth = read("src/lib/domain/authorities.ts");
const nav = read("src/lib/nav-config.ts");
const access = read("src/lib/nav-access.ts");
const mig = read("supabase/migrations/069_view_dealer_monthly_report.sql");
const dealersUi = read("src/components/dealers/dealers-workspace.tsx");

if (types.includes("leadsSubmitted") && types.includes("filesWon") && types.includes("canViewDealerMonthlyReport")) {
  pass("types", "dealer monthly metrics + canView");
} else fail("types", "incomplete");

if (lib.includes("collectDealerMonthlyReport") && lib.includes("dealerOwnerId") && lib.includes("dealer_id")) {
  pass("collector", "month buckets by dealer_id / created_by");
} else fail("collector", "incomplete");

if (action.includes("listDealerMonthlyReport") && action.includes("listDealerReportOptions")) {
  pass("actions", "list report + dealer options");
} else fail("actions", "incomplete");

if (page.includes("DealerMonthlyBoard") && page.includes("Dealer report")) {
  pass("page", "/reports/dealers");
} else fail("page", "missing");

if (board.includes("All dealers") && board.includes("Leads submitted") && board.includes("Files won")) {
  pass("board", "month + dealer filter UI");
} else fail("board", "incomplete");

if (auth.includes("view_dealer_monthly_report") && mig.includes("view_dealer_monthly_report")) {
  pass("authority", "catalog + migration 069");
} else fail("authority", "missing key or migration");

if (nav.includes('/reports/dealers') && access.includes('/reports/dealers')) {
  pass("nav", "Dealer report link + access gate");
} else fail("nav", "incomplete");

if (dealersUi.includes('/reports/dealers') && dealersUi.includes("Monthly report")) {
  pass("dealers link", "Dealers → Monthly report");
} else fail("dealers link", "missing");

skip("session matrix", "Set QA_OWNER_* to exercise live report against Supabase");

console.log("\n## QA report — KT — dealer monthly report");
for (const r of rows) console.log(`- ${r.status}: ${r.name} — ${r.detail}`);
process.exit(rows.some((r) => r.status === "FAIL") ? 1 : 0);
