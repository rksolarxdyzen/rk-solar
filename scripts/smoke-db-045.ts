/**
 * DB smoke: confirm migration 045 columns exist (uses service role from .env).
 * Run: npx --yes tsx scripts/smoke-db-045.ts
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
    out[m[1]] = m[2].replace(/^"|"$/g, "").trim();
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

  const { data, error } = await sb
    .from("leads")
    .select("id, consumer_number, company_bears_subsidy, subsidy_amount_at_won")
    .limit(1);

  if (error) {
    console.error("DB check FAILED:", error.message);
    if (/column .* does not exist|consumer_number|company_bears_subsidy/i.test(error.message)) {
      console.error(
        "→ Run supabase/migrations/045_won_consumer_subsidy.sql in the Supabase SQL editor."
      );
    }
    process.exit(1);
  }

  console.log("DB columns OK (consumer_number, company_bears_subsidy, subsidy_amount_at_won).");
  console.log("Sample row keys:", data?.[0] ? Object.keys(data[0]).join(", ") : "(no leads)");

  const { error: recvErr } = await sb
    .from("leads")
    .select(
      "id, name, phone, city, portal_code, sales_stage, consumer_number, won_token_amount, won_pre_dispatch_amount, won_final_amount, company_bears_subsidy, subsidy_amount_at_won, subsidy_verified_at"
    )
    .limit(1);

  if (recvErr) {
    console.error("Receivables select FAILED:", recvErr.message);
    process.exit(1);
  }
  console.log("Receivables select OK.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
