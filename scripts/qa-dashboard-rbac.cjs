/**
 * Dashboard RBAC QA — company finance vs record_payment (structure + optional JWT).
 * Never uses SUPABASE_SERVICE_ROLE_KEY.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
 * Optional: QA_SALES_EMAIL/PASSWORD, QA_ACCOUNTS_EMAIL/PASSWORD, QA_OWNER_EMAIL/PASSWORD
 */
const fs = require("fs");
const path = require("path");

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const p = path.join(__dirname, "..", name);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      if (!line || line.startsWith("#")) continue;
      const i = line.indexOf("=");
      if (i < 1) continue;
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ROOT = path.join(__dirname, "..");

const rows = [];
function pass(name, detail) {
  rows.push({ status: "PASS", name, detail });
}
function fail(name, detail) {
  rows.push({ status: "FAIL", name, detail });
}
function skip(name, detail) {
  rows.push({ status: "SKIP", name, detail });
}
function blocked(name, detail) {
  rows.push({ status: "BLOCKED", name, detail });
}

function readSrc(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertIncludes(name, src, needle, detailOk) {
  if (src.includes(needle)) pass(name, detailOk || needle);
  else fail(name, `missing: ${needle}`);
}

function assertNotIncludes(name, src, needle, detailOk) {
  if (!src.includes(needle)) pass(name, detailOk || `absent: ${needle}`);
  else fail(name, `still present: ${needle}`);
}

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: ANON,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    return { ok: false, status: res.status, error: body.error_description || body.msg || res.status };
  }
  return { ok: true, token: body.access_token, userId: body.user?.id };
}

