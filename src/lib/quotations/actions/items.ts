"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getQuotationContext } from "@/lib/quotations/context";
import { ATTACHMENTS_BUCKET, getStoragePublicUrl } from "@/lib/storage-url";

const itemSchema = z.object({
  id: z.string().uuid().optional(),
  itemName: z.string().min(1),
  brandId: z.string().uuid().optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  model: z.string().optional(),
  capacityLabel: z.string().optional(),
  unit: z.string().min(1),
  gstPercent: z.coerce.number().min(0).max(100),
  baseRate: z.coerce.number().nonnegative(),
  warrantyText: z.string().optional(),
  aliases: z.string().optional(),
  isActive: z.boolean().default(true),
});

export async function upsertItem(input: unknown) {
  const data = itemSchema.parse(input);
  const { supabase, companyId, canManageCatalog } = await getQuotationContext();

  if (!canManageCatalog) {
    throw new Error("You do not have permission to manage catalog items.");
  }

  const row = {
    company_id: companyId,
    item_name: data.itemName,
    brand_id: data.brandId || null,
    category_id: data.categoryId || null,
    model: data.model || null,
    capacity_label: data.capacityLabel?.trim() || null,
    unit: data.unit,
    gst_percent: data.gstPercent,
    base_rate: data.baseRate,
    warranty_text: data.warrantyText || null,
    aliases: data.aliases || null,
    is_active: data.isActive,
    updated_at: new Date().toISOString(),
  };

  if (data.id) {
    const { error } = await supabase
      .from("quote_items")
      .update(row)
      .eq("id", data.id)
      .eq("company_id", companyId);
    if (error) throw error;
    revalidatePath("/catalog");
    return { id: data.id };
  }

  const { data: inserted, error } = await supabase
    .from("quote_items")
    .insert(row)
    .select("id")
    .single();
  if (error) throw error;
  revalidatePath("/catalog");
  return { id: inserted.id as string };
}

const brandSchema = z.object({
  name: z.string().trim().min(1, "Brand name is required"),
  category: z.enum(["panel", "inverter"]).nullable().optional(),
});

export type CreatedBrand = {
  id: string;
  name: string;
  category: string | null;
  logo_url?: string | null;
};

export async function createBrand(input: unknown): Promise<CreatedBrand> {
  const data = brandSchema.parse(input);
  const { supabase, companyId, canManageCatalog } = await getQuotationContext();
  if (!canManageCatalog) throw new Error("You do not have permission to add brands.");

  const category = data.category ?? null;
  const existingQuery = supabase
    .from("quote_brands")
    .select("id, name, category, logo_url")
    .eq("company_id", companyId)
    .ilike("name", data.name);

  const { data: existing } = await (category
    ? existingQuery.eq("category", category)
    : existingQuery
  ).maybeSingle();
  if (existing) return existing as CreatedBrand;

  const { data: created, error } = await supabase
    .from("quote_brands")
    .insert({ company_id: companyId, name: data.name, category })
    .select("id, name, category, logo_url")
    .single();
  if (error) throw error;
  revalidatePath("/catalog");
  return created as CreatedBrand;
}

export async function deleteItem(id: string) {
  const { supabase, companyId, canManageCatalog } = await getQuotationContext();
  if (!canManageCatalog) {
    throw new Error("You do not have permission to delete catalog items.");
  }

  const { data: existing } = await supabase
    .from("quote_items")
    .select("image_storage_path")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle();

  if (existing?.image_storage_path) {
    await supabase.storage.from(ATTACHMENTS_BUCKET).remove([existing.image_storage_path]);
  }

  const { error } = await supabase.from("quote_items").delete().eq("id", id).eq("company_id", companyId);
  if (error) throw error;
  revalidatePath("/catalog");
}

