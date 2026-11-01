/* Inventory QA harness — anon key + user login only (never the service role key).
 * Usage: node scripts/qa-inventory.cjs            (read-only / rejected-write cases)
 *        node scripts/qa-inventory.cjs --write    (also posts QA_ stock movements, then reverses them)
 *        node scripts/qa-inventory.cjs --cleanup  (reverses leftover QA_ entries from earlier runs)
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

function loadEnv() {
  const env = {};
  for (const name of [".env", ".env.local"]) {
    const file = path.join(__dirname, "..", name);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const WRITE = process.argv.includes("--write");
const TAG = `QA_${Date.now()}`;
const results = [];

function record(name, expected, actual, pass, verdict) {
  results.push({ name, expected, actual: String(actual).slice(0, 140), verdict: verdict ?? (pass ? "PASS" : "FAIL") });
}

function client() {
  return createClient(SUPABASE_URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
}

const rid = () => crypto.randomUUID();

async function expectError(name, expected, promise, pattern) {
  try {
    const { error } = await promise;
    const msg = error ? `${error.code ?? ""} ${error.message}` : "no error";
    const pass = Boolean(error) && (!pattern || pattern.test(msg));
    record(name, expected, msg, pass);
    return error;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/fetch failed|network|ENOTFOUND|ECONNREFUSED/i.test(msg)) {
      record(name, expected, msg, false, "BLOCKED");
      return { message: msg };
    }
    record(name, expected, msg, false);
    return { message: msg };
  }
}

async function run() {
  if (!SUPABASE_URL || !ANON) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / ANON_KEY in .env.local");
  if (env.SUPABASE_SERVICE_ROLE_KEY && ANON === env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Anon key equals service key");

  // ---------------- anon ----------------
  const anon = client();
  {
    const { data, error } = await anon.from("inventory_items").select("id").limit(1);
    record("Anon reads inventory_items", "0 rows or denied", error ? error.message : `${data.length} rows`, error || data.length === 0);
  }
  {
    const { data, error } = await anon.from("inventory_item_costs").select("item_id").limit(1);
    record("Anon reads purchase costs", "0 rows or denied", error ? error.message : `${data.length} rows`, error || data.length === 0);
  }
  await expectError("Anon calls inventory_post_inward", "denied", anon.rpc("inventory_post_inward", { payload: { lines: [] } }), /42501|permission|denied|sign in/i);
  await expectError("Anon calls inventory_delete_item", "denied or missing", anon.rpc("inventory_delete_item", { p_item_id: "00000000-0000-0000-0000-000000000000" }), /42501|permission|denied|function|schema cache/i);
  await expectError("Anon calls inventory_search_movements", "denied or missing",
    anon.rpc("inventory_search_movements", { p_query: "540", p_type: null, p_limit: 5, p_offset: 0 }),
    /42501|permission|denied|function|schema cache|PGRST/i);
  await expectError("Anon calls inventory_create_master_group", "denied",
    anon.rpc("inventory_create_master_group", { p_name: "QA" }), /42501|permission|denied|sign in|JWT/i);
  {
    const { data, error } = await anon.from("inventory_master_groups").select("id").limit(1);
    record("Anon reads inventory_master_groups", "0 rows or denied", error ? error.message : `${data.length} rows`, error || data.length === 0);
  }
  {
    const { data, error } = await anon.from("inventory_subcategories").select("id").limit(1);
    record("Anon reads inventory_subcategories", "0 rows or denied", error ? error.message : `${data.length} rows`, error || data.length === 0);
  }

  // ---------------- owner ----------------
  const owner = client();
  const { data: auth, error: authErr } = await owner.auth.signInWithPassword({
    email: env.PLAYWRIGHT_EMAIL,
    password: env.PLAYWRIGHT_PASSWORD,
  });
  if (authErr) {
    record("Login (PLAYWRIGHT_EMAIL)", "signed in", authErr.message, false, "BLOCKED");
    return;
  }
  const { data: me } = await owner.from("profiles").select("id, company_id, role, role_id").eq("id", auth.user.id).single();
  record("Login (PLAYWRIGHT_EMAIL)", "signed in", `role=${me?.role}`, Boolean(me));
  const isOwner = me?.role === "owner";

  {
    const { data } = await owner.from("authorities").select("key").eq("authority_group", "inventory");
    const keys = (data ?? []).map((r) => r.key).sort();
    record("8 inventory authorities exist", "8", keys.length + " " + keys.join(","), keys.length === 8);
  }

  const { data: roles } = await owner.from("roles").select("id, slug").eq("company_id", me.company_id);
  const roleId = (slug) => roles?.find((r) => r.slug === slug)?.id;
  async function grants(slug) {
    const id = roleId(slug);
    if (!id) return null;
    const { data } = await owner.from("role_authorities").select("authority_key").eq("role_id", id).eq("granted", true);
    return new Set((data ?? []).map((r) => r.authority_key));
  }
  const cost = ["view_purchase_cost", "manage_purchase_cost"];
  const inv6 = ["view_inventory", "manage_inventory_items", "inventory_inward", "inventory_dispatch", "inventory_return", "inventory_adjust"];
  {
    const g = await grants("inventory-person");
    const expected = ["view_inventory", "manage_inventory_items", "inventory_inward", "inventory_dispatch", "inventory_return"];
    const ok = g && expected.every((k) => g.has(k)) && !g.has("inventory_adjust") && !cost.some((k) => g.has(k));
    record("Inventory Person role grants", "5 keys, no adjust/cost", g ? [...g].filter((k) => inv6.includes(k) || cost.includes(k)).join(",") : "role missing", ok);
  }
  {
    const g = await grants("admin");
    const ok = g && inv6.every((k) => g.has(k)) && !cost.some((k) => g.has(k));
    record("Admin role: inventory yes, cost no", "6 inventory, 0 cost", g ? `cost=${cost.filter((k) => g.has(k)).length} inv=${inv6.filter((k) => g.has(k)).length}` : "role missing", ok);
  }
  {
    const g = await grants("manager");
    const want = ["view_inventory", "inventory_dispatch", "inventory_return"];
    const ok = g && want.every((k) => g.has(k)) && !cost.some((k) => g.has(k));
    record("Manager role: view/dispatch/return, no cost", "3 keys", g ? inv6.filter((k) => g.has(k)).join(",") : "role missing", ok);
  }
  {
    const g = await grants("owner");
    record("Owner role has both cost keys", "both", g ? cost.filter((k) => g.has(k)).join(",") : "role missing", g && cost.every((k) => g.has(k)));
  }
  {
    const v = await owner.rpc("can_view_purchase_cost");
    const m = await owner.rpc("can_manage_purchase_cost");
    record("Pricing helpers for this login", isOwner ? "true/true" : "per role", `${v.error?.message ?? v.data}/${m.error?.message ?? m.data}`, isOwner ? v.data === true && m.data === true : !v.error);
  }
  for (const view of ["inventory_stock_on_hand", "inventory_customer_material", "inventory_stock_value"]) {
    const { error } = await owner.from(view).select("*").limit(1);
    record(`View ${view} readable`, "no error", error?.message ?? "ok", !error);
  }
  {
    const { data, error } = await owner.rpc("inventory_search_movements", {
      p_query: "540",
      p_type: null,
      p_limit: 5,
      p_offset: 0,
    });
    if (error && /function|schema cache|PGRST202/i.test(error.message)) {
      record("inventory_search_movements (057/022)", "available", "057 / handover 022 not applied", false, "BLOCKED");
    } else {
      record(
        "inventory_search_movements (057/022)",
        "runs (0+ rows)",
        error?.message ?? `rows=${(data ?? []).length}`,
        !error
      );
    }
  }
  {
    const { data, error } = await owner.from("inventory_movement_counters").select("*").limit(1);
    record("Counters hidden from clients", "0 rows or denied", error ? error.message : `${data.length} rows`, error || data.length === 0);
  }

  // Direct table writes must be blocked (only RPCs write the ledger)
  await expectError("Direct insert into inventory_movements", "RLS denied",
    owner.from("inventory_movements").insert({ company_id: me.company_id, movement_type: "inward", movement_no: `${TAG}-X` }), /row-level|42501|permission/i);
  await expectError("Direct insert into inventory_serials", "RLS denied",
    owner.from("inventory_serials").insert({ company_id: me.company_id, item_id: rid(), serial_no: `${TAG}X` }), /row-level|42501|permission|foreign/i);

  // Rejected RPC calls (roll back inside the DB, nothing is written)
  await expectError("Inward with no lines", "rejected", owner.rpc("inventory_post_inward", { payload: { lines: [] } }), /at least one item/i);
  await expectError("Inward with unknown item", "rejected", owner.rpc("inventory_post_inward", { payload: { lines: [{ item_id: rid(), quantity: 1 }] } }), /not found|item/i);
  await expectError("Dispatch to unknown customer", "rejected", owner.rpc("inventory_post_dispatch", { payload: { lead_id: rid(), lines: [{ item_id: rid(), quantity: 1 }] } }), /customer|lead/i);
  {
    const { data: openLead } = await owner.from("leads").select("id, sales_stage").not("sales_stage", "in", "(quote_accepted,completed)").limit(1).maybeSingle();
    if (openLead) {
      await expectError("Dispatch to a non-Won lead", "rejected", owner.rpc("inventory_post_dispatch", { payload: { lead_id: openLead.id, lines: [{ item_id: rid(), quantity: 1 }] } }), /won|completed|customer/i);
    } else record("Dispatch to a non-Won lead", "rejected", "no open lead to test", false, "SKIP");
  }
  await expectError("Adjustment without reason", "rejected", owner.rpc("inventory_post_adjustment", { payload: { lines: [{ item_id: rid(), quantity_delta: 1 }] } }), /reason/i);
  await expectError("Reverse unknown movement", "rejected", owner.rpc("inventory_reverse_movement", { p_movement_id: rid(), p_reason: "QA test" }), /not found|movement/i);
  await expectError("Opening import with unmapped item", "rejected", owner.rpc("inventory_import_opening_stock", { payload: { lines: [{ item_key: "nope", quantity: 1 }] } }), /item|row/i);
  await expectError("Serial check with bad mode", "rejected", owner.rpc("inventory_check_serials", { p_item_id: rid(), p_serials: ["X"], p_mode: "bogus", p_lead_id: null }), /mode/i);
  {
    const { data, error } = await owner.rpc("inventory_check_serials", { p_item_id: rid(), p_serials: [`${TAG}-new`, "  "], p_mode: "inward", p_lead_id: null });
    const ok = !error && data?.length === 2 && data[0].ok === true && data[1].ok === false;
    record("Serial check (inward): new ok, blank rejected", "ok,false", error?.message ?? JSON.stringify(data?.map((r) => [r.serial_no, r.ok])), ok);
  }

  await phase3ReadCases(anon, owner);
  await phaseMastersCases(owner, me);
  await phaseB2bCases(anon, owner, me);

  await staffCostCases(me);

  if (process.argv.includes("--cleanup")) await cleanupLeftovers(owner);
  if (WRITE) await writeCases(owner, me);
}

/** Cost must not leak to non-owners. Needs a second login (QA_STAFF_EMAIL / QA_STAFF_PASSWORD) in .env.local. */
async function staffCostCases(me) {
  const name = "Non-owner cost access (REST)";
  if (!env.QA_STAFF_EMAIL || !env.QA_STAFF_PASSWORD) {
    return record(name, "no cost rows without view_purchase_cost", "set QA_STAFF_EMAIL / QA_STAFF_PASSWORD (non-owner login)", false, "BLOCKED");
  }
  const staff = client();
  const { data: auth, error } = await staff.auth.signInWithPassword({ email: env.QA_STAFF_EMAIL, password: env.QA_STAFF_PASSWORD });
  if (error) return record(name, "signed in", error.message, false, "BLOCKED");
  const { data: prof } = await staff.from("profiles").select("role, company_id").eq("id", auth.user.id).single();
  if (prof?.role === "owner") return record(name, "a non-owner login", "QA_STAFF_EMAIL is an owner", false, "BLOCKED");
  const view = (await staff.rpc("can_view_purchase_cost")).data === true;
  const manage = (await staff.rpc("can_manage_purchase_cost")).data === true;
  record("Staff login pricing flags", "per role grant", `role=${prof?.role} view=${view} manage=${manage}`, prof?.company_id === me.company_id);

  const counts = {};
  for (const t of ["inventory_item_costs", "inventory_inward_costs", "inventory_stock_value"]) {
    const r = await staff.from(t).select("*").limit(5);
    counts[t] = r.error ? `denied` : r.data.length;
  }
  const hidden = Object.values(counts).every((c) => c === 0 || c === "denied");
  if (!view) {
    record("Staff without view_purchase_cost reads no cost rows", "0 / 0 / 0", JSON.stringify(counts), hidden);
  } else {
    record("Staff with view_purchase_cost can read cost", "rows readable", JSON.stringify(counts), !Object.values(counts).includes("denied"));
  }
  if (!manage) {
    const { data: item } = await staff.from("inventory_items").select("id").limit(1).maybeSingle();
    if (!item) return record("Staff cannot write cost", "denied", "no visible item", false, "SKIP");
    const w = await staff.from("inventory_item_costs").upsert({ item_id: item.id, company_id: me.company_id, default_unit_cost: 1 }).select();
    record("Staff cannot write cost", "denied", w.error ? `${w.error.code} ${w.error.message}` : `${w.data?.length} rows written`, Boolean(w.error));
  }
  await staff.auth.signOut();
}

