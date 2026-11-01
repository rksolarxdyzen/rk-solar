/**
 * QA: RK local-first foundation (anon denied + env present).
 * Does not use SUPABASE_SERVICE_ROLE_KEY.
 *
 * Cases:
 *  - Anon cannot read leads (RLS)
 *  - Owner session can read leads (optional QA_OWNER_*)
 *  - Source markers for SoftLink / IDB / SW present
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const schema = process.env.NEXT_PUBLIC_SUPABASE_DB_SCHEMA || "public";

const rows = [];
function pass(name, detail) {
  rows.push({ name, result: "PASS", detail });
}
function fail(name, detail) {
  rows.push({ name, result: "FAIL", detail });
}
function skip(name, detail) {
  rows.push({ name, result: "SKIP", detail });
}

function assertFileContains(rel, needles, name) {
  const full = path.join(__dirname, "..", rel);
  if (!fs.existsSync(full)) {
    fail(name, `missing ${rel}`);
    return;
  }
  const text = fs.readFileSync(full, "utf8");
  for (const n of needles) {
    if (!text.includes(n)) {
      fail(name, `${rel} missing "${n}"`);
      return;
    }
  }
  pass(name, rel);
}

function assertFileLacks(rel, needles, name) {
  const full = path.join(__dirname, "..", rel);
  if (!fs.existsSync(full)) {
    fail(name, `missing ${rel}`);
    return;
  }
  const text = fs.readFileSync(full, "utf8");
  for (const n of needles) {
    if (text.includes(n)) {
      fail(name, `${rel} still has "${n}"`);
      return;
    }
  }
  pass(name, rel);
}

async function main() {
  assertFileContains(
    "src/lib/local-first/query-client.ts",
    ["rks-cache-", "wipePersistedCache", "createIdbPersister"],
    "IDB cache helpers"
  );
  assertFileContains(
    "src/components/local-first/soft-link.tsx",
    ["prefetchRouteQueries", "clientNav.navigate", "preventDefault"],
    "SoftLink (Dyzen client navigate)"
  );
  assertFileContains(
    "src/components/local-first/rk-client-nav.tsx",
    ["pushState", "RkClientOutlet", "lazyPages", "always"],
    "RkClientNav Dyzen outlet"
  );
  assertFileContains(
    "public/sw.js",
    ["skipWaiting", "respondWith(fetch"],
    "PWA install service worker"
  );
  assertFileContains(
    "public/manifest.webmanifest",
    ["RK Solar", "standalone", "/brand/icon-192.png"],
    "PWA web manifest"
  );
  assertFileContains(
    "src/components/pwa/install-app-button.tsx",
    ["beforeinstallprompt", "Install app", "Add to Home Screen"],
    "Install app button"
  );
  assertFileContains(
    "src/components/pwa/register-service-worker.tsx",
    ['register("/sw.js")'],
    "SW register in root layout"
  );
  assertFileContains(
    "public/sw-rks.js",
    ["rk-shell-v1", "staleWhileRevalidate"],
    "Optional offline SW document cache"
  );
  assertFileContains(
    "src/components/local-first/sign-out-button.tsx",
    ["wipePersistedCache", "signOut"],
    "Logout wipes cache"
  );
  assertFileContains(
    "src/app/(dashboard)/layout.tsx",
    ["QueryProvider", "RkClientNavProvider", "RkClientOutlet"],
    "Dashboard SoftLink shell"
  );
  assertFileLacks(
    "src/components/local-first/rk-client-nav.tsx",
    ["softNavigated"],
    "No softNavigated gate (URL/content desync)"
  );
  assertFileContains(
    "src/lib/local-first/queries/lead-detail.ts",
    ["leadDetailOptions", "prefetchLeadDetail", '["rk", "lead"'],
    "Lead detail query cache"
  );
  assertFileContains(
    "src/lib/leads/use-visible-lead-prefetch.ts",
    ["IntersectionObserver", "prefetchLeadDetailsBatch", "kanban-scroll"],
    "Viewport + column scroll-ahead prefetch"
  );
  assertFileContains(
    "src/lib/leads/lead-shell.ts",
    ["leadShellToPlaceholder", "LeadListShell"],
    "Lead modal shell from list row"
  );
  assertFileContains(
    "src/components/leads/lead-detail-modal.tsx",
    ["placeholderData", "leadShellToPlaceholder", "shellPaint"],
    "Lead modal instant shell paint"
  );
  assertFileContains(
    "src/components/leads/lead-card.tsx",
    ["onPointerDown", "openLead(id, shell)"],
    "Card pointer-down prefetch + shell open"
  );
  assertFileContains(
    "src/components/leads/installation-detail-modal.tsx",
    ["placeholderData", "leadShellToPlaceholder", "shellPaint"],
    "Installation modal instant shell paint"
  );
  assertFileContains(
    "src/components/leads/installation-queue-list.tsx",
    ["onPointerDown", "openInstallation(row.id, shell)", "useVisibleLeadPrefetch"],
    "Install queue prefetch + shell open"
  );
  assertFileContains(
    "src/lib/local-first/quotation-detail-path.ts",
    ["matchQuotationDetailId", "isQuotationDetailPath"],
    "Quotation detail SoftLink path matcher"
  );
  assertFileContains(
    "src/components/local-first/pages/quotation-detail-page.tsx",
    ["placeholderData", "quoteShellToPlaceholder", "quotationDetailOptions"],
    "Quotation detail client shell page"
  );
  assertFileContains(
    "src/components/quotations/quotations-list.tsx",
    ["SoftLink", "prefetchQuote", "/quotations/${q.id}"],
    "Quotations list SoftLink + prefetch"
  );
  assertFileContains(
    "src/components/local-first/rk-client-nav.tsx",
    ["isQuotationDetailPath", "QuotationDetailLazy"],
    "RkClientOutlet serves quote detail"
  );
  assertFileContains(
    "src/app/api/local-first/leads/modal/route.ts",
    ["getLeadsModalByIds", "requireApiUser"],
    "Batched modal lead API"
  );
  assertFileContains(
    "src/lib/local-first/queries/lead-detail.ts",
    ["prefetchLeadDetailsBatch", "/api/local-first/leads/modal"],
    "Batch prefetch helper"
  );
  assertFileContains(
    "src/lib/local-first/offline-queue.ts",
    ["rk-mutations-", "flushOfflineQueue", "wipeOfflineQueues", "enqueueMutation"],
    "Phase G offline queue"
  );
  assertFileContains(
    "src/lib/local-first/queueable-crm.ts",
    [
      "queueableUpdateLead",
      "queueableMoveStage",
      "queueableMarkLost",
      "queueableReopenLead",
      "/api/local-first",
    ],
    "Phase G queueable CRM helpers"
  );
  assertFileContains(
    "src/app/api/local-first/leads/[id]/stage/route.ts",
    ["moveSalesStage", "requireApiUser"],
    "Phase G stage flush API"
  );
  assertFileContains(
    "src/components/leads/pipeline-board.tsx",
    ["queueableMoveStage"],
    "Pipeline uses queueable stage move"
  );
  assertFileContains(
    "src/components/local-first/sign-out-button.tsx",
    ["wipeOfflineQueues"],
    "Logout wipes mutation queue"
  );
  assertFileLacks(
    "src/lib/local-first/queueable-crm.ts",
    ["markWon", "verifyPayment", "completeInstall"],
    "Phase G excludes Won / payment verify / install complete"
  );

  if (!url || !anon) {
    fail("env", "NEXT_PUBLIC_SUPABASE_URL / ANON_KEY missing");
  } else {
    pass("env", new URL(url).host);

    const { createClient } = await import("@supabase/supabase-js");
    const anonClient = createClient(url, anon, {
      db: { schema },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: anonLeads, error: anonErr } = await anonClient
      .from("leads")
      .select("id")
      .limit(1);
    if (anonErr || !anonLeads || anonLeads.length === 0) {
      pass("anon denied leads", anonErr?.message || "empty");
    } else {
      fail("anon denied leads", "anon saw lead rows");
    }

    const email = process.env.QA_OWNER_EMAIL;
    const password = process.env.QA_OWNER_PASSWORD;
    if (!email || !password) {
      skip("owner session", "QA_OWNER_EMAIL/PASSWORD not set");
    } else {
      const userClient = createClient(url, anon, {
        db: { schema },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: auth, error: authErr } = await userClient.auth.signInWithPassword({
        email,
        password,
      });
      if (authErr || !auth.session) {
        fail("owner login", authErr?.message || "no session");
      } else {
        pass("owner login", email);
        const { data: leads, error: leadErr } = await userClient
          .from("leads")
          .select("id")
          .limit(1);
        if (leadErr) fail("owner read leads", leadErr.message);
        else pass("owner read leads", `rows=${leads?.length ?? 0}`);
        await userClient.auth.signOut();
      }
    }
  }

  const failed = rows.filter((r) => r.result === "FAIL");
  console.log("\n## QA report — KT-Renewable-Energy — local-first\n");
  console.log(`- Result: ${failed.length ? "FAILED" : "PASSED"}`);
  console.log(`- Env: ${url ? new URL(url).host : "n/a"} · schema ${schema}`);
  console.log("- Auth: user sessions only (no service_role)");
  console.log("- Cases:");
  for (const r of rows) {
    console.log(`  - [${r.result}] ${r.name}: ${r.detail}`);
  }
  console.log(
    "\nManual: cold load → SoftLink Pipeline ↔ Customers (no full spinner); airplane mode paints last lists; logout clears rks-cache-*."
  );

  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
