/**
 * Scoped QA for ad landing + inbox (anon + user sessions only).
 * Loads Apps/RK-Solar/.env.local (or sibling Deliverables env).
 * Never uses SUPABASE_SERVICE_ROLE_KEY.
 */
const fs = require("fs");
const path = require("path");

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const root = path.join(__dirname, "..");
loadEnv(path.join(root, ".env.local"));
loadEnv(path.join(root, "..", "..", "Deliverables", "rk-solar", ".env.local"));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const APP = (process.env.NEXT_PUBLIC_APP_URL || process.env.PLAYWRIGHT_BASE_URL || "").replace(/\/$/, "");
const OWNER_EMAIL = process.env.QA_OWNER_EMAIL || process.env.QA_ADMIN_EMAIL;
const OWNER_PASS = process.env.QA_OWNER_PASSWORD || process.env.QA_ADMIN_PASSWORD;

const rows = [];
function record(id, result, detail) {
  rows.push({ id, result, detail });
  console.log(`${result.padEnd(7)} ${id} — ${detail}`);
}

async function supabase(pathName, { method = "GET", token, body, prefer } = {}) {
  const headers = {
    apikey: ANON,
    Authorization: `Bearer ${token || ANON}`,
    "Content-Type": "application/json",
  };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${SUPABASE_URL}${pathName}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { res, json };
}

async function main() {
  console.log("## QA report — RK Bhabhor — ad landing / inbox");
  if (!SUPABASE_URL || !ANON) {
    record("ENV", "BLOCKED", "Missing NEXT_PUBLIC_SUPABASE_URL or ANON key");
    process.exit(1);
  }
  record("ENV", "PASS", `host=${new URL(SUPABASE_URL).host}`);

  // Anon must not read submissions
  const anonSelect = await supabase("/rest/v1/ad_campaign_submissions?select=id&limit=1");
  if (anonSelect.res.status === 404 || (anonSelect.json && anonSelect.json.code === "PGRST205")) {
    record("Q0_SCHEMA", "BLOCKED", "Table missing — apply supabase/migrations/090_ad_campaign_submissions.sql");
  } else if (anonSelect.res.status === 401 || anonSelect.res.status === 403 || anonSelect.res.status === 200) {
    // 200 with empty under RLS is ok if no rows visible
    const leaked = Array.isArray(anonSelect.json) && anonSelect.json.length > 0;
    record("Q0_SCHEMA", leaked ? "FAIL" : "PASS", `anon select status=${anonSelect.res.status} leaked=${!!leaked}`);
  } else {
    record("Q0_SCHEMA", "FAIL", `unexpected anon select ${anonSelect.res.status} ${JSON.stringify(anonSelect.json)}`);
  }

  if (APP) {
    try {
      const go = await fetch(`${APP}/go`, { redirect: "manual" });
      const loc = go.headers.get("location") || "";
      if (go.status >= 200 && go.status < 300) {
        record("Q1_GO", "PASS", `GET /go → ${go.status}`);
      } else if (go.status >= 300 && go.status < 400 && /login/i.test(loc)) {
        record("Q1_GO", "BLOCKED", `still gated to login (deploy pending): ${go.status} → ${loc}`);
      } else {
        record("Q1_GO", "FAIL", `GET /go → ${go.status} ${loc}`);
      }
    } catch (e) {
      record("Q1_GO", "SKIP", `App URL unreachable: ${e.message}`);
    }
  } else {
    record("Q1_GO", "SKIP", "No NEXT_PUBLIC_APP_URL");
  }

  if (!OWNER_EMAIL || !OWNER_PASS) {
    record("Q7_AUTH", "SKIP", "No QA_OWNER_EMAIL / QA_OWNER_PASSWORD");
  } else {
    const auth = await supabase("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: { email: OWNER_EMAIL, password: OWNER_PASS },
    });
    const token = auth.json?.access_token;
    if (!token) {
      record("Q7_AUTH", "FAIL", `login failed: ${JSON.stringify(auth.json)}`);
    } else {
      record("Q7_AUTH", "PASS", "owner session ok");
      const staff = await supabase("/rest/v1/ad_campaign_submissions?select=id,status&limit=5", {
        token,
      });
      if (staff.res.ok) {
        record("Q8_INBOX", "PASS", `select ok rows=${Array.isArray(staff.json) ? staff.json.length : "?"}`);
      } else if (staff.res.status === 404 || staff.json?.code === "PGRST205") {
        record("Q8_INBOX", "BLOCKED", "table missing");
      } else {
        record("Q8_INBOX", "FAIL", `${staff.res.status} ${JSON.stringify(staff.json)}`);
      }
    }
  }

  const failed = rows.some((r) => r.result === "FAIL");
  const blocked = rows.some((r) => r.result === "BLOCKED");
  console.log(`\n- Result: ${failed ? "FAILED" : blocked ? "BLOCKED" : "PASSED"}`);
  console.log("- Auth: user sessions only (no service_role)");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
