"use server";

import type { ZodType } from "zod";
import { createClient } from "@/lib/supabase/server";
import { canManagePurchaseCost, hasAuthority, requireAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { errorMessage, type ActionResult } from "@/lib/action-result";
import { revalidateInventory } from "@/lib/cache-tags";
import {
  adjustmentSchema,
  checkSerialsSchema,
  dispatchSchema,
  inventoryBrandCreateSchema,
  inventoryCategoryCreateSchema,
  inventoryPartyCreateSchema,
  inventoryPartyUpdateSchema,
  inventoryItemSchema,
  inventoryMasterNameSchema,
  inventorySubcategoryCreateSchema,
  inwardSchema,
  openingImportSchema,
  returnSchema,
  reverseSchema,
} from "@/lib/inventory/schemas";
import type {
  OpeningImportResult,
  PostedMovement,
  SerialCheckResult,
  InventoryParty,
  InventoryPartyKind,
} from "@/lib/inventory/types";
import {
  getCustomerMaterial,
  getPartyMaterial,
  lookupCustomers,
  type CustomerMaterial,
  type InventoryCustomer,
} from "@/lib/inventory/movements";
import { getInventoryAccess } from "@/lib/inventory/queries";
import { composeInventoryItemName } from "@/lib/inventory/format";
import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveComposedItemName(
  supabase: SupabaseClient,
  companyId: string,
  data: {
    master_group_id: string;
    category_id: string;
    subcategory_id: string;
    brand_id?: string | null;
    sku?: string | null;
  }
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const [{ data: mg }, { data: cat }, { data: sub }, brandRes] = await Promise.all([
    supabase.from("inventory_master_groups").select("name").eq("id", data.master_group_id).eq("company_id", companyId).maybeSingle(),
    supabase.from("quote_item_categories").select("name").eq("id", data.category_id).eq("company_id", companyId).maybeSingle(),
    supabase.from("inventory_subcategories").select("name").eq("id", data.subcategory_id).eq("company_id", companyId).maybeSingle(),
    data.brand_id
      ? supabase.from("quote_brands").select("name").eq("id", data.brand_id).eq("company_id", companyId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!mg?.name) return { ok: false, error: "Master group not found." };
  if (!cat?.name) return { ok: false, error: "Category not found." };
  if (!sub?.name) return { ok: false, error: "Sub-category not found." };
  const name = composeInventoryItemName({
    masterGroup: mg.name,
    category: cat.name,
    subcategory: sub.name,
    brand: brandRes.data?.name ?? null,
    sku: data.sku,
  });
  if (!name) return { ok: false, error: "Could not build the item name from the hierarchy." };
  if (name.length > 200) return { ok: false, error: "The composed item name is too long — shorten Group or SKU." };
  return { ok: true, name };
}

type DbError = { message?: string; code?: string; details?: string } | null;

function inventoryDbError(error: DbError, fallback: string): string {
  if (!error) return fallback;
  if (error.code === "23505") {
    if (/inventory_items_company_name(_sub)?_uq/.test(error.message ?? "")) {
      return "An item with this name already exists in this sub-category.";
    }
    if (/inventory_items_company_sku_uq/.test(error.message ?? "")) return "An item with this SKU already exists.";
    if (/inventory_serials/.test(error.message ?? "")) return "One of these serial numbers is already in inventory.";
  }
  if (error.code === "42501" && /row-level security/i.test(error.message ?? "")) {
    return "You do not have permission for this.";
  }
  return error.message || fallback;
}

function parseInput<T>(schema: ZodType<T>, input: unknown): { ok: true; data: T } | { ok: false; error: string } {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
}

function lineItemIds(lines: { item_id?: string }[]): string[] {
  return [...new Set(lines.map((l) => l.item_id).filter((id): id is string => Boolean(id)))];
}

async function callMovementRpc(
  fn: string,
  payload: unknown,
  fallback: string
): Promise<ActionResult<{ movement: PostedMovement }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, { payload });
  if (error) return { ok: false, error: inventoryDbError(error, fallback) };
  return { ok: true, movement: data as PostedMovement };
}

// ------------------------------------------------------------
// Item master
// ------------------------------------------------------------

export async function createInventoryItem(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const profile = await requireAuth();
    if (!(await hasAuthority(profile.id, "manage_inventory_items"))) {
      return { ok: false, error: "You do not have permission to manage inventory items." };
    }
    const parsed = parseInput(inventoryItemSchema, input);
    if (!parsed.ok) return parsed;

    const supabase = await createClient();
    const composed = await resolveComposedItemName(supabase, profile.company_id, parsed.data);
    if (!composed.ok) return composed;
    const { name: _ignored, ...rest } = parsed.data;
    const row = { ...rest, name: composed.name, company_id: profile.company_id, created_by: profile.id };

    const { data, error } = await supabase.from("inventory_items").insert(row).select("id").single();
    if (error) return { ok: false, error: inventoryDbError(error, "Could not create the item.") };

    await logAuditEvent({
      companyId: profile.company_id,
      actorId: profile.id,
      eventType: "inventory_item_created",
      entityType: "inventory_item",
      entityId: data.id,
      metadata: { name: composed.name },
    });
    revalidateInventory();
    return { ok: true, id: data.id as string };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Could not create the item.") };
  }
}