const DETAIL_SELECT =
  "*,by:profiles!inventory_movements_created_by_fkey(name)," +
  "lines:inventory_movement_lines(id,item_id,quantity_delta,item:inventory_items(name,unit_type,track_serials,specifications)," +
  "serials:inventory_movement_line_serials(serial:inventory_serials(serial_no)))";

async function phase3ReadCases(anon, owner) {
  await expectError("Anon calls inventory_customer_lookup", "denied",
    anon.rpc("inventory_customer_lookup", { p_query: null, p_lead_ids: null, p_limit: 5 }), /42501|permission|denied/i);
  {
    const { data, error } = await owner.rpc("inventory_customer_lookup", { p_query: null, p_lead_ids: null, p_limit: 50 });
    if (error && /function|schema cache|PGRST202|42883/i.test(`${error.code} ${error.message}`)) {
      record("Customer lookup RPC (migration 052)", "rows", "052_inventory_customer_lookup.sql not applied", false, "BLOCKED");
      return;
    }
    const stages = [...new Set((data ?? []).map((r) => r.sales_stage))];
    const cols = data?.[0] ? Object.keys(data[0]).sort().join(",") : "(no rows)";
    record("Customer lookup: customers only, delivery fields only", "quote_accepted/completed; 7 cols",
      error?.message ?? `${data.length} rows, stages=${stages.join("/")}, cols=${cols}`,
      !error && stages.every((s) => ["quote_accepted", "completed"].includes(s)) && (!data[0] || Object.keys(data[0]).length === 7));
    const first = data?.[0];
    if (first) {
      const byName = await owner.rpc("inventory_customer_lookup", { p_query: first.name.slice(0, 4), p_lead_ids: null, p_limit: 20 });
      record("Customer lookup: search by name", "includes first customer", byName.error?.message ?? `${byName.data.length} rows`,
        !byName.error && byName.data.some((r) => r.id === first.id));
      const sug = await owner.rpc("inventory_quotation_suggestion", { p_lead_id: first.id });
      const keys = sug.data?.[0] ? Object.keys(sug.data[0]).sort().join(",") : "(no quotation)";
      record("Quotation suggestion has no prices", "item_id,quantity,quotation_no,source_name", sug.error?.message ?? keys,
        !sug.error && (!sug.data?.[0] || keys === "item_id,quantity,quotation_no,source_name"));
    }
    const { data: openLead } = await owner.from("leads").select("id").not("sales_stage", "in", "(quote_accepted,completed)").limit(1).maybeSingle();
    if (openLead) {
      const r = await owner.rpc("inventory_customer_lookup", { p_query: null, p_lead_ids: [openLead.id], p_limit: 5 });
      record("Customer lookup hides non-customer leads (no movements)", "0 rows", r.error?.message ?? `${r.data.length} rows`, !r.error && r.data.length === 0);
    }
  }
  {
    const { data: oneMove } = await owner.from("inventory_movements").select("id").limit(1).maybeSingle();
    if (oneMove) {
      const { error } = await owner.from("inventory_movements").select(DETAIL_SELECT).eq("id", oneMove.id).maybeSingle();
      record("Movement detail query (FK hints) works", "no error", error?.message ?? "ok", !error);
    } else record("Movement detail query (FK hints) works", "no error", "no movements yet", false, "SKIP");
  }
}

