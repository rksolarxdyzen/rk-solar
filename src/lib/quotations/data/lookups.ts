import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import {
  normalizeSolarTemplate,
  type SolarProposalTemplate,
} from "@/lib/quotations/quotation-template";

export type LeadOption = {
  id: string;
  name: string;
  phone: string;
  address?: string | null;
};

/** CRM leads used as the customer source for quotations. */
export async function getLeadOptions(): Promise<LeadOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("leads")
    .select("id,name,phone,address")
    .order("name");
  return (data ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    phone: l.phone,
    address: l.address,
  }));
}

export async function searchItems(query: string) {
  const supabase = await createClient();
  const q = query.trim();
  if (q.length < 2) return [];

  const { data, error } = await supabase
    .from("quote_items")
    .select("id,item_name,model,unit,gst_percent,base_rate,brands:quote_brands(name)")
    .eq("is_active", true)
    .or(`item_name.ilike.%${q}%,model.ilike.%${q}%,aliases.ilike.%${q}%`)
    .order("item_name")
    .limit(20);

  if (error) return [];
  return data ?? [];
}

export async function getBrands() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("quote_brands")
    .select("id,name,category,logo_url")
    .order("name");
  return data ?? [];
}

export async function getCategories() {
  const supabase = await createClient();
  const { data } = await supabase.from("quote_item_categories").select("id,name").order("name");
  return data ?? [];
}

/** Company row (name / phone / email) for the current user. */
export async function getCompany() {
  const profile = await getCurrentUser();
  if (!profile) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("companies")
    .select("id,name,phone,email")
    .eq("id", profile.company_id)
    .maybeSingle();
  return data;
}

/** RK solar proposal template for the current company (falls back to defaults). */
export async function loadSolarTemplate(): Promise<SolarProposalTemplate> {
  const profile = await getCurrentUser();
  if (!profile) return normalizeSolarTemplate(null);
  const supabase = await createClient();
  const { data } = await supabase
    .from("quotation_company_settings")
    .select("quotation_template, quotation_terms, quotation_notes_footer, from_name, from_phone")
    .eq("company_id", profile.company_id)
    .maybeSingle();
  return normalizeSolarTemplate(data?.quotation_template, {
    termsText: data?.quotation_terms,
    footerText: data?.quotation_notes_footer,
    preparedBy: data?.from_name,
    preparedByPhone: data?.from_phone,
  });
}

/** Quotation settings (numbering, template, bank/contact) for current company. */
export async function getQuotationSettings() {
  const profile = await getCurrentUser();
  if (!profile) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("quotation_company_settings")
    .select("*")
    .eq("company_id", profile.company_id)
    .maybeSingle();
  return data;
}
