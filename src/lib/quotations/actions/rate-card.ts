"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getQuotationContext } from "@/lib/quotations/context";
import { parsePanelWattage } from "@/lib/quotations/per-kw-pricing";

async function requireCatalogManage() {
  const ctx = await getQuotationContext();
  if (!ctx.canManageCatalog) {
    throw new Error("You do not have permission to manage the rate card.");
  }
  return ctx;
}

/** Postgrest errors are plain objects — throw Error so clients get a readable message. */
function throwDb(error: { message?: string } | null | undefined): never {
  throw new Error(error?.message?.trim() || "Database request failed");
}

const moduleTypeSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  moduleFamily: z.string().min(1),
  capacityLabel: z.string().min(1),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
});

const companySchema = z.object({
  id: z.string().uuid().optional(),
  moduleTypeId: z.string().uuid(),
  name: z.string().min(1),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
});

const packageSchema = z.object({
  id: z.string().uuid().optional(),
  rateCompanyId: z.string().uuid(),
  systemSizeKw: z.coerce.number().positive(),
  panelCount: z.coerce.number().int().positive(),
  listPrice: z.coerce.number().nonnegative(),
  minSalePrice: z.coerce.number().nonnegative(),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
});

export async function upsertRateModuleType(input: unknown) {
  const data = moduleTypeSchema.parse(input);
  const { supabase, companyId } = await requireCatalogManage();
  const row = {
    company_id: companyId,
    name: data.name,
    module_family: data.moduleFamily,
    capacity_label: data.capacityLabel,
    sort_order: data.sortOrder,
    is_active: data.isActive,
    updated_at: new Date().toISOString(),
  };
  if (data.id) {
    const { data: updated, error } = await supabase
      .from("rate_card_module_types")
      .update(row)
      .eq("id", data.id)
      .eq("company_id", companyId)
      .select("id, name, module_family, capacity_label, sort_order, is_active")
      .single();
    if (error) throw error;
    revalidatePath("/catalog");
    return updated;
  }
  const { data: inserted, error } = await supabase
    .from("rate_card_module_types")
    .insert(row)
    .select("id, name, module_family, capacity_label, sort_order, is_active")
    .single();
  if (error) throw error;
  revalidatePath("/catalog");
  return inserted;
}

export async function deleteRateModuleType(id: string) {
  const { supabase, companyId } = await requireCatalogManage();
  const { error } = await supabase
    .from("rate_card_module_types")
    .delete()
    .eq("id", id)
    .eq("company_id", companyId);
  if (error) throw error;
  revalidatePath("/catalog");
}

export async function upsertRateCompany(input: unknown) {
  const data = companySchema.parse(input);
  const { supabase, companyId } = await requireCatalogManage();
  const row = {
    company_id: companyId,
    module_type_id: data.moduleTypeId,
    name: data.name,
    sort_order: data.sortOrder,
    is_active: data.isActive,
    updated_at: new Date().toISOString(),
  };
  if (data.id) {
    const { data: updated, error } = await supabase
      .from("rate_card_companies")
      .update(row)
      .eq("id", data.id)
      .eq("company_id", companyId)
      .select("id, module_type_id, name, sort_order, is_active")
      .single();
    if (error) throw error;
    revalidatePath("/catalog");
    return updated;
  }
  const { data: inserted, error } = await supabase
    .from("rate_card_companies")
    .insert(row)
    .select("id, module_type_id, name, sort_order, is_active")
    .single();
  if (error) throw error;
  revalidatePath("/catalog");
  return inserted;
}

export async function deleteRateCompany(id: string) {
  const { supabase, companyId } = await requireCatalogManage();
  const { error } = await supabase
    .from("rate_card_companies")
    .delete()
    .eq("id", id)
    .eq("company_id", companyId);
  if (error) throw error;
  revalidatePath("/catalog");
}