async function phaseMastersCases(owner, me) {
  const tag = `${TAG}_MG`;
  const mg = await owner.rpc("inventory_create_master_group", { p_name: tag });
  if (mg.error && /function|schema cache|PGRST202|42883/i.test(`${mg.error.code} ${mg.error.message}`)) {
    record("Item masters (migration 059/024)", "RPC available", "059_inventory_item_masters.sql not applied", false, "BLOCKED");
    return;
  }
  record("Owner creates master group", "id+name", mg.error?.message ?? mg.data?.name, !mg.error && mg.data?.id);
  const mgId = mg.data?.id;

  const cat = await owner.rpc("inventory_create_category", { p_name: `${tag}_Cat`, p_master_group_id: mgId });
  record("Owner creates category under master group", "id", cat.error?.message ?? cat.data?.id, !cat.error && cat.data?.id);
  const catId = cat.data?.id;

  const sub = await owner.rpc("inventory_create_subcategory", { p_category_id: catId, p_name: `${tag}_Sub` });
  record("Owner creates sub-category", "id", sub.error?.message ?? sub.data?.id, !sub.error && sub.data?.id);
  const subId = sub.data?.id;

  const brand = await owner.rpc("inventory_create_brand", { p_name: `${tag}_Brand` });
  record("Owner creates group via inventory RPC", "id", brand.error?.message ?? brand.data?.id, !brand.error && brand.data?.id);

  const again = await owner.rpc("inventory_create_master_group", { p_name: tag });
  record("Create master group is idempotent", "same id", again.error?.message ?? `${again.data?.id === mgId}`, !again.error && again.data?.id === mgId);

  const { data: otherCat } = await owner
    .from("quote_item_categories")
    .select("id, master_group_id")
    .eq("company_id", me.company_id)
    .neq("id", catId ?? rid())
    .limit(1)
    .maybeSingle();
  if (subId && otherCat?.id && mgId) {
    await expectError(
      "Item with subcategory from wrong category rejected",
      "belongs / category",
      owner.from("inventory_items").insert({
        company_id: me.company_id,
        name: `${tag} Bad Sub`,
        master_group_id: otherCat.master_group_id ?? mgId,
        category_id: otherCat.id,
        subcategory_id: subId,
        unit_type: "nos",
      }),
      /sub-category|category|belong|master/i
    );
  } else {
    record("Item with subcategory from wrong category rejected", "belongs / category", "need a second category", false, "SKIP");
  }

  if (mgId && catId && subId && brand.data?.id) {
    const item = await owner
      .from("inventory_items")
      .insert({
        company_id: me.company_id,
        name: `${tag} Full`,
        master_group_id: mgId,
        category_id: catId,
        subcategory_id: subId,
        brand_id: brand.data.id,
        unit_type: "m",
      })
      .select("id, master_group_id, category_id, subcategory_id, brand_id")
      .single();
    record(
      "Item insert with master/category/sub/group",
      "all four FKs",
      item.error?.message ?? "ok",
      !item.error &&
        item.data.master_group_id === mgId &&
        item.data.category_id === catId &&
        item.data.subcategory_id === subId &&
        item.data.brand_id === brand.data.id
    );
    if (item.data?.id) {
      await owner.from("inventory_items").delete().eq("id", item.data.id);
    }
  }

  // --- Revisions (064/029): hierarchy required, serial from master OR category, gst_percent ---
  await expectError(
    "Item insert without sub-category rejected (064)",
    "sub-category",
    owner.from("inventory_items").insert({
      company_id: me.company_id,
      name: `${tag} NoSub`,
      master_group_id: mgId,
      category_id: catId,
      unit_type: "nos",
    }),
    /sub-category|Choose a sub/i
  );

  const panelMg = await owner.rpc("inventory_create_master_group", { p_name: "Panel" });
  let panelMgId = panelMg.data?.id;
  if (panelMg.error && /unique|already|duplicate|23505/i.test(panelMg.error.message ?? "")) {
    const { data: existingMg } = await owner
      .from("inventory_master_groups")
      .select("id")
      .eq("company_id", me.company_id)
      .ilike("name", "panel")
      .maybeSingle();
    panelMgId = existingMg?.id ?? null;
  }
  if (panelMgId && catId && subId) {
    // Re-link category under Panel master for serial-from-master test, or create a Panel category + sub
    const pCat = await owner.rpc("inventory_create_category", { p_name: `${tag}_PCat`, p_master_group_id: panelMgId });
    const pCatId = pCat.data?.id;
    const pSub = pCatId
      ? await owner.rpc("inventory_create_subcategory", { p_category_id: pCatId, p_name: `${tag}_PSub` })
      : { data: null, error: pCat.error };
    const pSubId = pSub.data?.id;
    if (pCatId && pSubId) {
      const serialFromMaster = await owner
        .from("inventory_items")
        .insert({
          company_id: me.company_id,
          name: `${tag} Panel Master Serial`,
          master_group_id: panelMgId,
          category_id: pCatId,
          subcategory_id: pSubId,
          unit_type: "kg",
        })
        .select("id, track_serials, unit_type")
        .single();
      record(
        "Panel master group forces track_serials (064)",
        "track_serials, nos",
        serialFromMaster.error?.message ??
          `${serialFromMaster.data?.track_serials}, ${serialFromMaster.data?.unit_type}`,
        !serialFromMaster.error &&
          serialFromMaster.data.track_serials &&
          serialFromMaster.data.unit_type === "nos"
      );
      if (serialFromMaster.data?.id) {
        const costUpsert = await owner.from("inventory_item_costs").upsert({
          item_id: serialFromMaster.data.id,
          company_id: me.company_id,
          default_unit_cost: 1000,
          gst_percent: 18,
          updated_at: new Date().toISOString(),
        });
        if (costUpsert.error && /gst_percent|column|42703/i.test(costUpsert.error.message ?? "")) {
          record("Item cost gst_percent (064)", "saved 18", "064_inventory_item_master_revisions.sql not applied", false, "BLOCKED");
        } else {
          const { data: costRow } = await owner
            .from("inventory_item_costs")
            .select("default_unit_cost, gst_percent")
            .eq("item_id", serialFromMaster.data.id)
            .maybeSingle();
          record(
            "Item cost gst_percent read back (064)",
            "1000 / 18",
            costUpsert.error?.message ?? `${costRow?.default_unit_cost} / ${costRow?.gst_percent}`,
            !costUpsert.error && Number(costRow?.default_unit_cost) === 1000 && Number(costRow?.gst_percent) === 18
          );
        }
        await owner.from("inventory_items").delete().eq("id", serialFromMaster.data.id);
      }
      await owner.from("inventory_subcategories").delete().eq("id", pSubId);
      await owner.from("quote_item_categories").delete().eq("id", pCatId);
    } else {
      record("Panel master group forces track_serials (064)", "track_serials", pSub.error?.message ?? pCat.error?.message ?? "skip", false, "SKIP");
    }
  } else {
    record("Panel master group forces track_serials (064)", "track_serials", "could not ensure Panel master", false, "SKIP");
  }

  // Soft cleanup of masters created for QA (safe if unused)
  if (subId) await owner.from("inventory_subcategories").delete().eq("id", subId);
  if (catId) await owner.from("quote_item_categories").delete().eq("id", catId);
  if (brand.data?.id) await owner.from("quote_brands").delete().eq("id", brand.data.id);
  if (mgId) await owner.from("inventory_master_groups").delete().eq("id", mgId);
}