export async function updateInventoryItem(itemId: string, input: unknown): Promise<ActionResult<Record<never, never>>> {
  try {
    const profile = await requireAuth();
    if (!(await hasAuthority(profile.id, "manage_inventory_items"))) {
      return { ok: false, error: "You do not have permission to manage inventory items." };
    }
    const parsed = parseInput(inventoryItemSchema, input);
    if (!parsed.ok) return parsed;

    const supabase = await createClient();
    const composed = await resolveComposedItemName(supabase, profile.company_id, parsed.data);
    if (!composed.ok) return composed;
    const { name: _ignored, ...rest } = parsed.data;

    const { error } = await supabase
      .from("inventory_items")
      .update({ ...rest, name: composed.name, updated_at: new Date().toISOString() })
      .eq("id", itemId)
      .eq("company_id", profile.company_id);
    if (error) return { ok: false, error: inventoryDbError(error, "Could not update the item.") };

    await logAuditEvent({
      companyId: profile.company_id,
      actorId: profile.id,
      eventType: "inventory_item_updated",
      entityType: "inventory_item",
      entityId: itemId,
      metadata: { name: composed.name },
    });
    revalidateInventory({ itemIds: [itemId] });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Could not update the item.") };
  }
}

type MasterCreated = { id: string; name: string; master_group_id?: string | null; category_id?: string };

async function callCreateMasterRpc(
  fn: string,
  args: Record<string, unknown>,
  fallback: string
): Promise<ActionResult<MasterCreated>> {
  try {
    const profile = await requireAuth();
    if (
      !(await hasAuthority(profile.id, "manage_inventory_items")) &&
      !(await hasAuthority(profile.id, "manage_catalog_items"))
    ) {
      return { ok: false, error: "You do not have permission to manage inventory masters." };
    }
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(fn, args);
    if (error) return { ok: false, error: inventoryDbError(error, fallback) };
    const row =
      typeof data === "string"
        ? (JSON.parse(data) as MasterCreated)
        : (data as MasterCreated | null);
    if (!row?.id || !row?.name) {
      return { ok: false, error: `${fallback} (empty response). Apply migration 024 if this keeps happening.` };
    }
    revalidateInventory();
    return {
      ok: true,
      id: row.id,
      name: row.name,
      master_group_id: row.master_group_id ?? null,
      category_id: row.category_id,
    };
  } catch (err) {
    return { ok: false, error: errorMessage(err, fallback) };
  }
}

