"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, hasAuthority } from "@/lib/auth";

async function requireCatalogManage() {
  const profile = await requireAuth();
  const ok =
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    (await hasAuthority(profile.id, "manage_catalog_items")) ||
    (await hasAuthority(profile.id, "full_access"));
  if (!ok) throw new Error("Missing authority: manage_catalog_items");
  return profile;
}

export async function listCatalogAdmin() {
  const profile = await requireCatalogManage();
  const supabase = await createClient();

  const [items, brands, categories] = await Promise.all([
    supabase
      .from("quote_items")
      .select(
        "id, item_name, model, capacity_label, unit, gst_percent, base_rate, template_kind, warranty_text, image_url, is_active, brand_id, category_id, brand:quote_brands(id, name), category:quote_item_categories(id, name, kind)"
      )
      .eq("company_id", profile.company_id)
      .order("item_name"),
    supabase
      .from("quote_brands")
      .select("id, name, category")
      .eq("company_id", profile.company_id)
      .order("name"),
    supabase
      .from("quote_item_categories")
      .select("id, name, kind, sort_order")
      .eq("company_id", profile.company_id)
      .order("sort_order")
      .order("name"),
  ]);

  if (items.error) throw new Error(items.error.message);
  if (brands.error) throw new Error(brands.error.message);
  if (categories.error) throw new Error(categories.error.message);

  return {
    items: items.data ?? [],
    brands: brands.data ?? [],
    categories: categories.data ?? [],
  };
}

export async function upsertCatalogCategory(input: {
  id?: string;
  name: string;
  kind: "solar" | "premium" | "non_solar" | "both";
  sortOrder?: number;
}) {
  const profile = await requireCatalogManage();
  const parsed = z
    .object({
      id: z.string().uuid().optional(),
      name: z.string().min(2).max(80),
      kind: z.enum(["solar", "premium", "non_solar", "both"]),
      sortOrder: z.number().int().optional(),
    })
    .parse(input);

  const supabase = await createClient();
  const row = {
    company_id: profile.company_id,
    name: parsed.name.trim(),
    kind: parsed.kind,
    sort_order: parsed.sortOrder ?? 0,
  };

  const { error } = parsed.id
    ? await supabase.from("quote_item_categories").update(row).eq("id", parsed.id)
    : await supabase.from("quote_item_categories").insert(row);

  if (error) throw new Error(error.message);
  revalidatePath("/catalog");
  return { ok: true };
}

export async function upsertCatalogBrand(input: {
  id?: string;
  name: string;
  category?: string | null;
}) {
  const profile = await requireCatalogManage();
  const parsed = z
    .object({
      id: z.string().uuid().optional(),
      name: z.string().min(2).max(120),
      category: z.string().max(40).nullable().optional(),
    })
    .parse(input);

  const supabase = await createClient();
  const row = {
    company_id: profile.company_id,
    name: parsed.name.trim(),
    category: parsed.category?.trim() || null,
  };

  const { error } = parsed.id
    ? await supabase.from("quote_brands").update(row).eq("id", parsed.id)
    : await supabase.from("quote_brands").insert(row);

  if (error) throw new Error(error.message);
  revalidatePath("/catalog");
  return { ok: true };
}

export async function upsertCatalogItem(input: {
  id?: string;
  itemName: string;
  model?: string | null;
  capacityLabel?: string | null;
  unit?: string;
  gstPercent?: number;
  baseRate: number;
  templateKind: "solar" | "premium" | "non_solar" | "both";
  brandId?: string | null;
  categoryId?: string | null;
  warrantyText?: string | null;
  imageUrl?: string | null;
  isActive?: boolean;
}) {
  const profile = await requireCatalogManage();
  const parsed = z
    .object({
      id: z.string().uuid().optional(),
      itemName: z.string().min(2).max(200),
      model: z.string().max(120).nullable().optional(),
      capacityLabel: z.string().max(60).nullable().optional(),
      unit: z.string().max(24).optional(),
      gstPercent: z.number().min(0).max(100).optional(),
      baseRate: z.number().min(0),
      templateKind: z.enum(["solar", "premium", "non_solar", "both"]),
      brandId: z.string().uuid().nullable().optional(),
      categoryId: z.string().uuid().nullable().optional(),
      warrantyText: z.string().nullable().optional(),
      imageUrl: z.string().max(2000).nullable().optional(),
      isActive: z.boolean().optional(),
    })
    .parse(input);

  const supabase = await createClient();
  const row = {
    company_id: profile.company_id,
    item_name: parsed.itemName.trim(),
    model: parsed.model?.trim() || null,
    capacity_label: parsed.capacityLabel?.trim() || null,
    unit: parsed.unit?.trim() || "pcs",
    gst_percent: parsed.gstPercent ?? 18,
    base_rate: parsed.baseRate,
    template_kind: parsed.templateKind,
    brand_id: parsed.brandId ?? null,
    category_id: parsed.categoryId ?? null,
    warranty_text: parsed.warrantyText?.trim() || null,
    image_url: parsed.imageUrl?.trim() || null,
    is_active: parsed.isActive ?? true,
    updated_at: new Date().toISOString(),
  };

  if (parsed.id) {
    const { error } = await supabase
      .from("quote_items")
      .update(row)
      .eq("id", parsed.id)
      .eq("company_id", profile.company_id);
    if (error) throw new Error(error.message);
    revalidatePath("/catalog");
    revalidatePath("/quotations");
    return { ok: true, id: parsed.id };
  }

  const { data: inserted, error } = await supabase
    .from("quote_items")
    .insert(row)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/catalog");
  revalidatePath("/quotations");
  return { ok: true, id: inserted.id as string };
}

export async function setCatalogItemActive(itemId: string, isActive: boolean) {
  const profile = await requireCatalogManage();
  const supabase = await createClient();
  const { error } = await supabase
    .from("quote_items")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("company_id", profile.company_id);

  if (error) throw new Error(error.message);
  revalidatePath("/catalog");
  return { ok: true };
}