async function phaseB2bCases(anon, owner, me) {
  await expectError(
    "Anon selects inventory_parties",
    "denied",
    anon.from("inventory_parties").select("id").limit(1),
    /row-level|42501|permission|JWT|denied/i
  );
  await expectError(
    "Anon calls inventory_party_lookup",
    "denied",
    anon.rpc("inventory_party_lookup", { p_query: null, p_limit: 5 }),
    /42501|permission|denied|JWT/i
  );
  await expectError(
    "Anon calls inventory_create_party",
    "denied",
    anon.rpc("inventory_create_party", { p_name: `${TAG} Party`, p_kind: "dealer" }),
    /42501|permission|denied|JWT/i
  );

  const created = await owner.rpc("inventory_create_party", {
    p_name: `${TAG} Dealer`,
    p_kind: "dealer",
    p_phone: "9999999999",
    p_city: "QA City",
  });
  if (created.error && /function|schema cache|PGRST202|42883|relation.*inventory_parties/i.test(`${created.error.code} ${created.error.message}`)) {
    record("B2B parties (migration 060/025)", "RPC available", "060_inventory_parties.sql not applied", false, "BLOCKED");
    return;
  }
  record("Owner creates inventory party", "id+name", created.error?.message ?? created.data?.name, !created.error && created.data?.id);
  const partyId = created.data?.id;

  const lookup = await owner.rpc("inventory_party_lookup", { p_query: TAG, p_limit: 20 });
  record(
    "Party lookup finds QA party",
    "includes created",
    lookup.error?.message ?? `${(lookup.data ?? []).length} rows`,
    !lookup.error && (lookup.data ?? []).some((p) => p.id === partyId)
  );

  await expectError(
    "Dispatch with neither lead nor party",
    "rejected",
    owner.rpc("inventory_post_dispatch", { payload: { lines: [{ item_id: rid(), quantity: 1 }] } }),
    /customer|party|company|dealer|vendor|lead/i
  );
  await expectError(
    "Dispatch with both lead and party",
    "rejected",
    owner.rpc("inventory_post_dispatch", {
      payload: { lead_id: rid(), party_id: partyId ?? rid(), lines: [{ item_id: rid(), quantity: 1 }] },
    }),
    /customer|party|one|xor|both/i
  );

  // Soft-deactivate QA party if no stock movements (write path may reuse by name)
  if (partyId) {
    await owner.from("inventory_parties").update({ is_active: false }).eq("id", partyId).eq("company_id", me.company_id);
  }
}

