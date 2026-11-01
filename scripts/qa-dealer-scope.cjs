/**
 * Dealer RBAC scope QA (anon + optional dealer session).
 * Never uses SUPABASE_SERVICE_ROLE_KEY.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
 * Optional: QA_DEALER_EMAIL + QA_DEALER_PASSWORD
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
const EMAIL = process.env.QA_DEALER_EMAIL;
const PASS = process.env.QA_DEALER_PASSWORD;

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

function dealerOwnLeadOrFilter(id) {
  return [`created_by.eq.${id}`, `dealer_id.eq.${id}`].join(",");
}

async function main() {
  if (!SUPABASE_URL || !ANON) {
    blocked("env", "Missing NEXT_PUBLIC_SUPABASE_URL or ANON_KEY");
    return;
  }
  const host = new URL(SUPABASE_URL).host;
  console.log(`Env host: ${host}`);

  // Static filter contract
  const f = dealerOwnLeadOrFilter("11111111-1111-1111-1111-111111111111");
  if (f.includes("created_by.eq.") && f.includes("dealer_id.eq.") && !f.includes("assigned_to")) {
    pass("dealerOwnLeadOrFilter", "created_by|dealer_id only");
  } else {
    fail("dealerOwnLeadOrFilter", f);
  }

  // Anon cannot list leads/quotes
  const anonLeads = await fetch(`${SUPABASE_URL}/rest/v1/leads?select=id&limit=1`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  const anonQuotes = await fetch(`${SUPABASE_URL}/rest/v1/quotations?select=id&limit=1`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  const leadsBody = await anonLeads.json().catch(() => null);
  const quotesBody = await anonQuotes.json().catch(() => null);
  const leadsEmpty =
    anonLeads.status === 200 && Array.isArray(leadsBody) && leadsBody.length === 0;
  const quotesEmpty =
    anonQuotes.status === 200 && Array.isArray(quotesBody) && quotesBody.length === 0;
  const leadsDenied = anonLeads.status === 401 || anonLeads.status === 403;
  const quotesDenied = anonQuotes.status === 401 || anonQuotes.status === 403;
  if (leadsEmpty || leadsDenied) pass("anon leads", `${anonLeads.status}`);
  else fail("anon leads", `${anonLeads.status} ${JSON.stringify(leadsBody).slice(0, 120)}`);
  if (quotesEmpty || quotesDenied) pass("anon quotations", `${anonQuotes.status}`);
  else fail("anon quotations", `${anonQuotes.status} ${JSON.stringify(quotesBody).slice(0, 120)}`);

  // Migration marker: is_dealer_user must exist for 068
  const rpc = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_dealer_user`, {
    method: "POST",
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (rpc.status === 404) {
    blocked(
      "migration 068",
      "is_dealer_user missing — apply supabase/migrations/068_dealer_rbac_hard_scope.sql on this project"
    );
  } else if (rpc.ok || rpc.status === 401 || rpc.status === 403) {
    pass("migration 068 helper", `is_dealer_user reachable (${rpc.status})`);
  } else {
    const t = await rpc.text();
    if (/is_dealer_user|PGRST202|404/i.test(t)) {
      blocked("migration 068", "is_dealer_user missing — apply 068 on Supabase");
    } else {
      pass("migration 068 helper", `status ${rpc.status}`);
    }
  }

  if (!EMAIL || !PASS) {
    skip("dealer session matrix", "Set QA_DEALER_EMAIL + QA_DEALER_PASSWORD to exercise live RLS");
    return;
  }

  const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: ANON,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  });
  const auth = await authRes.json();
  if (!auth.access_token) {
    fail("dealer login", auth.error_description || auth.msg || authRes.status);
    return;
  }
  const token = auth.access_token;
  const uid = auth.user?.id;
  pass("dealer login", uid);

  const profRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?select=id,role,company_id&id=eq.${uid}`,
    { headers: { apikey: ANON, Authorization: `Bearer ${token}` } }
  );
  const prof = (await profRes.json())?.[0];
  if (!prof || prof.role !== "dealer") {
    fail("dealer role", `expected role=dealer, got ${prof?.role}`);
    return;
  }
  pass("dealer role", prof.role);

  const ownFilter = dealerOwnLeadOrFilter(uid);
  const ownLeadsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/leads?select=id,created_by,dealer_id&or=(${ownFilter})&limit=50`,
    { headers: { apikey: ANON, Authorization: `Bearer ${token}` } }
  );
  const ownLeads = await ownLeadsRes.json();
  if (!Array.isArray(ownLeads)) {
    fail("own leads query", JSON.stringify(ownLeads).slice(0, 200));
  } else {
    const bad = ownLeads.filter((l) => l.created_by !== uid && l.dealer_id !== uid);
    if (bad.length) fail("own leads ownership", `${bad.length} foreign rows`);
    else pass("own leads ownership", `${ownLeads.length} rows all owned`);
  }

  const allLeadsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/leads?select=id,created_by,dealer_id&limit=200`,
    { headers: { apikey: ANON, Authorization: `Bearer ${token}` } }
  );
  const allLeads = await allLeadsRes.json();
  if (!Array.isArray(allLeads)) {
    fail("leads list RLS", JSON.stringify(allLeads).slice(0, 200));
  } else {
    const foreign = allLeads.filter((l) => l.created_by !== uid && l.dealer_id !== uid);
    if (foreign.length) {
      fail(
        "leads company leak",
        `${foreign.length}/${allLeads.length} foreign — apply 068 if not already`
      );
    } else {
      pass("leads company leak", `${allLeads.length} visible, none foreign`);
    }
  }

  const quotesRes = await fetch(
    `${SUPABASE_URL}/rest/v1/quotations?select=id,created_by,lead_id&limit=200`,
    { headers: { apikey: ANON, Authorization: `Bearer ${token}` } }
  );
  const quotes = await quotesRes.json();
  if (!Array.isArray(quotes)) {
    fail("quotations list RLS", JSON.stringify(quotes).slice(0, 200));
  } else {
    const ownLeadIds = new Set(
      (Array.isArray(allLeads) ? allLeads : []).map((l) => l.id)
    );
    const foreignQ = quotes.filter(
      (q) => q.created_by !== uid && (!q.lead_id || !ownLeadIds.has(q.lead_id))
    );
    if (foreignQ.length) {
      fail(
        "quotations company leak",
        `${foreignQ.length}/${quotes.length} foreign — apply 068 if not already`
      );
    } else {
      pass("quotations company leak", `${quotes.length} visible, none foreign`);
    }
  }
}

main()
  .catch((err) => {
    fail("runner", err instanceof Error ? err.message : String(err));
  })
  .finally(() => {
    console.log("\n## QA report — KT — dealer RBAC scope");
    for (const r of rows) {
      console.log(`- ${r.status}: ${r.name} — ${r.detail}`);
    }
    const failed = rows.some((r) => r.status === "FAIL");
    process.exit(failed ? 1 : 0);
  });
