import { createClient } from "@/lib/supabase/server";
import { CUSTOMER_SALES_STAGES } from "@/lib/domain/workflow";
import { normalizeSerial } from "@/lib/inventory/serial-parse";
import type { InventoryMovement, InventoryMovementType, InventoryUnit, ReturnCondition } from "@/lib/inventory/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface InventoryCustomer {
  id: string;
  name: string;
  phone: string | null;
  city: string | null;
  address: string | null;
  meter_name: string | null;
  sales_stage: string;
}

export async function lookupCustomers(
  supabase: Supabase,
  opts: { query?: string; leadIds?: string[]; limit?: number }
): Promise<InventoryCustomer[]> {
  if (opts.leadIds && opts.leadIds.length === 0) return [];
  const { data, error } = await supabase.rpc("inventory_customer_lookup", {
    p_query: opts.query ?? null,
    p_lead_ids: opts.leadIds ?? null,
    p_limit: opts.limit ?? 20,
  });
  if (!error) return (data ?? []) as InventoryCustomer[];

  let fallback = supabase.from("leads").select("id,name,phone,city,address,sales_stage");
  if (opts.leadIds) {
    fallback = fallback.in("id", opts.leadIds);
  } else {
    fallback = fallback
      .in("sales_stage", [...CUSTOMER_SALES_STAGES])
      .order("updated_at", { ascending: false })
      .limit(opts.limit ?? 20);
    const q = opts.query?.trim().replace(/[%,()*]/g, "");
    if (q) fallback = fallback.or(`name.ilike.%${q}%,phone.ilike.%${q}%,city.ilike.%${q}%`);
  }
  const { data: rows } = await fallback;
  return ((rows ?? []) as Omit<InventoryCustomer, "meter_name">[]).map((r) => ({
    ...r,
    meter_name: null,
  }));
}

export async function getCustomerById(leadId: string): Promise<InventoryCustomer | null> {
  const supabase = await createClient();
  const [row] = await lookupCustomers(supabase, { leadIds: [leadId] });
  return row ?? null;
}

export type MovementMatchReason = "movement_no" | "serial" | "item_spec" | "party" | "customer";

export interface MovementListRow {
  id: string;
  movement_no: string;
  movement_type: InventoryMovementType;
  movement_date: string;
  created_at: string;
  is_opening_stock: boolean;
  lead_id: string | null;
  party_id: string | null;
  customer_name: string | null;
  party_name: string | null;
  supplier_name: string | null;
  reversed: boolean;
  line_count: number;
  serial_count: number;
  match_reason?: MovementMatchReason | null;
}

export const MOVEMENT_PAGE_SIZE = 50;

function searchToken(raw: string): string {
  return raw.trim().replace(/[%_\\]/g, "").slice(0, 80);
}

/** Movement ids whose lines include this panel or inverter serial. */
async function movementIdsForSerial(supabase: Supabase, raw: string): Promise<Set<string>> {
  const serial = normalizeSerial(raw);
  if (!serial || serial.length < 4) return new Set();
  const [{ data: byNo }, { data: byRaw }] = await Promise.all([
    supabase.from("inventory_serials").select("id").ilike("serial_no", `%${serial}%`).limit(40),
    supabase.from("inventory_serials").select("id").ilike("raw_scan", `%${serial}%`).limit(20),
  ]);
  const serials = [...(byNo ?? []), ...(byRaw ?? [])];
  const serialIds = (serials ?? []).map((row) => row.id as string);
  if (serialIds.length === 0) return new Set();
  const { data: links } = await supabase
    .from("inventory_movement_line_serials")
    .select("line:inventory_movement_lines!inner(movement_id)")
    .in("serial_id", serialIds)
    .limit(200);
  const ids = new Set<string>();
  for (const link of (links ?? []) as unknown as { line: { movement_id: string } | { movement_id: string }[] | null }[]) {
    const line = Array.isArray(link.line) ? link.line[0] : link.line;
    if (line?.movement_id) ids.add(line.movement_id);
  }
  return ids;
}