export async function createInventoryMasterGroup(input: unknown): Promise<ActionResult<MasterCreated>> {
  const parsed = parseInput(inventoryMasterNameSchema, input);
  if (!parsed.ok) return parsed;
  return callCreateMasterRpc("inventory_create_master_group", { p_name: parsed.data.name }, "Could not create master group.");
}

export async function createInventoryCategory(input: unknown): Promise<ActionResult<MasterCreated>> {
  const parsed = parseInput(inventoryCategoryCreateSchema, input);
  if (!parsed.ok) return parsed;
  return callCreateMasterRpc(
    "inventory_create_category",
    { p_name: parsed.data.name, p_master_group_id: parsed.data.master_group_id ?? null },
    "Could not create category."
  );
}

export async function createInventorySubcategory(input: unknown): Promise<ActionResult<MasterCreated>> {
  const parsed = parseInput(inventorySubcategoryCreateSchema, input);
  if (!parsed.ok) return parsed;
  return callCreateMasterRpc(
    "inventory_create_subcategory",
    { p_category_id: parsed.data.category_id, p_name: parsed.data.name },
    "Could not create sub-category."
  );
}

export async function createInventoryBrand(input: unknown): Promise<ActionResult<MasterCreated>> {
  const parsed = parseInput(inventoryBrandCreateSchema, input);
  if (!parsed.ok) return parsed;
  return callCreateMasterRpc("inventory_create_brand", { p_name: parsed.data.name }, "Could not create group.");
}

export async function deleteInventoryItem(
  itemId: string
): Promise<ActionResult<Record<never, never>> | { ok: false; error: string; hasHistory: true }> {
  try {
    const profile = await requireAuth();
    if (!UUID_RE.test(itemId)) return { ok: false, error: "Item not found." };
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("inventory_delete_item", { p_item_id: itemId });
    if (error) {
      const msg = error.message ?? "";
      if (msg.startsWith("ITEM_HAS_HISTORY: ")) {
        return { ok: false, hasHistory: true, error: msg.slice("ITEM_HAS_HISTORY: ".length) };
      }
      if (error.code === "PGRST202") return { ok: false, error: "Deleting items needs database update 018_inventory_delete_item.sql." };
      return { ok: false, error: inventoryDbError(error, "Could not delete the item.") };
    }

    await logAuditEvent({
      companyId: profile.company_id,
      actorId: profile.id,
      eventType: "inventory_item_deleted",
      entityType: "inventory_item",
      entityId: itemId,
      metadata: { name: data as string },
    });
    revalidateInventory({ itemIds: [itemId] });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Could not delete the item.") };
  }
}

