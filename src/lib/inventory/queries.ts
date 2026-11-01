import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { canManagePurchaseCost, canViewPurchaseCost, getSession } from "@/lib/auth";
import type { AuthorityKey } from "@/lib/domain/authorities";
import type {
  InventoryItem,
  InventoryMovementType,
  SerialStatus,
  StockOnHandRow,
  StockValueRow,
} from "@/lib/inventory/types";
import { lookupCustomers } from "@/lib/inventory/movements";

/** Customer names via the inventory lookup (leads RLS hides them from inventory-only users). */
export async function customerNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  leadIds: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const ids = [...new Set(leadIds.filter((id): id is string => Boolean(id)))];
  const customers = await lookupCustomers(supabase, { leadIds: ids });
  return new Map(customers.map((c) => [c.id, c.name]));
}

export interface InventoryAccess {
  canView: boolean;
  canManageItems: boolean;
  canInward: boolean;
  canDispatch: boolean;
  canReturn: boolean;
  canAdjust: boolean;
  canViewCost: boolean;
  canManageCost: boolean;
}

export const getInventoryAccess = cache(async () => {
  const session = await getSession();
  if (!session) return null;
  const has = (key: AuthorityKey) => session.authorities.has("full_access") || session.authorities.has(key);
  const [canViewCost, canManageCost] = await Promise.all([canViewPurchaseCost(), canManagePurchaseCost()]);
  const access: InventoryAccess = {
    canView: has("view_inventory") || has("manage_inventory_items"),
    canManageItems: has("manage_inventory_items"),
    canInward: has("inventory_inward"),
    canDispatch: has("inventory_dispatch"),
    canReturn: has("inventory_return"),
    canAdjust: has("inventory_adjust"),
    canViewCost,
    canManageCost,
  };
  return { profile: session.profile, access };
});

export interface NamedRef {
  id: string;
  name: string;
}

export interface CategoryRef extends NamedRef {
  master_group_id: string | null;
}

export interface SubcategoryRef extends NamedRef {
  category_id: string;
}

export interface StockListRow extends StockOnHandRow {
  master_group_name: string | null;
  category_name: string | null;
  subcategory_name: string | null;
  brand_name: string | null;
  stock_value: number | null;
  missing_cost_count: number;
}

export async function getStockList(withValue: boolean): Promise<StockListRow[]> {
  const supabase = await createClient();
  const [{ data: stock }, { data: cats }, { data: brands }, { data: groups }, { data: subs }, values] =
    await Promise.all([
      supabase.from("inventory_stock_on_hand").select("*").order("name"),
      supabase.from("quote_item_categories").select("id,name"),
      supabase.from("quote_brands").select("id,name"),
      supabase.from("inventory_master_groups").select("id,name"),
      supabase.from("inventory_subcategories").select("id,name"),
      withValue
        ? supabase.from("inventory_stock_value").select("item_id,stock_value,missing_cost_count")
        : Promise.resolve({ data: [] as Pick<StockValueRow, "item_id" | "stock_value" | "missing_cost_count">[] }),
    ]);
  const catName = new Map((cats ?? []).map((c) => [c.id as string, c.name as string]));
  const brandName = new Map((brands ?? []).map((b) => [b.id as string, b.name as string]));
  const groupName = new Map((groups ?? []).map((g) => [g.id as string, g.name as string]));
  const subName = new Map((subs ?? []).map((s) => [s.id as string, s.name as string]));
  const valueBy = new Map((values.data ?? []).map((v) => [v.item_id, v]));

  return ((stock ?? []) as StockOnHandRow[]).map((row) => {
    const v = valueBy.get(row.item_id);
    return {
      ...row,
      on_hand: Number(row.on_hand),
      low_stock_threshold: Number(row.low_stock_threshold),
      master_group_name: row.master_group_id ? groupName.get(row.master_group_id) ?? null : null,
      category_name: row.category_id ? catName.get(row.category_id) ?? null : null,
      subcategory_name: row.subcategory_id ? subName.get(row.subcategory_id) ?? null : null,
      brand_name: row.brand_id ? brandName.get(row.brand_id) ?? null : null,
      stock_value: v?.stock_value == null ? null : Number(v.stock_value),
      missing_cost_count: Number(v?.missing_cost_count ?? 0),
    };
  });
}