/** Reverse any unreversed QA_ entries (newest first) and deactivate QA_ items from earlier runs. */
async function cleanupLeftovers(owner) {
  const { data: items } = await owner.from("inventory_items").select("id").like("name", "QA\\_%");
  const itemIds = (items ?? []).map((i) => i.id);
  if (itemIds.length === 0) return record("Cleanup earlier QA data", "nothing left", "no QA items", true);
  const { data: lines } = await owner.from("inventory_movement_lines").select("movement_id").in("item_id", itemIds);
  const ids = [...new Set((lines ?? []).map((l) => l.movement_id))];
  const { data: moves } = await owner
    .from("inventory_movements")
    .select("id, created_at")
    .in("id", ids.length ? ids : [rid()])
    .is("reversed_by_id", null)
    .in("movement_type", ["inward", "dispatch", "return"])
    .order("created_at", { ascending: true });
  await cleanup(owner, (moves ?? []).map((m) => m.id), itemIds);
}

async function writeCases(owner, me) {
  const { data: wonLead } = await owner.from("leads").select("id, name").in("sales_stage", ["quote_accepted", "completed"]).limit(1).maybeSingle();
  if (!wonLead) return record("Write cases", "a Won customer", "none found", false, "SKIP");

  // Hierarchy required (064): create Master → Category → Sub for panel + bulk
  const panelMg = await owner.rpc("inventory_create_master_group", { p_name: `${TAG}_PanelMG` });
  if (panelMg.error && /function|schema cache|PGRST202|42883/i.test(`${panelMg.error.code} ${panelMg.error.message}`)) {
    return record("Write cases", "059/024 masters", "item masters migration not applied", false, "BLOCKED");
  }
  const bulkMg = await owner.rpc("inventory_create_master_group", { p_name: `${TAG}_BulkMG` });
  const panelCat = await owner.rpc("inventory_create_category", {
    p_name: "Panel",
    p_master_group_id: panelMg.data?.id,
  });
  const bulkCat = await owner.rpc("inventory_create_category", {
    p_name: `${TAG}_CableCat`,
    p_master_group_id: bulkMg.data?.id,
  });
  const panelSub = panelCat.data?.id
    ? await owner.rpc("inventory_create_subcategory", { p_category_id: panelCat.data.id, p_name: `${TAG}_PSub` })
    : { error: panelCat.error, data: null };
  const bulkSub = bulkCat.data?.id
    ? await owner.rpc("inventory_create_subcategory", { p_category_id: bulkCat.data.id, p_name: `${TAG}_BSub` })
    : { error: bulkCat.error, data: null };
  if (!panelMg.data?.id || !panelCat.data?.id || !panelSub.data?.id || !bulkMg.data?.id || !bulkCat.data?.id || !bulkSub.data?.id) {
    return record(
      "Write cases hierarchy",
      "master/cat/sub",
      panelSub.error?.message ?? bulkSub.error?.message ?? panelCat.error?.message ?? "failed",
      false,
      "BLOCKED"
    );
  }

  const ins = async (row) =>
    owner.from("inventory_items").insert({ company_id: me.company_id, ...row }).select("id, track_serials, unit_type, name").single();
  const serialItem = await ins({
    name: `${TAG} Panel › test`,
    master_group_id: panelMg.data.id,
    category_id: panelCat.data.id,
    subcategory_id: panelSub.data.id,
    unit_type: "kg",
  });
  record(
    "Panel-category item becomes serial-tracked (unit forced to Nos)",
    "track_serials, nos",
    serialItem.error?.message ?? `${serialItem.data.track_serials}, ${serialItem.data.unit_type}`,
    !serialItem.error && serialItem.data.track_serials && serialItem.data.unit_type === "nos"
  );
  const bulkItem = await ins({
    name: `${TAG} Cable › test`,
    master_group_id: bulkMg.data.id,
    category_id: bulkCat.data.id,
    subcategory_id: bulkSub.data.id,
    unit_type: "m",
  });
  record("Bulk item created", "ok", bulkItem.error?.message ?? "ok", !bulkItem.error);
  if (serialItem.error || bulkItem.error) return;
  const S = serialItem.data.id;
  const B = bulkItem.data.id;
  const s1 = `${TAG}-S1`.toLowerCase();
  const s2 = `${TAG}-S2`;

  await expectError("Inward serial item: quantity ≠ serial count", "rejected",
    owner.rpc("inventory_post_inward", { payload: { lines: [{ item_id: S, quantity: 3, serials: [s1, s2] }] } }), /serial/i);
  await expectError("Inward serial item: duplicate serial in scan", "rejected",
    owner.rpc("inventory_post_inward", { payload: { lines: [{ item_id: S, serials: [s1, s1.toUpperCase()] }] } }), /duplicate|twice|more than once/i);
  await expectError("Inward serial item: no serials", "rejected",
    owner.rpc("inventory_post_inward", { payload: { lines: [{ item_id: S, quantity: 2 }] } }), /serial/i);

  const moves = [];
  const inward = await owner.rpc("inventory_post_inward", {
    payload: { supplier_name: TAG, notes: TAG, lines: [
      { item_id: S, serials: [{ serial_no: s1, raw_scan: `SN:${s1}|MODEL:X` }, s2], unit_cost: 12000 },
      { item_id: B, quantity: 100, unit_cost: 30 },
    ] },
  });
  record("Inward (2 serials + 100 m, with cost)", "IN-YYYY-NNNN", inward.error?.message ?? inward.data?.movement_no, !inward.error && /^IN-\d{4}-\d{4,}$/.test(inward.data?.movement_no ?? ""));
  if (inward.error) return;
  moves.push(inward.data.id);

  {
    const { data } = await owner.from("inventory_serials").select("serial_no, status").eq("item_id", S).order("serial_no");
    record("Serials stored normalized (uppercase)", `${s1.toUpperCase()}`, data?.map((r) => r.serial_no).join(","), data?.some((r) => r.serial_no === s1.toUpperCase()));
  }
  await expectError("Inward an existing serial again", "rejected",
    owner.rpc("inventory_post_inward", { payload: { lines: [{ item_id: S, serials: [s2] }] } }), /already/i);
  {
    const { data } = await owner.rpc("inventory_check_serials", { p_item_id: S, p_serials: [s2], p_mode: "inward", p_lead_id: null });
    record("Serial check (inward) flags existing serial", "ok=false", JSON.stringify(data?.[0]), data?.[0]?.ok === false);
  }
  {
    const { data } = await owner.from("inventory_stock_value").select("item_id, stock_value").in("item_id", [S, B]);
    const v = Object.fromEntries((data ?? []).map((r) => [r.item_id, Number(r.stock_value)]));
    record("Owner sees stock value", "24000 / 3000", `${v[S]} / ${v[B]}`, v[S] === 24000 && v[B] === 3000);
  }
  {
    const { data: lines } = await owner.from("inventory_movement_lines").select("id, item_id").eq("movement_id", inward.data.id);
    const { data: costs } = await owner.from("inventory_inward_costs").select("line_id, unit_cost").in("line_id", (lines ?? []).map((l) => l.id));
    const byItem = Object.fromEntries((lines ?? []).map((l) => [l.item_id, Number(costs?.find((c) => c.line_id === l.id)?.unit_cost)]));
    record("Inward line costs readable for the movement detail", "12000 / 30", `${byItem[S]} / ${byItem[B]}`, byItem[S] === 12000 && byItem[B] === 30);
  }

  await expectError("Dispatch serial item without serials", "rejected",
    owner.rpc("inventory_post_dispatch", { payload: { lead_id: wonLead.id, lines: [{ item_id: S, quantity: 1 }] } }), /serial/i);
  await expectError("Dispatch more cable than in stock", "rejected",
    owner.rpc("inventory_post_dispatch", { payload: { lead_id: wonLead.id, lines: [{ item_id: B, quantity: 1000 }] } }), /stock|only/i);
  await expectError("Dispatch a serial under the wrong item", "rejected",
    owner.rpc("inventory_post_dispatch", { payload: { lead_id: wonLead.id, lines: [{ item_id: B, quantity: 1, serials: [s1] }] } }), /serial|belongs|item/i);

  const dispatch = await owner.rpc("inventory_post_dispatch", {
    payload: { lead_id: wonLead.id, vehicle_no: "QA01", notes: TAG, lines: [{ item_id: S, serials: [s1] }, { item_id: B, quantity: 40 }] },
  });
  record("Dispatch 1 serial + 40 m to Won customer", "DC-YYYY-NNNN", dispatch.error?.message ?? dispatch.data?.movement_no, !dispatch.error);
  if (dispatch.error) return cleanup(owner, moves, [S, B]);
  moves.push(dispatch.data.id);

  await expectError("Dispatch the same serial twice", "rejected",
    owner.rpc("inventory_post_dispatch", { payload: { lead_id: wonLead.id, lines: [{ item_id: S, serials: [s1] }] } }), /dispatch|stock|already/i);
  await expectError("Dispatch an unknown serial", "rejected",
    owner.rpc("inventory_post_dispatch", { payload: { lead_id: wonLead.id, lines: [{ item_id: S, serials: [`${TAG}-NOPE`] }] } }), /not in inventory/i);
  {
    const { data, error } = await owner.from("inventory_movements").select(DETAIL_SELECT).eq("id", dispatch.data.id).single();
    const line = data?.lines?.find((l) => l.item_id === S);
    const sn = (line?.serials ?? []).map((x) => x.serial?.serial_no);
    record("Challan detail lists the dispatched serial", s1.toUpperCase(), error?.message ?? `${data.movement_no} vehicle=${data.vehicle_no} SN=${sn.join(",")}`,
      !error && sn.includes(s1.toUpperCase()) && data.vehicle_no === "QA01");
  }
  {
    const d2 = await owner.rpc("inventory_post_dispatch", { payload: { lead_id: wonLead.id, lines: [{ item_id: S, serials: [s2] }] } });
    const rv = d2.error ? null : await owner.rpc("inventory_reverse_movement", { p_movement_id: d2.data.id, p_reason: `${TAG} reverse dispatch` });
    const { data: sr } = await owner.from("inventory_serials").select("status, current_lead_id").eq("serial_no", s2.toUpperCase()).single();
    record("Reverse a dispatch → serial back in stock", "RV-…, in_stock, no customer",
      d2.error?.message ?? rv?.error?.message ?? `${rv.data.movement_no}, ${sr?.status}, lead=${sr?.current_lead_id ?? "none"}`,
      !d2.error && !rv?.error && sr?.status === "in_stock" && !sr?.current_lead_id);
  }
  await expectError("Reverse inward after its serial moved", "rejected",
    owner.rpc("inventory_reverse_movement", { p_movement_id: inward.data.id, p_reason: TAG }), /moved|later|cannot/i);

  {
    const { data: otherLead } = await owner.from("leads").select("id").in("sales_stage", ["quote_accepted", "completed"]).neq("id", wonLead.id).limit(1).maybeSingle();
    if (otherLead) {
      await expectError("Return a serial from the wrong customer", "rejected",
        owner.rpc("inventory_post_return", { payload: { lead_id: otherLead.id, lines: [{ item_id: S, serials: [s1] }] } }), /not at this customer/i);
      const { data } = await owner.rpc("inventory_check_serials", { p_item_id: S, p_serials: [s1], p_mode: "return", p_lead_id: otherLead.id });
      record("Serial check (return) flags serial at another customer", "ok=false", JSON.stringify(data?.[0]), data?.[0]?.ok === false);
    } else record("Return a serial from the wrong customer", "rejected", "only one customer", false, "SKIP");
    const { data } = await owner.rpc("inventory_check_serials", { p_item_id: S, p_serials: [s1], p_mode: "return", p_lead_id: wonLead.id });
    record("Serial check (return) accepts serial at this customer", "ok=true", JSON.stringify(data?.[0]), data?.[0]?.ok === true);
  }

  const ret = await owner.rpc("inventory_post_return", {
    payload: { lead_id: wonLead.id, notes: TAG, lines: [{ item_id: S, serials: [s1], condition: "defective" }, { item_id: B, quantity: 5 }] },
  });
  record("Return 1 serial (defective) + 5 m", "RT-YYYY-NNNN", ret.error?.message ?? ret.data?.movement_no, !ret.error);
  if (!ret.error) moves.push(ret.data.id);
  await expectError("Return more cable than the customer used", "rejected",
    owner.rpc("inventory_post_return", { payload: { lead_id: wonLead.id, lines: [{ item_id: B, quantity: 500 }] } }), /used|more|only/i);
  const retBad = await owner.rpc("inventory_post_return", {
    payload: { lead_id: wonLead.id, notes: TAG, lines: [{ item_id: B, quantity: 2, condition: "defective" }] },
  });
  record("Return 2 m cable as defective", "RT-YYYY-NNNN", retBad.error?.message ?? retBad.data?.movement_no, !retBad.error);
  if (!retBad.error) moves.push(retBad.data.id);

  {
    const { data } = await owner.from("inventory_customer_material").select("item_id, dispatched, returned, used").eq("lead_id", wonLead.id).in("item_id", [S, B]);
    const m = Object.fromEntries((data ?? []).map((r) => [r.item_id, `${Number(r.dispatched)}-${Number(r.returned)}=${Number(r.used)}`]));
    record("Customer material = dispatched − returned", "S 1-1=0, B 40-7=33", `S ${m[S]}, B ${m[B]}`, m[S] === "1-1=0" && m[B] === "40-7=33");
  }
  {
    const { data } = await owner.from("inventory_stock_on_hand").select("item_id, on_hand, serials_defective").in("item_id", [S, B]);
    const o = Object.fromEntries((data ?? []).map((r) => [r.item_id, r]));
    record("Stock on hand after movements (defective 2 m not counted)", "S 1 (1 defective), B 65", `S ${Number(o[S]?.on_hand)} (${o[S]?.serials_defective}), B ${Number(o[B]?.on_hand)}`,
      Number(o[S]?.on_hand) === 1 && Number(o[S]?.serials_defective) === 1 && Number(o[B]?.on_hand) === 65);
  }

  await phase5HistoryCases(owner, moves, { S, s2, wonLead });
  await phaseB2bWriteCases(owner, me, moves, { S, B, s2 });
  await cleanup(owner, moves, [S, B]);
  await deleteItemCases(owner, me, S);
}