export async function setInventoryItemActive(itemId: string, active: boolean): Promise<ActionResult<Record<never, never>>> {
  try {
    const profile = await requireAuth();
    if (!(await hasAuthority(profile.id, "manage_inventory_items"))) {
      return { ok: false, error: "You do not have permission to manage inventory items." };
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("inventory_items")
      .update({ is_active: active, updated_at: new Date().toISOString() })
      .eq("id", itemId)
      .eq("company_id", profile.company_id)
      .select("name")
      .maybeSingle();
    if (error) return { ok: false, error: inventoryDbError(error, "Could not update the item.") };
    if (!data) return { ok: false, error: "Item not found." };

    await logAuditEvent({
      companyId: profile.company_id,
      actorId: profile.id,
      eventType: active ? "inventory_item_activated" : "inventory_item_deactivated",
      entityType: "inventory_item",
      entityId: itemId,
      metadata: { name: data.name },
    });
    revalidateInventory({ itemIds: [itemId] });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Could not update the item.") };
  }
}

export async function setItemDefaultCost(
  itemId: string,
  cost: number | null,
  gstPercent: number | null = null
): Promise<ActionResult<Record<never, never>>> {
  try {
    const profile = await requireAuth();
    if (!(await canManagePurchaseCost())) {
      return { ok: false, error: "You do not have permission to set purchase cost." };
    }
    if (cost !== null && (!Number.isFinite(cost) || cost < 0)) {
      return { ok: false, error: "Cost cannot be negative." };
    }
    if (gstPercent !== null && (!Number.isFinite(gstPercent) || gstPercent < 0 || gstPercent > 100)) {
      return { ok: false, error: "GST % must be between 0 and 100." };
    }

    const supabase = await createClient();
    const { error } = await supabase.from("inventory_item_costs").upsert({
      item_id: itemId,
      company_id: profile.company_id,
      default_unit_cost: cost,
      gst_percent: gstPercent,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    });
    if (error) return { ok: false, error: inventoryDbError(error, "Could not save the cost.") };

    await logAuditEvent({
      companyId: profile.company_id,
      actorId: profile.id,
      eventType: "inventory_item_cost_set",
      entityType: "inventory_item",
      entityId: itemId,
      metadata: { gst_percent: gstPercent },
    });
    revalidateInventory({ itemIds: [itemId] });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Could not save the cost.") };
  }
}

// ------------------------------------------------------------
// Stock movements (atomic RPCs; permissions enforced in SQL)
// ------------------------------------------------------------

export async function postInward(input: unknown): Promise<ActionResult<{ movement: PostedMovement }>> {
  try {
    await requireAuth();
    const parsed = parseInput(inwardSchema, input);
    if (!parsed.ok) return parsed;
    const result = await callMovementRpc("inventory_post_inward", parsed.data, "Could not save the inward.");
    if (result.ok) revalidateInventory({ itemIds: lineItemIds(parsed.data.lines) });
    return result;
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Could not save the inward.") };
  }
}

export async function postDispatch(input: unknown): Promise<ActionResult<{ movement: PostedMovement }>> {
  try {
    await requireAuth();
    const parsed = parseInput(dispatchSchema, input);
    if (!parsed.ok) return parsed;
    const payload = {
      ...parsed.data,
      lead_id: parsed.data.lead_id || null,
      party_id: parsed.data.party_id || null,
    };
    const result = await callMovementRpc("inventory_post_dispatch", payload, "Could not save the dispatch.");
    if (result.ok) {
      revalidateInventory({
        itemIds: lineItemIds(parsed.data.lines),
        leadId: parsed.data.lead_id || undefined,
      });
    }
    return result;
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Could not save the dispatch.") };
  }
}

export async function postReturn(input: unknown): Promise<ActionResult<{ movement: PostedMovement }>> {
  try {
    await requireAuth();
    const parsed = parseInput(returnSchema, input);
    if (!parsed.ok) return parsed;
    const payload = {
      ...parsed.data,
      lead_id: parsed.data.lead_id || null,
      party_id: parsed.data.party_id || null,
    };
    const result = await callMovementRpc("inventory_post_return", payload, "Could not save the return.");
    if (result.ok) {
      revalidateInventory({
        itemIds: lineItemIds(parsed.data.lines),
        leadId: parsed.data.lead_id || undefined,
      });
    }
    return result;
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Could not save the return.") };
  }
}

export async function postAdjustment(input: unknown): Promise<ActionResult<{ movement: PostedMovement }>> {
  try {
    await requireAuth();
    const parsed = parseInput(adjustmentSchema, input);
    if (!parsed.ok) return parsed;
    const result = await callMovementRpc("inventory_post_adjustment", parsed.data, "Could not save the adjustment.");
    if (result.ok) revalidateInventory({ itemIds: lineItemIds(parsed.data.lines) });
    return result;
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Could not save the adjustment.") };
  }
}

export async function reverseMovement(input: unknown): Promise<ActionResult<{ movement: PostedMovement }>> {
  try {
    await requireAuth();
    const parsed = parseInput(reverseSchema, input);
    if (!parsed.ok) return parsed;

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("inventory_reverse_movement", {
      p_movement_id: parsed.data.movement_id,
      p_reason: parsed.data.reason,
    });
    if (error) return { ok: false, error: inventoryDbError(error, "Could not reverse this entry.") };
    revalidateInventory();
    return { ok: true, movement: data as PostedMovement };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Could not reverse this entry.") };
  }
}

export async function importOpeningStock(input: unknown): Promise<ActionResult<{ result: OpeningImportResult }>> {
  try {
    await requireAuth();
    const parsed = parseInput(openingImportSchema, input);
    if (!parsed.ok) return parsed;

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("inventory_import_opening_stock", { payload: parsed.data });
    if (error) return { ok: false, error: inventoryDbError(error, "Could not import opening stock.") };
    revalidateInventory();
    return { ok: true, result: data as OpeningImportResult };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Could not import opening stock.") };
  }
}

export async function searchInventoryCustomers(query: string): Promise<ActionResult<{ customers: InventoryCustomer[] }>> {
  try {
    await requireAuth();
    const supabase = await createClient();
    const customers = await lookupCustomers(supabase, { query: String(query ?? "").slice(0, 100), limit: 20 });
    return { ok: true, customers };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Could not search customers.") };
  }
}

export interface DispatchSuggestion {
  quotation_no: string;
  lines: { item_id: string | null; quantity: number; source_name: string }[];
}

/** Price-free material list from the customer's quotation, to pre-fill a dispatch. */
export async function getDispatchSuggestion(leadId: string): Promise<ActionResult<{ suggestion: DispatchSuggestion | null }>> {
  try {
    await requireAuth();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("inventory_quotation_suggestion", { p_lead_id: leadId });
    if (error) return { ok: false, error: inventoryDbError(error, "Could not load the quotation.") };
    const rows = (data ?? []) as { quotation_no: string; item_id: string | null; quantity: number; source_name: string }[];
    if (rows.length === 0) return { ok: true, suggestion: null };
    return {
      ok: true,
      suggestion: {
        quotation_no: rows[0].quotation_no,
        lines: rows.map((r) => ({ item_id: r.item_id, quantity: Number(r.quantity), source_name: r.source_name })),
      },
    };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Could not load the quotation.") };
  }
}

/** Customer Material tab: used = dispatched − returned, serials at site, timeline. */
export async function loadCustomerMaterial(leadId: string): Promise<ActionResult<{ material: CustomerMaterial }>> {
  try {
    const ctx = await getInventoryAccess();
    if (!ctx) return { ok: false, error: "Please sign in again." };
    if (!ctx.access.canView) return { ok: false, error: "You do not have permission to view inventory." };
    if (!UUID_RE.test(leadId)) return { ok: false, error: "Customer not found." };
    return { ok: true, material: await getCustomerMaterial(leadId) };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Could not load material.") };
  }
}

export async function loadPartyMaterial(partyId: string): Promise<ActionResult<{ material: CustomerMaterial }>> {
  try {
    const ctx = await getInventoryAccess();
    if (!ctx) return { ok: false, error: "Please sign in again." };
    if (!ctx.access.canView) return { ok: false, error: "You do not have permission to view inventory." };
    if (!UUID_RE.test(partyId)) return { ok: false, error: "Party not found." };
    return { ok: true, material: await getPartyMaterial(partyId) };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Could not load material.") };
  }
}

export async function searchInventoryParties(query = ""): Promise<ActionResult<{ parties: InventoryParty[] }>> {
  try {
    await requireAuth();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("inventory_party_lookup", {
      p_query: query.trim() || null,
      p_limit: 50,
    });
    if (error) return { ok: false, error: inventoryDbError(error, "Could not search parties.") };
    const parties = ((data ?? []) as Array<Record<string, unknown>>).map((p) => ({
      id: p.id as string,
      name: p.name as string,
      kind: p.kind as InventoryPartyKind,
      phone: (p.phone as string | null) ?? null,
      city: (p.city as string | null) ?? null,
      address: (p.address as string | null) ?? null,
      gstin: (p.gstin as string | null) ?? null,
      is_active: Boolean(p.is_active),
    }));
    return { ok: true, parties };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Could not search parties.") };
  }
}

export async function createInventoryParty(input: unknown): Promise<ActionResult<{ party: InventoryParty }>> {
  try {
    await requireAuth();
    const parsed = parseInput(inventoryPartyCreateSchema, input);
    if (!parsed.ok) return parsed;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("inventory_create_party", {
      p_name: parsed.data.name,
      p_kind: parsed.data.kind,
      p_phone: parsed.data.phone ?? null,
      p_city: parsed.data.city ?? null,
      p_address: parsed.data.address ?? null,
      p_gstin: parsed.data.gstin ?? null,
    });
    if (error) return { ok: false, error: inventoryDbError(error, "Could not create party.") };
    const row = data as Record<string, unknown>;
    revalidateInventory();
    return {
      ok: true,
      party: {
        id: row.id as string,
        name: row.name as string,
        kind: row.kind as InventoryPartyKind,
        phone: (row.phone as string | null) ?? parsed.data.phone ?? null,
        city: (row.city as string | null) ?? parsed.data.city ?? null,
        address: (row.address as string | null) ?? parsed.data.address ?? null,
        gstin: (row.gstin as string | null) ?? parsed.data.gstin ?? null,
        is_active: true,
      },
    };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Could not create party.") };
  }
}

export async function updateInventoryParty(input: unknown): Promise<ActionResult<{ party: InventoryParty }>> {
  try {
    await requireAuth();
    const parsed = parseInput(inventoryPartyUpdateSchema, input);
    if (!parsed.ok) return parsed;
    const supabase = await createClient();
    const patch: Record<string, unknown> = {
      name: parsed.data.name,
      kind: parsed.data.kind,
      phone: parsed.data.phone ?? null,
      city: parsed.data.city ?? null,
      address: parsed.data.address ?? null,
      gstin: parsed.data.gstin ?? null,
      updated_at: new Date().toISOString(),
    };
    if (typeof parsed.data.is_active === "boolean") patch.is_active = parsed.data.is_active;
    const { data, error } = await supabase
      .from("inventory_parties")
      .update(patch)
      .eq("id", parsed.data.id)
      .select("id,name,kind,phone,city,address,gstin,is_active")
      .maybeSingle();
    if (error) return { ok: false, error: inventoryDbError(error, "Could not update party.") };
    if (!data) return { ok: false, error: "Party not found." };
    revalidateInventory();
    return {
      ok: true,
      party: {
        id: data.id as string,
        name: data.name as string,
        kind: data.kind as InventoryPartyKind,
        phone: (data.phone as string | null) ?? null,
        city: (data.city as string | null) ?? null,
        address: (data.address as string | null) ?? null,
        gstin: (data.gstin as string | null) ?? null,
        is_active: Boolean(data.is_active),
      },
    };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Could not update party.") };
  }
}

/** Live validation for scanned serials (read only). */
export async function checkSerials(input: unknown): Promise<ActionResult<{ results: SerialCheckResult[] }>> {
  try {
    await requireAuth();
    const parsed = parseInput(checkSerialsSchema, input);
    if (!parsed.ok) return parsed;

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("inventory_check_serials", {
      p_item_id: parsed.data.item_id,
      p_serials: parsed.data.serials,
      p_mode: parsed.data.mode,
      p_lead_id: parsed.data.lead_id ?? null,
      p_party_id: parsed.data.party_id ?? null,
    });
    if (error) return { ok: false, error: inventoryDbError(error, "Could not check serials.") };
    return { ok: true, results: (data ?? []) as SerialCheckResult[] };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Could not check serials.") };
  }
}
