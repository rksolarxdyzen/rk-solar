/**
 * DB smoke: confirm migration 046 columns/tables exist (uses service role from .env).
 * Run: npx --yes tsx scripts/smoke-db-046.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), ".env"), "utf8");
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return out;
}

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { error: leadErr } = await sb
    .from("leads")
    .select("id, inverter_serial_number, install_geo_lat, install_geo_lng, expected_serial_count")
    .limit(1);

  if (leadErr) {
    console.error("leads install columns FAILED:", leadErr.message);
    console.error("→ Run supabase/migrations/046_installation_supervisor_proofs.sql in the SQL editor.");
    process.exit(1);
  }
  console.log("leads install columns OK.");

  const { error: serialErr } = await sb.from("installation_panel_serials").select("id").limit(1);
  if (serialErr) {
    console.error("installation_panel_serials FAILED:", serialErr.message);
    process.exit(1);
  }
  console.log("installation_panel_serials OK.");

  const { error: feasErr } = await sb.from("feasibility_reports").select("id, storage_path").limit(1);
  if (feasErr) {
    console.error("feasibility_reports.storage_path FAILED:", feasErr.message);
    process.exit(1);
  }
  console.log("feasibility_reports.storage_path OK.");

  const { data: role, error: roleErr } = await sb
    .from("roles")
    .select("slug, name")
    .eq("slug", "ops_coordinator")
    .maybeSingle();
  if (roleErr) {
    console.error("roles lookup FAILED:", roleErr.message);
    process.exit(1);
  }
  console.log("ops_coordinator display name:", role?.name ?? "(missing)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