export async function upsertRatePackage(input: unknown) {
  const data = packageSchema.parse(input);
  if (data.minSalePrice > data.listPrice) {
    // Allowed — min can equal list; allowing min > list is odd but ops may set floor high
  }
  const { supabase, companyId } = await requireCatalogManage();
  const row = {
    company_id: companyId,
    rate_company_id: data.rateCompanyId,
    system_size_kw: data.systemSizeKw,
    panel_count: data.panelCount,
    list_price: data.listPrice,
    min_sale_price: data.minSalePrice,
    sort_order: data.sortOrder,
    is_active: data.isActive,
    updated_at: new Date().toISOString(),
  };
  const selectCols =
    "id, rate_company_id, system_size_kw, panel_count, list_price, min_sale_price, sort_order, is_active";
  if (data.id) {
    const { data: updated, error } = await supabase
      .from("rate_card_packages")
      .update(row)
      .eq("id", data.id)
      .eq("company_id", companyId)
      .select(selectCols)
      .single();
    if (error) throw error;
    revalidatePath("/catalog");
    return updated;
  }
  const { data: inserted, error } = await supabase
    .from("rate_card_packages")
    .insert(row)
    .select(selectCols)
    .single();
  if (error) throw error;
  revalidatePath("/catalog");
  return inserted;
}

export async function deleteRatePackage(id: string) {
  const { supabase, companyId } = await requireCatalogManage();
  const { error } = await supabase
    .from("rate_card_packages")
    .delete()
    .eq("id", id)
    .eq("company_id", companyId);
  if (error) throw error;
  revalidatePath("/catalog");
}