export async function getInventoryLookups(): Promise<{
  masterGroups: NamedRef[];
  categories: CategoryRef[];
  subcategories: SubcategoryRef[];
  brands: NamedRef[];
}> {
  const supabase = await createClient();
  const [{ data: masterGroups }, { data: categories }, { data: subcategories }, { data: brands }] =
    await Promise.all([
      supabase.from("inventory_master_groups").select("id,name").order("sort_order").order("name"),
      supabase.from("quote_item_categories").select("id,name,master_group_id").order("sort_order").order("name"),
      supabase.from("inventory_subcategories").select("id,name,category_id").order("sort_order").order("name"),
      supabase.from("quote_brands").select("id,name").order("name"),
    ]);
  return {
    masterGroups: (masterGroups ?? []) as NamedRef[],
    categories: (categories ?? []).map((c) => ({
      id: c.id as string,
      name: c.name as string,
      master_group_id: (c.master_group_id as string | null) ?? null,
    })),
    subcategories: (subcategories ?? []).map((s) => ({
      id: s.id as string,
      name: s.name as string,
      category_id: s.category_id as string,
    })),
    brands: (brands ?? []) as NamedRef[],
  };
}

export async function getInventoryItem(id: string): Promise<InventoryItem | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("inventory_items").select("*").eq("id", id).maybeSingle();
  return (data as InventoryItem | null) ?? null;
}

export async function itemHasMovements(id: string): Promise<boolean> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("inventory_movement_lines")
    .select("id", { count: "exact", head: true })
    .eq("item_id", id);
  return (count ?? 0) > 0;
}

/** True when the item still has live (non-reversed) stock movements or any serial rows — delete is blocked. */
export async function itemHasLiveStockTrail(id: string): Promise<boolean> {
  const supabase = await createClient();
  const [{ count: serialCount }, { data: lines }] = await Promise.all([
    supabase.from("inventory_serials").select("id", { count: "exact", head: true }).eq("item_id", id),
    supabase
      .from("inventory_movement_lines")
      .select("id,movement:inventory_movements!inner(reversed_by_id,movement_type)")
      .eq("item_id", id),
  ]);
  if ((serialCount ?? 0) > 0) return true;
  return (lines ?? []).some((l) => {
    const raw = l.movement as
      | { reversed_by_id: string | null; movement_type: string }
      | { reversed_by_id: string | null; movement_type: string }[]
      | null;
    const m = Array.isArray(raw) ? raw[0] : raw;
    return Boolean(m && m.reversed_by_id == null && m.movement_type !== "reversal");
  });
}

export interface ItemCostDefaults {
  default_unit_cost: number | null;
  gst_percent: number | null;
}

export async function getItemDefaultCost(id: string): Promise<ItemCostDefaults> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("inventory_item_costs")
    .select("default_unit_cost,gst_percent")
    .eq("item_id", id)
    .maybeSingle();
  return {
    default_unit_cost: data?.default_unit_cost == null ? null : Number(data.default_unit_cost),
    gst_percent: data?.gst_percent == null ? null : Number(data.gst_percent),
  };
}