export async function getMovementList(opts: {
  type?: InventoryMovementType;
  q?: string;
  page?: number;
}): Promise<{ rows: MovementListRow[]; hasMore: boolean }> {
  const supabase = await createClient();
  const page = Math.max(1, opts.page ?? 1);
  const from = (page - 1) * MOVEMENT_PAGE_SIZE;
  const q = opts.q?.trim().slice(0, 80) ?? "";

  if (q) {
    const token = searchToken(q);
    const [rpcResult, customers, parties, serialMovementIds] = await Promise.all([
      supabase.rpc("inventory_search_movements", {
        p_query: q,
        p_type: opts.type ?? null,
        p_limit: 100,
        p_offset: 0,
      }),
      lookupCustomers(supabase, { query: token || q, limit: 50 }),
      supabase.rpc("inventory_party_lookup", { p_query: token || q, p_limit: 50 }),
      movementIdsForSerial(supabase, q),
    ]);
    const { data, error } = rpcResult;
    type RpcRow = {
      id: string;
      movement_no: string;
      movement_type: InventoryMovementType;
      movement_date: string;
      created_at: string;
      is_opening_stock: boolean;
      lead_id: string | null;
      party_id: string | null;
      customer_name: string | null;
      party_name: string | null;
      supplier_name: string | null;
      reversed: boolean;
      line_count: number | string;
      serial_count: number | string;
      match_reason: MovementMatchReason | null;
    };
    const rpcRows = error ? [] : ((data ?? []) as RpcRow[]);
    const leadIds = new Set(customers.map((c) => c.id));
    const customerName = new Map(customers.map((c) => [c.id, c.name]));
    const partyRows = (parties.error ? [] : parties.data ?? []) as { id: string; name: string }[];
    const partyIds = new Set(partyRows.map((p) => p.id));
    const partyName = new Map(partyRows.map((p) => [p.id, p.name]));
    const known = new Set(rpcRows.map((r) => r.id));
    const extraIdList = [...serialMovementIds].filter((id) => !known.has(id));
    if (error && token) {
      const { data: numbered } = await supabase
        .from("inventory_movements")
        .select("id")
        .ilike("movement_no", `%${token}%`)
        .limit(50);
      for (const row of numbered ?? []) {
        const id = row.id as string;
        if (!known.has(id) && !extraIdList.includes(id)) extraIdList.push(id);
      }
    }
    const orFilters = [
      leadIds.size ? `lead_id.in.(${[...leadIds].join(",")})` : "",
      partyIds.size ? `party_id.in.(${[...partyIds].join(",")})` : "",
      extraIdList.length ? `id.in.(${extraIdList.join(",")})` : "",
    ].filter(Boolean);

    let extra: RpcRow[] = [];
    if (orFilters.length) {
      let extraQuery = supabase
        .from("inventory_movements")
        .select(
          "id,movement_no,movement_type,movement_date,created_at,is_opening_stock,lead_id,party_id,supplier_name,reversed_by_id," +
            "lines:inventory_movement_lines(id,serials:inventory_movement_line_serials(serial_id))"
        )
        .or(orFilters.join(","))
        .order("movement_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);
      if (opts.type) extraQuery = extraQuery.eq("movement_type", opts.type);
      const { data: extraData } = await extraQuery;
      type ExtraRow = {
        id: string;
        movement_no: string;
        movement_type: InventoryMovementType;
        movement_date: string;
        created_at: string;
        is_opening_stock: boolean;
        lead_id: string | null;
        party_id: string | null;
        supplier_name: string | null;
        reversed_by_id: string | null;
        lines: { id: string; serials: { serial_id: string }[] }[];
      };
      extra = ((extraData ?? []) as unknown as ExtraRow[])
        .filter((row) => !known.has(row.id))
        .map((row) => ({
          id: row.id,
          movement_no: row.movement_no,
          movement_type: row.movement_type,
          movement_date: row.movement_date,
          created_at: row.created_at,
          is_opening_stock: row.is_opening_stock,
          lead_id: row.lead_id,
          party_id: row.party_id,
          customer_name: row.lead_id ? customerName.get(row.lead_id) ?? null : null,
          party_name: row.party_id ? partyName.get(row.party_id) ?? null : null,
          supplier_name: row.supplier_name,
          reversed: Boolean(row.reversed_by_id),
          line_count: row.lines.length,
          serial_count: row.lines.reduce((n, line) => n + line.serials.length, 0),
          match_reason: null,
        }));
    }

    const merged = [...rpcRows, ...extra]
      .map((row) => {
        let match_reason = row.match_reason;
        if (serialMovementIds.has(row.id)) match_reason = "serial";
        else if (row.lead_id && leadIds.has(row.lead_id)) match_reason = "customer";
        else if (row.party_id && partyIds.has(row.party_id)) match_reason = "party";
        return { ...row, match_reason };
      })
      .sort((a, b) => b.movement_date.localeCompare(a.movement_date) || b.created_at.localeCompare(a.created_at));
    const pageRows = merged.slice(from, from + MOVEMENT_PAGE_SIZE);
    return {
      hasMore: merged.length > from + MOVEMENT_PAGE_SIZE,
      rows: pageRows.map((r) => ({
        id: r.id,
        movement_no: r.movement_no,
        movement_type: r.movement_type,
        movement_date: r.movement_date,
        created_at: r.created_at,
        is_opening_stock: Boolean(r.is_opening_stock),
        lead_id: r.lead_id,
        party_id: r.party_id ?? null,
        customer_name: r.customer_name ?? (r.lead_id ? customerName.get(r.lead_id) ?? null : null),
        party_name: r.party_name ?? (r.party_id ? partyName.get(r.party_id) ?? null : null),
        supplier_name: r.supplier_name,
        reversed: Boolean(r.reversed),
        line_count: Number(r.line_count) || 0,
        serial_count: Number(r.serial_count) || 0,
        match_reason: r.match_reason,
      })),
    };
  }

  let query = supabase
    .from("inventory_movements")
    .select(
      "id,movement_no,movement_type,movement_date,created_at,is_opening_stock,lead_id,party_id,supplier_name,reversed_by_id," +
        "lines:inventory_movement_lines(id,serials:inventory_movement_line_serials(serial_id))"
    )
    .order("movement_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, from + MOVEMENT_PAGE_SIZE);
  if (opts.type) query = query.eq("movement_type", opts.type);
  if (q) query = query.ilike("movement_no", `%${q.replace(/[%_]/g, "")}%`);

  type Row = {
    id: string;
    movement_no: string;
    movement_type: InventoryMovementType;
    movement_date: string;
    created_at: string;
    is_opening_stock: boolean;
    lead_id: string | null;
    party_id: string | null;
    supplier_name: string | null;
    reversed_by_id: string | null;
    lines: { id: string; serials: { serial_id: string }[] }[];
  };
  const { data } = await query;
  const rows = (data ?? []) as unknown as Row[];
  const hasMore = rows.length > MOVEMENT_PAGE_SIZE;
  const pageRows = rows.slice(0, MOVEMENT_PAGE_SIZE);

  const leadIds = [...new Set(pageRows.map((r) => r.lead_id).filter((id): id is string => Boolean(id)))];
  const partyIds = [...new Set(pageRows.map((r) => r.party_id).filter((id): id is string => Boolean(id)))];
  const [customers, partiesRes] = await Promise.all([
    lookupCustomers(supabase, { leadIds }),
    partyIds.length
      ? supabase.from("inventory_parties").select("id,name").in("id", partyIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const nameBy = new Map(customers.map((c) => [c.id, c.name]));
  const partyBy = new Map((partiesRes.data ?? []).map((p) => [p.id as string, p.name as string]));

  return {
    hasMore,
    rows: pageRows.map((r) => ({
      id: r.id,
      movement_no: r.movement_no,
      movement_type: r.movement_type,
      movement_date: r.movement_date,
      created_at: r.created_at,
      is_opening_stock: r.is_opening_stock,
      lead_id: r.lead_id,
      party_id: r.party_id,
      customer_name: r.lead_id ? nameBy.get(r.lead_id) ?? null : null,
      party_name: r.party_id ? partyBy.get(r.party_id) ?? null : null,
      supplier_name: r.supplier_name,
      reversed: Boolean(r.reversed_by_id),
      line_count: r.lines.length,
      serial_count: r.lines.reduce((n, l) => n + l.serials.length, 0),
      match_reason: q ? ("movement_no" as const) : null,
    })),
  };
}

export interface CustomerMaterialItem {
  item_id: string;
  name: string;
  sku: string | null;
  unit_type: InventoryUnit;
  track_serials: boolean;
  serial_mode: "whole" | "extract";
  serial_pattern: string | null;
  category_name: string | null;
  master_group_name: string | null;
  dispatched: number;
  returned: number;
  used: number;
  last_movement_date: string | null;
}

export interface CustomerMaterial {
  items: CustomerMaterialItem[];
  serials: { serial_no: string; item_id: string; item_name: string }[];
  timeline: {
    id: string;
    movement_no: string;
    movement_type: InventoryMovementType;
    movement_date: string;
    created_at: string;
    reversed: boolean;
    line_count: number;
    serial_count: number;
    defective: boolean;
  }[];
}

export async function getCustomerMaterial(leadId: string): Promise<CustomerMaterial> {
  const supabase = await createClient();
  const [{ data: mat }, { data: serials }, { data: moves }, { data: cats }, { data: groups }] = await Promise.all([
    supabase
      .from("inventory_customer_material")
      .select("item_id,dispatched,returned,used,last_movement_date")
      .eq("lead_id", leadId),
    supabase
      .from("inventory_serials")
      .select("serial_no,item_id,item:inventory_items(name)")
      .eq("current_lead_id", leadId)
      .eq("status", "dispatched")
      .order("serial_no")
      .limit(2000),
    supabase
      .from("inventory_movements")
      .select(
        "id,movement_no,movement_type,movement_date,created_at,reversed_by_id," +
          "lines:inventory_movement_lines(id,return_condition,serials:inventory_movement_line_serials(serial_id))"
      )
      .eq("lead_id", leadId)
      .order("movement_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("quote_item_categories").select("id,name"),
    supabase.from("inventory_master_groups").select("id,name"),
  ]);

  const matRows = (mat ?? []) as { item_id: string; dispatched: number; returned: number; used: number; last_movement_date: string | null }[];
  const itemIds = matRows.map((r) => r.item_id);
  const { data: items } = itemIds.length
    ? await supabase
        .from("inventory_items")
        .select("id,name,sku,unit_type,track_serials,serial_mode,serial_pattern,category_id,master_group_id")
        .in("id", itemIds)
    : { data: [] };
  const itemBy = new Map((items ?? []).map((i) => [i.id as string, i]));
  const catName = new Map((cats ?? []).map((c) => [c.id as string, c.name as string]));
  const groupName = new Map((groups ?? []).map((g) => [g.id as string, g.name as string]));

  type MoveRow = {
    id: string;
    movement_no: string;
    movement_type: InventoryMovementType;
    movement_date: string;
    created_at: string;
    reversed_by_id: string | null;
    lines: { id: string; return_condition: ReturnCondition | null; serials: { serial_id: string }[] }[];
  };

  return {
    items: matRows
      .map((r) => {
        const i = itemBy.get(r.item_id);
        return {
          item_id: r.item_id,
          name: i?.name ?? "—",
          sku: i?.sku ?? null,
          unit_type: (i?.unit_type ?? "nos") as InventoryUnit,
          track_serials: Boolean(i?.track_serials),
          serial_mode: (i?.serial_mode ?? "whole") as "whole" | "extract",
          serial_pattern: i?.serial_pattern ?? null,
          category_name: i?.category_id ? catName.get(i.category_id) ?? null : null,
          master_group_name: i?.master_group_id ? groupName.get(i.master_group_id) ?? null : null,
          dispatched: Number(r.dispatched),
          returned: Number(r.returned),
          used: Number(r.used),
          last_movement_date: r.last_movement_date,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
    serials: ((serials ?? []) as unknown as { serial_no: string; item_id: string; item: { name: string } | null }[]).map((s) => ({
      serial_no: s.serial_no,
      item_id: s.item_id,
      item_name: s.item?.name ?? "—",
    })),
    timeline: ((moves ?? []) as unknown as MoveRow[]).map((m) => ({
      id: m.id,
      movement_no: m.movement_no,
      movement_type: m.movement_type,
      movement_date: m.movement_date,
      created_at: m.created_at,
      reversed: Boolean(m.reversed_by_id),
      line_count: m.lines.length,
      serial_count: m.lines.reduce((n, l) => n + l.serials.length, 0),
      defective: m.lines.some((l) => l.return_condition === "defective"),
    })),
  };
}

export async function getPartyMaterial(partyId: string): Promise<CustomerMaterial> {
  const supabase = await createClient();
  const [{ data: mat }, { data: serials }, { data: moves }, { data: cats }, { data: groups }] = await Promise.all([
    supabase
      .from("inventory_party_material")
      .select("item_id,dispatched,returned,used,last_movement_date")
      .eq("party_id", partyId),
    supabase
      .from("inventory_serials")
      .select("serial_no,item_id,item:inventory_items(name)")
      .eq("current_party_id", partyId)
      .eq("status", "dispatched")
      .order("serial_no")
      .limit(2000),
    supabase
      .from("inventory_movements")
      .select(
        "id,movement_no,movement_type,movement_date,created_at,reversed_by_id," +
          "lines:inventory_movement_lines(id,return_condition,serials:inventory_movement_line_serials(serial_id))"
      )
      .eq("party_id", partyId)
      .order("movement_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("quote_item_categories").select("id,name"),
    supabase.from("inventory_master_groups").select("id,name"),
  ]);

  const matRows = (mat ?? []) as {
    item_id: string;
    dispatched: number;
    returned: number;
    used: number;
    last_movement_date: string | null;
  }[];
  const itemIds = matRows.map((r) => r.item_id);
  const { data: items } = itemIds.length
    ? await supabase
        .from("inventory_items")
        .select("id,name,sku,unit_type,track_serials,serial_mode,serial_pattern,category_id,master_group_id")
        .in("id", itemIds)
    : { data: [] };
  const itemBy = new Map((items ?? []).map((i) => [i.id as string, i]));
  const catName = new Map((cats ?? []).map((c) => [c.id as string, c.name as string]));
  const groupName = new Map((groups ?? []).map((g) => [g.id as string, g.name as string]));

  type MoveRow = {
    id: string;
    movement_no: string;
    movement_type: InventoryMovementType;
    movement_date: string;
    created_at: string;
    reversed_by_id: string | null;
    lines: { id: string; return_condition: ReturnCondition | null; serials: { serial_id: string }[] }[];
  };

  return {
    items: matRows
      .map((r) => {
        const i = itemBy.get(r.item_id);
        return {
          item_id: r.item_id,
          name: i?.name ?? "—",
          sku: i?.sku ?? null,
          unit_type: (i?.unit_type ?? "nos") as InventoryUnit,
          track_serials: Boolean(i?.track_serials),
          serial_mode: (i?.serial_mode ?? "whole") as "whole" | "extract",
          serial_pattern: i?.serial_pattern ?? null,
          category_name: i?.category_id ? catName.get(i.category_id) ?? null : null,
          master_group_name: i?.master_group_id ? groupName.get(i.master_group_id) ?? null : null,
          dispatched: Number(r.dispatched),
          returned: Number(r.returned),
          used: Number(r.used),
          last_movement_date: r.last_movement_date,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
    serials: ((serials ?? []) as unknown as { serial_no: string; item_id: string; item: { name: string } | null }[]).map(
      (s) => ({
        serial_no: s.serial_no,
        item_id: s.item_id,
        item_name: s.item?.name ?? "—",
      })
    ),
    timeline: ((moves ?? []) as unknown as MoveRow[]).map((m) => ({
      id: m.id,
      movement_no: m.movement_no,
      movement_type: m.movement_type,
      movement_date: m.movement_date,
      created_at: m.created_at,
      reversed: Boolean(m.reversed_by_id),
      line_count: m.lines.length,
      serial_count: m.lines.reduce((n, l) => n + l.serials.length, 0),
      defective: m.lines.some((l) => l.return_condition === "defective"),
    })),
  };
}

export interface MovementLineDetail {
  id: string;
  item_id: string;
  item_name: string;
  sku: string | null;
  hsn: string | null;
  unit_type: InventoryUnit;
  track_serials: boolean;
  quantity_delta: number;
  return_condition: ReturnCondition | null;
  serial_action: string | null;
  notes: string | null;
  serials: string[];
}

export interface MovementDetail extends InventoryMovement {
  by_name: string | null;
  reverses_no: string | null;
  reversed_by_no: string | null;
  customer: InventoryCustomer | null;
  party: {
    id: string;
    name: string;
    kind: string;
    phone: string | null;
    address: string | null;
    city: string | null;
    gstin: string | null;
  } | null;
  lines: MovementLineDetail[];
}

function hsnFrom(specs: unknown): string | null {
  if (!specs || typeof specs !== "object") return null;
  const rec = specs as Record<string, unknown>;
  const v = rec.hsn ?? rec.HSN ?? rec.hsn_code;
  return typeof v === "string" || typeof v === "number" ? String(v) : null;
}

export async function getMovementDetail(id: string): Promise<MovementDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("inventory_movements")
    .select(
      "*,by:profiles!inventory_movements_created_by_fkey(name)," +
        "lines:inventory_movement_lines(id,item_id,quantity_delta,return_condition,serial_action,notes,created_at," +
        "item:inventory_items(name,sku,unit_type,track_serials,specifications)," +
        "serials:inventory_movement_line_serials(serial:inventory_serials(serial_no)))"
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;

  type Line = {
    id: string;
    item_id: string;
    quantity_delta: number;
    return_condition: ReturnCondition | null;
    serial_action: string | null;
    notes: string | null;
    created_at: string;
    item: { name: string; sku: string | null; unit_type: InventoryUnit; track_serials: boolean; specifications: unknown } | null;
    serials: { serial: { serial_no: string } | null }[];
  };
  const row = data as unknown as InventoryMovement & { by: { name: string } | null; lines: Line[] };
  const linkedIds = [row.reverses_id, row.reversed_by_id].filter((v): v is string => Boolean(v));

  const [customers, partyRes, linked] = await Promise.all([
    row.lead_id ? lookupCustomers(supabase, { leadIds: [row.lead_id] }) : Promise.resolve([]),
    row.party_id
      ? supabase
          .from("inventory_parties")
          .select("id,name,kind,phone,address,city,gstin")
          .eq("id", row.party_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    linkedIds.length
      ? supabase.from("inventory_movements").select("id,movement_no").in("id", linkedIds)
      : Promise.resolve({ data: [] as { id: string; movement_no: string }[] }),
  ]);
  const noById = new Map((linked.data ?? []).map((r) => [r.id as string, r.movement_no as string]));
  const { by, lines, ...movement } = row;
  const party = partyRes.data;

  return {
    ...movement,
    by_name: by?.name ?? null,
    reverses_no: row.reverses_id ? noById.get(row.reverses_id) ?? null : null,
    reversed_by_no: row.reversed_by_id ? noById.get(row.reversed_by_id) ?? null : null,
    customer: customers[0] ?? null,
    party: party
      ? {
          id: party.id as string,
          name: party.name as string,
          kind: party.kind as string,
          phone: (party.phone as string | null) ?? null,
          address: (party.address as string | null) ?? null,
          city: (party.city as string | null) ?? null,
          gstin: (party.gstin as string | null) ?? null,
        }
      : null,
    lines: [...lines]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((l) => ({
        id: l.id,
        item_id: l.item_id,
        item_name: l.item?.name ?? "—",
        sku: l.item?.sku ?? null,
        hsn: hsnFrom(l.item?.specifications),
        unit_type: l.item?.unit_type ?? "nos",
        track_serials: Boolean(l.item?.track_serials),
        quantity_delta: Number(l.quantity_delta),
        return_condition: l.return_condition,
        serial_action: l.serial_action,
        notes: l.notes,
        serials: l.serials
          .map((s) => s.serial?.serial_no)
          .filter((s): s is string => Boolean(s))
          .sort(),
      })),
  };
}