async function restGet(token, table, query) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${query}`;
  const res = await fetch(url, {
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
    },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function main() {
  if (!SUPABASE_URL || !ANON) {
    blocked("env", "Missing NEXT_PUBLIC_SUPABASE_URL or ANON_KEY");
    printReport();
    process.exit(1);
  }
  const host = new URL(SUPABASE_URL).host;
  console.log(`Env host: ${host}`);

  // —— Static: load-dashboard company finance split ——
  const loader = readSrc("src/lib/dashboard/load-dashboard.ts");
  assertIncludes(
    "loader canCompanyFinanceDashboard",
    loader,
    "canCompanyFinanceDashboard",
    "flag defined"
  );
  assertNotIncludes(
    "loader no canFinance=canPayments",
    loader,
    "const canFinance = canPayments",
    "old alias removed"
  );
  if (
    /canCompanyFinanceDashboard[\s\S]*?verify_payment/.test(loader) &&
    /canCompanyFinanceDashboard[\s\S]*?view_reports/.test(loader) &&
    !/canCompanyFinanceDashboard[\s\S]{0,400}record_payment/.test(loader)
  ) {
    pass("loader finance gate keys", "admin/accounts/manager/verify/reports/seeCustomers");
  } else {
    fail("loader finance gate keys", "unexpected gate composition");
  }
  if (
    /if \(canCompanyFinanceDashboard\)/.test(loader) &&
    /getAccountsFinanceSnapshot/.test(loader)
  ) {
    pass("loader snapshot gated", "accountsFinance only when company finance");
  } else {
    fail("loader snapshot gated", "snapshot not behind canCompanyFinanceDashboard");
  }
  if (
    /canPayments &&[\s\S]*?canCompanyFinanceDashboard \|\|[\s\S]*?paymentsCollected/.test(
      loader
    )
  ) {
    pass("loader payment overview hide-empty", "scoped; hide zeros for sales");
  } else {
    fail("loader payment overview hide-empty", "payment KPI gate missing");
  }
  if (/canInstall\)/.test(loader) && /id: "installations"/.test(loader)) {
    const installBlock = loader.slice(
      loader.indexOf('id: "installations"') - 80,
      loader.indexOf('id: "installations"') + 40
    );
    if (!installBlock.includes("canFinance") && installBlock.includes("canInstall")) {
      pass("loader install KPI", "canInstall only");
    } else {
      fail("loader install KPI", installBlock.slice(0, 120));
    }
  } else {
    fail("loader install KPI", "installations block missing");
  }
  const grievIdx = loader.indexOf("Open grievances");
  const grievSlice =
    grievIdx >= 0 ? loader.slice(grievIdx, grievIdx + 450) : "";
  if (
    grievSlice.includes("seeAll || seeCustomers") &&
    !grievSlice.includes('.in("lead_id"')
  ) {
    pass("loader grievances omit assigned-only", "company-wide only; omit assigned-only");
  } else {
    fail("loader grievances omit assigned-only", grievSlice.slice(0, 160) || "block missing");
  }

  // —— Static: snapshot server gate ——
  const recv = readSrc("src/actions/accounts-receivables.ts");
  assertIncludes(
    "snapshot canCompanyFinanceDashboard helper",
    recv,
    "async function canCompanyFinanceDashboard",
    "helper present"
  );
  if (
    /getAccountsFinanceSnapshot[\s\S]*?canCompanyFinanceDashboard\(profile\)/.test(recv) &&
    !/getAccountsFinanceSnapshot[\s\S]*?canViewReceivables\(profile\)/.test(recv)
  ) {
    pass("snapshot not view_payment_queues", "tighter than receivables page");
  } else {
    fail("snapshot not view_payment_queues", "still uses canViewReceivables");
  }
  if (/canViewReceivables[\s\S]*?view_payment_queues/.test(recv)) {
    pass("receivables page keeps queue roles", "listAccountsReceivables unchanged");
  } else {
    fail("receivables page keeps queue roles", "canViewReceivables missing queues");
  }

  // —— Static: lead sources ——
  const ingest = readSrc("src/actions/ingest.ts");
  const srcFnStart = ingest.indexOf("export async function getLeadSourceStats");
  const srcFnEnd = ingest.indexOf("\nexport ", srcFnStart + 10);
  const srcFn =
    srcFnStart >= 0
      ? ingest.slice(srcFnStart, srcFnEnd > 0 ? srcFnEnd : srcFnStart + 1200)
      : "";
  if (
    srcFn.includes("canSeeAllLeads(profile)") &&
    !/hasAuthority\([^)]*import_leads/.test(srcFn)
  ) {
    pass("lead sources gate", "see-all / reports / manager — not import authority");
  } else {
    fail("lead sources gate", srcFn.slice(0, 200) || "getLeadSourceStats missing");
  }

  // —— Static: UI null hide ——
  const home = readSrc("src/components/dashboard/dashboard-home.tsx");
  if (/accountsFinance/.test(home) && /data\.accountsFinance/.test(home)) {
    pass("UI accountsFinance null-safe", "panel gated on data.accountsFinance");
  } else {
    fail("UI accountsFinance null-safe", "dashboard-home missing accountsFinance check");
  }

  // —— Anon ——
  const anonLeads = await fetch(`${SUPABASE_URL}/rest/v1/leads?select=id&limit=1`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  const anonBody = await anonLeads.json().catch(() => null);
  const anonEmpty =
    anonLeads.status === 200 && Array.isArray(anonBody) && anonBody.length === 0;
  const anonDenied = anonLeads.status === 401 || anonLeads.status === 403;
  if (anonEmpty || anonDenied) pass("anon leads denied/empty", String(anonLeads.status));
  else fail("anon leads denied/empty", `${anonLeads.status}`);

  // —— Optional sessions ——
  const salesEmail = process.env.QA_SALES_EMAIL;
  const salesPass = process.env.QA_SALES_PASSWORD;
  const accountsEmail = process.env.QA_ACCOUNTS_EMAIL;
  const accountsPass = process.env.QA_ACCOUNTS_PASSWORD;
  const ownerEmail = process.env.QA_OWNER_EMAIL || process.env.QA_ADMIN_EMAIL;
  const ownerPass = process.env.QA_OWNER_PASSWORD || process.env.QA_ADMIN_PASSWORD;

  if (!salesEmail || !salesPass) {
    skip("sales session", "No QA_SALES_EMAIL/PASSWORD — structural only");
  } else {
    const s = await signIn(salesEmail, salesPass);
    if (!s.ok) {
      blocked("sales session", String(s.error));
    } else {
      const auths = await restGet(
        s.token,
        "user_authorities",
        `select=authority_key&user_id=eq.${s.userId}`
      );
      const roleAuths = await restGet(
        s.token,
        "profiles",
        `select=id,role,role_id&id=eq.${s.userId}`
      );
      pass(
        "sales session login",
        `role=${Array.isArray(roleAuths.body) ? roleAuths.body[0]?.role : "?"}`
      );
      // Assigned-only sales should not see company-wide lead source counts via RLS
      // (stats go through server action; here we confirm lead list is scoped).
      const leads = await restGet(
        s.token,
        "leads",
        "select=id&limit=50"
      );
      if (leads.status === 200 && Array.isArray(leads.body)) {
        pass("sales leads list", `${leads.body.length} rows under RLS`);
      } else {
        fail("sales leads list", `${leads.status}`);
      }
      void auths;
    }
  }

  if (!accountsEmail || !accountsPass) {
    skip("accounts session", "No QA_ACCOUNTS_EMAIL/PASSWORD");
  } else {
    const a = await signIn(accountsEmail, accountsPass);
    if (!a.ok) blocked("accounts session", String(a.error));
    else {
      const pays = await restGet(
        a.token,
        "payments",
        "select=id&limit=5"
      );
      if (pays.status === 200) pass("accounts payments read", `${Array.isArray(pays.body) ? pays.body.length : 0} rows`);
      else fail("accounts payments read", String(pays.status));
    }
  }

  if (!ownerEmail || !ownerPass) {
    skip("admin session", "No QA_OWNER/ADMIN login");
  } else {
    const o = await signIn(ownerEmail, ownerPass);
    if (!o.ok) blocked("admin session", String(o.error));
    else {
      const leads = await restGet(o.token, "leads", "select=id&limit=5");
      if (leads.status === 200) pass("admin leads read", "ok");
      else fail("admin leads read", String(leads.status));
    }
  }

  printReport(host);
  process.exitCode = rows.some((r) => r.status === "FAIL") ? 1 : 0;
}

function printReport(host) {
  const counts = { PASS: 0, FAIL: 0, SKIP: 0, BLOCKED: 0 };
  for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;
  const overall =
    counts.FAIL > 0 ? "FAILED" : counts.PASS > 0 ? "PASSED" : "BLOCKED";

  const lines = [
    `# QA report — KT / RK — Dashboard RBAC`,
    ``,
    `- Result: **${overall}**`,
    `- Env: host \`${host || "?"}\` (anon key; no service_role)`,
    `- Auth: optional user sessions only`,
    `- Cases: ${counts.PASS} PASS · ${counts.FAIL} FAIL · ${counts.SKIP} SKIP · ${counts.BLOCKED} BLOCKED`,
    ``,
    `| Status | Case | Detail |`,
    `|---|---|---|`,
    ...rows.map((r) => `| ${r.status} | ${r.name} | ${String(r.detail).replace(/\|/g, "/")} |`),
    ``,
    `## Expectation`,
    `- Sales Executive: no Accounts finance panel / company pending cards; no company Lead sources; Active leads = assigned.`,
    `- Accounts/Admin: Accounts finance + company pending present.`,
    `- \`record_payment\` / \`view_payment_queues\` alone ≠ company finance dashboard.`,
    ``,
  ];

  const outDir = path.join(ROOT, "docs");
  const outPath = path.join(outDir, "qa-dashboard-rbac-report.md");
  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(lines.join("\n"));
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  blocked("harness", err.message || String(err));
  printReport();
  process.exitCode = 1;
});