/** Call only when the user may view purchase cost; RLS returns nothing otherwise. */
export async function getInwardLineCosts(lineIds: string[]): Promise<Map<string, { unit_cost: number; gst_percent: number | null }>> {
  if (lineIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.from("inventory_inward_costs").select("line_id,unit_cost,gst_percent").in("line_id", lineIds);
  return new Map(
    (data ?? []).map((c) => [c.line_id as string, { unit_cost: Number(c.unit_cost), gst_percent: c.gst_percent == null ? null : Number(c.gst_percent) }])
  );
}

export interface PickerItem {
  id: string;
  name: string;
  sku: string | null;
  unit_type: InventoryItem["unit_type"];
  track_serials: boolean;
  serial_mode: InventoryItem["serial_mode"];
  serial_pattern: string | null;
  on_hand: number;
  category_name: string | null;
  /** Present when RLS allows cost read; used to prefill inward GST / cost. */
  default_unit_cost?: number | null;
  default_gst_percent?: number | null;
}

export async function getPickerItems(): Promise<PickerItem[]> {
  const supabase = await createClient();
  const [{ data: items }, { data: stock }, { data: cats }, { data: costs }] = await Promise.all([
    supabase
      .from("inventory_items")
      .select("id,name,sku,unit_type,track_serials,serial_mode,serial_pattern,category_id")
      .eq("is_active", true)
      .order("name"),
    supabase.from("inventory_stock_on_hand").select("item_id,on_hand"),
    supabase.from("quote_item_categories").select("id,name"),
    supabase.from("inventory_item_costs").select("item_id,default_unit_cost,gst_percent"),
  ]);
  const onHand = new Map((stock ?? []).map((s) => [s.item_id as string, Number(s.on_hand)]));
  const catName = new Map((cats ?? []).map((c) => [c.id as string, c.name as string]));
  const costByItem = new Map(
    (costs ?? []).map((c) => [
      c.item_id as string,
      {
        default_unit_cost: c.default_unit_cost == null ? null : Number(c.default_unit_cost),
        default_gst_percent: c.gst_percent == null ? null : Number(c.gst_percent),
      },
    ])
  );
  return (items ?? []).map((i) => {
    const cost = costByItem.get(i.id);
    return {
      id: i.id,
      name: i.name,
      sku: i.sku,
      unit_type: i.unit_type,
      track_serials: i.track_serials,
      serial_mode: i.serial_mode,
      serial_pattern: i.serial_pattern,
      on_hand: onHand.get(i.id) ?? 0,
      category_name: i.category_id ? catName.get(i.category_id) ?? null : null,
      default_unit_cost: cost?.default_unit_cost ?? null,
      default_gst_percent: cost?.default_gst_percent ?? null,
    };
  });
}

export interface ItemSerialRow {
  id: string;
  serial_no: string;
  status: SerialStatus;
  current_lead_id: string | null;
  lead_name: string | null;
  created_at: string;
}

export async function getItemSerials(itemId: string): Promise<ItemSerialRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("inventory_serials")
    .select("id,serial_no,status,current_lead_id,created_at")
    .eq("item_id", itemId)
    .order("serial_no")
    .limit(2000);
  const rows = data ?? [];
  const names = await customerNames(supabase, rows.map((s) => s.current_lead_id));
  return rows.map((s) => ({
    id: s.id,
    serial_no: s.serial_no,
    status: s.status,
    current_lead_id: s.current_lead_id,
    created_at: s.created_at,
    lead_name: s.current_lead_id ? names.get(s.current_lead_id) ?? null : null,
  }));
}

export interface ItemHistoryRow {
  line_id: string;
  movement_id: string;
  movement_no: string;
  movement_type: InventoryMovementType;
  movement_date: string;
  created_at: string;
  quantity_delta: number;
  return_condition: string | null;
  lead_id: string | null;
  lead_name: string | null;
  supplier_name: string | null;
  is_opening_stock: boolean;
  reversed: boolean;
  by_name: string | null;
  serials: string[];
}

export async function getItemHistory(itemId: string): Promise<ItemHistoryRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("inventory_movement_lines")
    .select(
      "id,quantity_delta,return_condition,created_at," +
        "movement:inventory_movements!inner(id,movement_no,movement_type,movement_date,created_at,lead_id,supplier_name,is_opening_stock,reversed_by_id,by:profiles!inventory_movements_created_by_fkey(name))," +
        "serials:inventory_movement_line_serials(serial:inventory_serials(serial_no))"
    )
    .eq("item_id", itemId)
    .order("created_at", { ascending: false })
    .limit(300);

  type Row = {
    id: string;
    quantity_delta: number;
    return_condition: string | null;
    created_at: string;
    movement: {
      id: string;
      movement_no: string;
      movement_type: InventoryMovementType;
      movement_date: string;
      created_at: string;
      lead_id: string | null;
      supplier_name: string | null;
      is_opening_stock: boolean;
      reversed_by_id: string | null;
      by: { name: string } | null;
    };
    serials: { serial: { serial_no: string } | null }[];
  };

  const rows = (data ?? []) as unknown as Row[];
  const names = await customerNames(supabase, rows.map((r) => r.movement.lead_id));
  return rows.map((r) => ({
    line_id: r.id,
    movement_id: r.movement.id,
    movement_no: r.movement.movement_no,
    movement_type: r.movement.movement_type,
    movement_date: r.movement.movement_date,
    created_at: r.movement.created_at,
    quantity_delta: Number(r.quantity_delta),
    return_condition: r.return_condition,
    lead_id: r.movement.lead_id,
    lead_name: r.movement.lead_id ? names.get(r.movement.lead_id) ?? null : null,
    supplier_name: r.movement.supplier_name,
    is_opening_stock: r.movement.is_opening_stock,
    reversed: Boolean(r.movement.reversed_by_id),
    by_name: r.movement.by?.name ?? null,
    serials: r.serials.map((s) => s.serial?.serial_no).filter((s): s is string => Boolean(s)),
  }));
}