async function phaseB2bWriteCases(owner, me, moves, { S, B }) {
  const party = await owner.rpc("inventory_create_party", {
    p_name: `${TAG} B2B Vendor`,
    p_kind: "vendor",
    p_city: "Ahmedabad",
  });
  if (party.error && /function|schema cache|PGRST202|42883|relation.*inventory_parties/i.test(`${party.error.code} ${party.error.message}`)) {
    return record("B2B write cases (060/025)", "available", "060_inventory_parties.sql not applied", false, "BLOCKED");
  }
  record("B2B write: create vendor party", "id", party.error?.message ?? party.data?.id, !party.error && party.data?.id);
  if (party.error) return;
  const partyId = party.data.id;
  const s3 = `${TAG}-S3`;

  const inward = await owner.rpc("inventory_post_inward", {
    payload: {
      notes: TAG,
      lines: [
        { item_id: S, serials: [s3], unit_cost: 1 },
        { item_id: B, quantity: 10, unit_cost: 1 },
      ],
    },
  });
  record("B2B write: inward serial + cable for party", "IN-…", inward.error?.message ?? inward.data?.movement_no, !inward.error);
  if (inward.error) return;
  moves.push(inward.data.id);

  const dispatch = await owner.rpc("inventory_post_dispatch", {
    payload: {
      party_id: partyId,
      notes: TAG,
      lines: [
        { item_id: S, serials: [s3] },
        { item_id: B, quantity: 3 },
      ],
    },
  });
  record(
    "B2B dispatch with party_id (no lead)",
    "DC-…",
    dispatch.error?.message ?? dispatch.data?.movement_no,
    !dispatch.error && /^DC-\d{4}-\d{4,}$/.test(dispatch.data?.movement_no ?? "")
  );
  if (dispatch.error) return;
  moves.push(dispatch.data.id);

  {
    const { data: m } = await owner.from("inventory_movements").select("lead_id,party_id").eq("id", dispatch.data.id).single();
    record(
      "B2B dispatch movement XOR",
      "lead null, party set",
      `lead=${m?.lead_id} party=${m?.party_id === partyId}`,
      m?.lead_id == null && m?.party_id === partyId
    );
    // On-Floor ensure trigger only runs when lead_id is set — party dispatch must stay lead-null.
    record(
      "On-Floor not created for party dispatch",
      "lead_id null on dispatch",
      m?.lead_id == null ? "lead_id null (trigger no-ops)" : `lead_id=${m?.lead_id}`,
      m?.lead_id == null
    );
  }
  {
    const { data: sr } = await owner
      .from("inventory_serials")
      .select("status,current_lead_id,current_party_id")
      .eq("serial_no", s3.toUpperCase())
      .single();
    record(
      "Serial at B2B party",
      "dispatched @ party",
      `${sr?.status} lead=${sr?.current_lead_id} party=${sr?.current_party_id === partyId}`,
      sr?.status === "dispatched" && sr?.current_lead_id == null && sr?.current_party_id === partyId
    );
  }

  await expectError(
    "Return serial from wrong party",
    "rejected",
    owner.rpc("inventory_post_return", {
      payload: { party_id: rid(), lines: [{ item_id: S, serials: [s3] }] },
    }),
    /party|company|dealer|vendor|not at/i
  );

  const ret = await owner.rpc("inventory_post_return", {
    payload: {
      party_id: partyId,
      notes: TAG,
      lines: [
        { item_id: S, serials: [s3], condition: "good" },
        { item_id: B, quantity: 3 },
      ],
    },
  });
  record("B2B return from party", "RT-…", ret.error?.message ?? ret.data?.movement_no, !ret.error);
  if (!ret.error) moves.push(ret.data.id);

  {
    const { data } = await owner
      .from("inventory_party_material")
      .select("item_id, dispatched, returned, used")
      .eq("party_id", partyId)
      .in("item_id", [S, B]);
    const m = Object.fromEntries((data ?? []).map((r) => [r.item_id, `${Number(r.dispatched)}-${Number(r.returned)}=${Number(r.used)}`]));
    record(
      "Party material = dispatched − returned",
      "S 1-1=0, B 3-3=0",
      `S ${m[S]}, B ${m[B]}`,
      m[S] === "1-1=0" && m[B] === "3-3=0"
    );
  }

  await owner.from("inventory_parties").update({ is_active: false }).eq("id", partyId).eq("company_id", me.company_id);
}