/** Bulk-update list + min sale for several packages (catalog grid save). */
export async function updateRatePackagePrices(
  rows: Array<{ id: string; listPrice: number; minSalePrice: number }>
) {
  const { supabase, companyId } = await requireCatalogManage();
  for (const row of rows) {
    const { error } = await supabase
      .from("rate_card_packages")
      .update({
        list_price: row.listPrice,
        min_sale_price: row.minSalePrice,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("company_id", companyId);
    if (error) throw error;
  }
  revalidatePath("/catalog");
}

const perKwRatesSchema = z.object({
  id: z.string().uuid(),
  panelWattage: z.coerce.number().int().positive().optional().nullable(),
  residentialRegularRatePerKw: z.coerce.number().nonnegative().optional().nullable(),
  residentialPremiumRatePerKw: z.coerce.number().nonnegative().optional().nullable(),
  commercialRegularRatePerKw: z.coerce.number().nonnegative().optional().nullable(),
  commercialPremiumRatePerKw: z.coerce.number().nonnegative().optional().nullable(),
  usePerKwPricing: z.boolean().default(true),
});

export async function updateRateCompanyPerKw(input: unknown) {
  const data = perKwRatesSchema.parse(input);
  const { supabase, companyId } = await requireCatalogManage();
  const { data: updated, error } = await supabase
    .from("rate_card_companies")
    .update({
      panel_wattage: data.panelWattage ?? null,
      residential_regular_rate_per_kw: data.residentialRegularRatePerKw ?? null,
      residential_premium_rate_per_kw: data.residentialPremiumRatePerKw ?? null,
      commercial_regular_rate_per_kw: data.commercialRegularRatePerKw ?? null,
      commercial_premium_rate_per_kw: data.commercialPremiumRatePerKw ?? null,
      use_per_kw_pricing: data.usePerKwPricing,
      updated_at: new Date().toISOString(),
    })
    .eq("id", data.id)
    .eq("company_id", companyId)
    .select(
      "id, module_type_id, name, sort_order, is_active, panel_wattage, residential_regular_rate_per_kw, residential_premium_rate_per_kw, commercial_regular_rate_per_kw, commercial_premium_rate_per_kw, use_per_kw_pricing"
    )
    .single();
  if (error) throw error;
  revalidatePath("/catalog");
  return updated;
}

const panelSchema = z.object({
  id: z.string().uuid().optional(),
  panelName: z.string().min(1),
  panelWattPeak: z.string().trim().min(1).max(100),
  residentialRegularRatePerKw: z.coerce.number().nonnegative().optional().nullable(),
  residentialPremiumRatePerKw: z.coerce.number().nonnegative().optional().nullable(),
  commercialRegularRatePerKw: z.coerce.number().nonnegative().optional().nullable(),
  commercialPremiumRatePerKw: z.coerce.number().nonnegative().optional().nullable(),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
});

export async function upsertRatePanel(input: unknown) {
  const data = panelSchema.parse(input);
  const { supabase, companyId } = await requireCatalogManage();
  const panelName = data.panelName.trim();
  const panelWattPeak = data.panelWattPeak.trim();
  const panelWattage = parsePanelWattage(panelWattPeak);
  const row = {
    company_id: companyId,
    module_type_id: null,
    name: panelName,
    panel_name: panelName,
    panel_watt_peak: panelWattPeak,
    panel_wattage: panelWattage,
    residential_regular_rate_per_kw: data.residentialRegularRatePerKw ?? null,
    residential_premium_rate_per_kw: data.residentialPremiumRatePerKw ?? null,
    commercial_regular_rate_per_kw: data.commercialRegularRatePerKw ?? null,
    commercial_premium_rate_per_kw: data.commercialPremiumRatePerKw ?? null,
    use_per_kw_pricing: true,
    sort_order: data.sortOrder,
    is_active: data.isActive,
    updated_at: new Date().toISOString(),
  };
  const selectCols =
    "id, panel_name, name, sort_order, is_active, panel_wattage, panel_watt_peak, residential_regular_rate_per_kw, residential_premium_rate_per_kw, commercial_regular_rate_per_kw, commercial_premium_rate_per_kw, use_per_kw_pricing";

  if (data.id) {
    const { data: updated, error } = await supabase
      .from("rate_card_companies")
      .update(row)
      .eq("id", data.id)
      .eq("company_id", companyId)
      .select(selectCols)
      .single();
    if (error) throw error;
    revalidatePath("/catalog");
    return updated;
  }

  const { data: inserted, error } = await supabase
    .from("rate_card_companies")
    .insert(row)
    .select(selectCols)
    .single();
  if (error) throw error;
  revalidatePath("/catalog");
  return inserted;
}

export async function deleteRatePanel(id: string) {
  return deleteRateCompany(id);
}

const inverterSchema = z.object({
  id: z.string().uuid().optional(),
  inverterName: z.string().min(1),
  inverterSize: z.string().trim().min(1).max(100),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
});

export async function upsertRateInverter(input: unknown) {
  const data = inverterSchema.parse(input);
  const { supabase, companyId } = await requireCatalogManage();
  const row = {
    company_id: companyId,
    inverter_name: data.inverterName.trim(),
    inverter_size: data.inverterSize.trim(),
    sort_order: data.sortOrder,
    is_active: data.isActive,
    updated_at: new Date().toISOString(),
  };
  const selectCols = "id, inverter_name, inverter_size, sort_order, is_active";

  if (data.id) {
    const { data: updated, error } = await supabase
      .from("rate_card_inverters")
      .update(row)
      .eq("id", data.id)
      .eq("company_id", companyId)
      .select(selectCols)
      .single();
    if (error) throwDb(error);
    revalidatePath("/catalog");
    return updated;
  }

  const { data: inserted, error } = await supabase
    .from("rate_card_inverters")
    .insert(row)
    .select(selectCols)
    .single();
  if (error) throwDb(error);
  revalidatePath("/catalog");
  return inserted;
}

export async function deleteRateInverter(id: string) {
  const { supabase, companyId } = await requireCatalogManage();
  const { error } = await supabase
    .from("rate_card_inverters")
    .delete()
    .eq("id", id)
    .eq("company_id", companyId);
  if (error) throwDb(error);
  revalidatePath("/catalog");
}