export async function uploadQuoteItemImage(itemId: string, formData: FormData) {
  const { supabase, companyId, canManageCatalog } = await getQuotationContext();
  if (!canManageCatalog) {
    throw new Error("You do not have permission to manage catalog items.");
  }

  const file = formData.get("file") as File | null;
  if (!file) throw new Error("No file provided");
  if (!file.type.startsWith("image/")) throw new Error("Only image files are allowed");
  if (file.size > 8 * 1024 * 1024) throw new Error("Image must be under 8 MB");

  const { data: item, error: findError } = await supabase
    .from("quote_items")
    .select("id, image_storage_path")
    .eq("id", itemId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (findError) throw findError;
  if (!item) throw new Error("Item not found");

  const ext =
    (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const storagePath = `${companyId}/quote-items/${itemId}/${Date.now()}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .upload(storagePath, arrayBuffer, { contentType: file.type, upsert: false });
  if (uploadError) throw new Error(uploadError.message);

  if (item.image_storage_path) {
    await supabase.storage.from(ATTACHMENTS_BUCKET).remove([item.image_storage_path]);
  }

  const imageUrl = getStoragePublicUrl(storagePath);
  const { error: updateError } = await supabase
    .from("quote_items")
    .update({
      image_storage_path: storagePath,
      image_url: imageUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId)
    .eq("company_id", companyId);
  if (updateError) throw updateError;

  revalidatePath("/catalog");
  return { storagePath, imageUrl };
}

export async function removeQuoteItemImage(itemId: string) {
  const { supabase, companyId, canManageCatalog } = await getQuotationContext();
  if (!canManageCatalog) {
    throw new Error("You do not have permission to manage catalog items.");
  }

  const { data: item, error: findError } = await supabase
    .from("quote_items")
    .select("id, image_storage_path")
    .eq("id", itemId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (findError) throw findError;
  if (!item) throw new Error("Item not found");

  const prefix = `${companyId}/quote-items/${itemId}/`;
  if (item.image_storage_path?.startsWith(prefix)) {
    const { error: storageError } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .remove([item.image_storage_path]);
    if (storageError) throw new Error(storageError.message);
  }

  const { error: updateError } = await supabase
    .from("quote_items")
    .update({
      image_storage_path: null,
      image_url: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId)
    .eq("company_id", companyId);
  if (updateError) throw updateError;

  revalidatePath("/catalog");
}

export async function uploadBrandLogo(brandId: string, formData: FormData) {
  const { supabase, companyId, canManageCatalog } = await getQuotationContext();
  if (!canManageCatalog) {
    throw new Error("You do not have permission to manage catalog items.");
  }

  const file = formData.get("file") as File | null;
  if (!file) throw new Error("No file provided");
  if (!file.type.startsWith("image/")) throw new Error("Only image files are allowed");
  if (file.size > 8 * 1024 * 1024) throw new Error("Image must be under 8 MB");

  const { data: brand, error: findError } = await supabase
    .from("quote_brands")
    .select("id, logo_storage_path")
    .eq("id", brandId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (findError) throw findError;
  if (!brand) throw new Error("Brand not found");

  const ext =
    (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const storagePath = `${companyId}/quote-brands/${brandId}/${Date.now()}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .upload(storagePath, arrayBuffer, { contentType: file.type, upsert: false });
  if (uploadError) throw new Error(uploadError.message);

  if (brand.logo_storage_path) {
    await supabase.storage.from(ATTACHMENTS_BUCKET).remove([brand.logo_storage_path]);
  }

  const logoUrl = getStoragePublicUrl(storagePath);
  const { error: updateError } = await supabase
    .from("quote_brands")
    .update({
      logo_storage_path: storagePath,
      logo_url: logoUrl,
    })
    .eq("id", brandId)
    .eq("company_id", companyId);
  if (updateError) throw updateError;

  revalidatePath("/catalog");
  return { storagePath, logoUrl };
}

export async function removeBrandLogo(brandId: string) {
  const { supabase, companyId, canManageCatalog } = await getQuotationContext();
  if (!canManageCatalog) {
    throw new Error("You do not have permission to manage catalog items.");
  }

  const { data: brand, error: findError } = await supabase
    .from("quote_brands")
    .select("id, logo_storage_path")
    .eq("id", brandId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (findError) throw findError;
  if (!brand) throw new Error("Brand not found");

  const prefix = `${companyId}/quote-brands/${brandId}/`;
  if (brand.logo_storage_path?.startsWith(prefix)) {
    const { error: storageError } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .remove([brand.logo_storage_path]);
    if (storageError) throw new Error(storageError.message);
  }

  const { error: updateError } = await supabase
    .from("quote_brands")
    .update({
      logo_storage_path: null,
      logo_url: null,
    })
    .eq("id", brandId)
    .eq("company_id", companyId);
  if (updateError) throw updateError;

  revalidatePath("/catalog");
}