/** Unused items can be deleted; items with stock entries are refused (mark inactive instead). */
async function deleteItemCases(owner, me, usedItemId) {
  // Reuse any existing hierarchy row for an unused delete target
  const { data: used } = await owner
    .from("inventory_items")
    .select("master_group_id, category_id, subcategory_id")
    .eq("id", usedItemId)
    .maybeSingle();
  if (!used?.master_group_id || !used?.category_id || !used?.subcategory_id) {
    return record("Delete an unused item", "deleted", "used item missing hierarchy for spare insert", false, "SKIP");
  }
  const spare = await owner
    .from("inventory_items")
    .insert({
      company_id: me.company_id,
      name: `${TAG} Spare · ${Date.now()}`,
      master_group_id: used.master_group_id,
      category_id: used.category_id,
      subcategory_id: used.subcategory_id,
      unit_type: "nos",
    })
    .select("id")
    .single();
  if (spare.error) return record("Delete an unused item", "deleted", spare.error.message, false);
  const del = await owner.rpc("inventory_delete_item", { p_item_id: spare.data.id });
  if (del.error && /function|schema cache/i.test(del.error.message)) {
    await owner.from("inventory_items").update({ is_active: false }).eq("id", spare.data.id);
    return record("Delete item RPC (migration 053)", "deleted", "053_inventory_delete_item.sql not applied", false, "BLOCKED");
  }
  const { data: gone } = await owner.from("inventory_items").select("id").eq("id", spare.data.id);
  record("Delete an unused item", "deleted, row gone", del.error?.message ?? `returned "${del.data}", rows left=${gone?.length}`, !del.error && gone?.length === 0);
  await expectError("Delete an item with stock entries", "ITEM_HAS_HISTORY",
    owner.rpc("inventory_delete_item", { p_item_id: usedItemId }), /ITEM_HAS_HISTORY/);
  await expectError("Delete an unknown item", "not found", owner.rpc("inventory_delete_item", { p_item_id: rid() }), /not found/i);
  const direct = await owner.from("inventory_items").delete().eq("id", usedItemId).select("id");
  record("Direct table DELETE blocked (RPC only)", "0 rows", direct.error?.message ?? `${direct.data?.length} rows`, Boolean(direct.error) || direct.data?.length === 0);
}

