import { createClient } from "@/lib/supabase/server";
import type { CatalogItem } from "@/lib/quotations/catalog-items";

function relBrand(
  rel:
    | { name: string; logo_url?: string | null }
    | { name: string; logo_url?: string | null }[]
    | null
    | undefined
) {
  if (!rel) return { name: null as string | null, logo_url: null as string | null };
  const row = Array.isArray(rel) ? rel[0] : rel;
  return {
    name: row?.name ?? null,
    logo_url: row?.logo_url ?? null,
  };
}

function relName(rel: { name: string } | { name: string }[] | null | undefined) {
  if (!rel) return null;
  return Array.isArray(rel) ? rel[0]?.name ?? null : rel.name;
}

function mapCatalogRows(
  rows: Array<{
    id: string;
    item_name: string;
    model: string | null;
    capacity_label: string | null;
    unit: string;
    gst_percent: number | string;
    base_rate: number | string;
    image_url?: string | null;
    brand?:
      | { name: string; logo_url?: string | null }
      | { name: string; logo_url?: string | null }[]
      | null;
    category?: { name: string } | { name: string }[] | null;
    /** legacy alias from older selects */
    brands?:
      | { name: string; logo_url?: string | null }
      | { name: string; logo_url?: string | null }[]
      | null;
    item_categories?: { name: string } | { name: string }[] | null;
  }>
): CatalogItem[] {
  return rows.map((row) => {
    const brand = relBrand(row.brand ?? row.brands);
    return {
      id: row.id,
      item_name: row.item_name,
      model: row.model,
      capacity_label: row.capacity_label,
      unit: row.unit,
      base_rate: Number(row.base_rate),
      gst_percent: Number(row.gst_percent),
      brand: brand.name,
      brand_image_url: brand.logo_url,
      category: relName(row.category ?? row.item_categories),
      image_url: row.image_url ?? null,
    };
  });
}

export async function getItems() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quote_items")
    .select(
      "id,item_name,model,capacity_label,unit,gst_percent,base_rate,warranty_text,is_active,brand_id,category_id,image_url,image_storage_path,brand:quote_brands(name,logo_url),category:quote_item_categories(name)"
    )
    .order("item_name");
  if (error) throw error;
  return data ?? [];
}

/**
 * Active catalogue rows for the solar quotation builder (panels + inverters + other).
 * Uses the same FK aliases as listCatalogItems (brand / category) so PostgREST joins succeed.
 */
export async function getCatalogForQuotation(): Promise<CatalogItem[]> {
  const supabase = await createClient();

  const primary = await supabase
    .from("quote_items")
    .select(
      "id,item_name,model,capacity_label,unit,gst_percent,base_rate,is_active,image_url,brand:quote_brands(name,logo_url),category:quote_item_categories(name)"
    )
    .eq("is_active", true)
    .order("item_name");

  if (!primary.error) {
    return mapCatalogRows(primary.data ?? []);
  }

  // Fallback when logo_url / image columns are missing (021 not applied yet)
  const fallback = await supabase
    .from("quote_items")
    .select(
      "id,item_name,model,capacity_label,unit,gst_percent,base_rate,is_active,brand:quote_brands(name),category:quote_item_categories(name)"
    )
    .eq("is_active", true)
    .order("item_name");

  if (fallback.error) throw new Error(fallback.error.message);
  return mapCatalogRows(fallback.data ?? []);
}