/** Serial returned good then re-dispatched: lookup shows both customers in order; item history is chronological. */
async function phase5HistoryCases(owner, moves, { S, s2, wonLead }) {
  const { data: otherLead } = await owner.from("leads").select("id").in("sales_stage", ["quote_accepted", "completed"]).neq("id", wonLead.id).limit(1).maybeSingle();
  if (!otherLead) return record("Serial re-dispatched to a second customer", "two customers", "only one customer", false, "SKIP");

  const steps = [
    ["dispatch", { lead_id: wonLead.id, notes: TAG, lines: [{ item_id: S, serials: [s2] }] }],
    ["return", { lead_id: wonLead.id, notes: TAG, lines: [{ item_id: S, serials: [s2], condition: "good" }] }],
    ["dispatch", { lead_id: otherLead.id, notes: TAG, lines: [{ item_id: S, serials: [s2] }] }],
  ];
  const posted = [];
  for (const [kind, payload] of steps) {
    const r = await owner.rpc(`inventory_post_${kind}`, { payload });
    if (r.error) return record("Dispatch → return good → dispatch to 2nd customer", "3 movements", r.error.message, false);
    moves.push(r.data.id);
    posted.push(r.data.movement_no);
  }
  record("Dispatch → return good → dispatch to 2nd customer", "3 movements", posted.join(", "), true);

  const { data: sr } = await owner.from("inventory_serials").select("id, status, current_lead_id").eq("serial_no", s2.toUpperCase()).single();
  record("Serial now at the 2nd customer", "dispatched @ B", `${sr?.status} @ ${sr?.current_lead_id === otherLead.id ? "B" : sr?.current_lead_id}`,
    sr?.status === "dispatched" && sr?.current_lead_id === otherLead.id);

  const { data: tl, error } = await owner
    .from("inventory_movement_line_serials")
    .select("line:inventory_movement_lines!inner(movement:inventory_movements!inner(movement_no,movement_type,created_at,lead_id,reversed_by_id))")
    .eq("serial_id", sr?.id);
  const live = (tl ?? []).map((r) => r.line.movement).filter((m) => !m.reversed_by_id && m.movement_type !== "reversal")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const tail = live.slice(-3).map((m) => `${m.movement_type}@${m.lead_id === wonLead.id ? "A" : m.lead_id === otherLead.id ? "B" : "?"}`);
  record("Serial timeline: A dispatch → A return → B dispatch", "dispatch@A,return@A,dispatch@B", error?.message ?? tail.join(","),
    !error && tail.join(",") === "dispatch@A,return@A,dispatch@B" && live[0]?.movement_type === "inward");

  const lookup = await owner.rpc("inventory_customer_lookup", { p_query: null, p_lead_ids: [wonLead.id, otherLead.id], p_limit: 5 });
  if (lookup.error && /function|schema cache/i.test(lookup.error.message)) {
    record("Timeline customer names via lookup (052)", "2 names", "052 not applied", false, "BLOCKED");
  } else {
    record("Timeline customer names via lookup (052)", "2 names", lookup.error?.message ?? (lookup.data ?? []).map((c) => c.name).join(" / "),
      !lookup.error && lookup.data?.length === 2 && lookup.data.every((c) => c.name));
  }

  const { data: hist } = await owner
    .from("inventory_movement_lines")
    .select("created_at, movement:inventory_movements!inner(movement_no)")
    .eq("item_id", S)
    .order("created_at", { ascending: false })
    .limit(200);
  const nos = (hist ?? []).map((h) => h.movement.movement_no);
  const ordered = (hist ?? []).every((h, i, a) => i === 0 || a[i - 1].created_at >= h.created_at);
  record("Item history lists every movement, newest first", "includes 3 new, ordered", `${nos.length} lines, ordered=${ordered}`,
    ordered && posted.every((no) => nos.includes(no)) && nos.indexOf(posted[2]) < nos.indexOf(posted[0]));
}

async function cleanup(owner, moves, itemIds) {
  let ok = true;
  const msgs = [];
  for (const id of [...moves].reverse()) {
    const r = await owner.rpc("inventory_reverse_movement", { p_movement_id: id, p_reason: `${TAG} cleanup` });
    if (r.error) { ok = false; msgs.push(r.error.message); }
  }
  record("Reverse QA movements (return → dispatch → inward)", "all reversed", msgs.join(" | ") || "ok", ok);
  const { data } = await owner.from("inventory_stock_on_hand").select("item_id, on_hand").in("item_id", itemIds);
  const { data: serials } = await owner.from("inventory_serials").select("id").in("item_id", itemIds);
  record("After reversal: stock 0, QA serials freed", "0 / 0 serials", `${(data ?? []).map((r) => Number(r.on_hand)).join(",")} / ${serials?.length ?? "?"} serials`,
    (data ?? []).every((r) => Number(r.on_hand) === 0) && serials?.length === 0);
  await owner.from("inventory_items").update({ is_active: false }).in("id", itemIds);
}

run()
  .catch((err) => record("Harness", "runs", err.message, false, "BLOCKED"))
  .finally(() => {
    const count = (v) => results.filter((r) => r.verdict === v).length;
    console.log(`\nQA inventory — ${new URL(SUPABASE_URL).host.slice(0, 6)}*** — ${WRITE ? "read+write" : "read-only"} — ${TAG}`);
    console.log(`PASS ${count("PASS")}  FAIL ${count("FAIL")}  SKIP ${count("SKIP")}  BLOCKED ${count("BLOCKED")}\n`);
    results.forEach((r, i) => console.log(`${String(i + 1).padStart(2)} | ${r.verdict.padEnd(7)} | ${r.name} | expected: ${r.expected} | actual: ${r.actual}`));
    process.exitCode = count("FAIL") + count("BLOCKED") > 0 ? 1 : 0;
  });
