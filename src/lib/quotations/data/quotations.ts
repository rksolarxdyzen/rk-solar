import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import {
  leadVisibilityOrFilter,
  ownsLead,
} from "@/lib/leads/visibility";
import {
  canSeeAllLeads,
  canSeeAllQuotations,
} from "@/lib/leads/visibility-server";
import type { Profile } from "@/lib/domain/types";
import { isDealerRole } from "@/lib/domain/dealers";

export type QuotationFilters = {
  customer?: string;
  quoteNo?: string;
  status?: string;
  dateFrom?: string;
  minAmount?: string;
};

export type QuotationListItem = {
  id: string;
  quotation_no: string;
  status: string;
  quote_date: string | null;
  grand_total: number | null;
  created_by: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  lead_id?: string | null;
  project_type?: string | null;
};

async function accessibleLeadIds(profile: Profile): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select("id")
    .eq("company_id", profile.company_id)
    .or(leadVisibilityOrFilter(profile));
  if (error) {
    console.error("[accessibleLeadIds]", error.message);
    return [];
  }
  return (data ?? []).map((row) => row.id);
}

/** Restrict quotation queries to leads the user owns (or quotes they created). */
function applyOwnershipFilter<T extends { or: (filter: string) => T }>(
  query: T,
  profile: Profile,
  leadIds: string[]
): T {
  if (leadIds.length === 0) {
    return query.or(`created_by.eq.${profile.id}`);
  }
  return query.or(`created_by.eq.${profile.id},lead_id.in.(${leadIds.join(",")})`);
}

async function assertCanAccessLead(profile: Profile, leadId: string): Promise<void> {
  if (await canSeeAllLeads(profile)) return;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select(
      "id, assigned_to, assigned_telecaller_id, assigned_surveyor_id, assigned_crew_id, created_by, dealer_id"
    )
    .eq("id", leadId)
    .eq("company_id", profile.company_id)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error("You do not have access to this lead.");
  }
  if (isDealerRole(profile)) {
    if (data.dealer_id !== profile.id && data.created_by !== profile.id) {
      throw new Error("You do not have access to this lead.");
    }
    return;
  }
  if (!ownsLead(profile, data)) {
    throw new Error("You do not have access to this lead.");
  }
}

export async function getQuotations(filters: QuotationFilters = {}) {
  const profile = await requireAuth();
  const supabase = await createClient();
  const canSeeAll = await canSeeAllQuotations(profile);

  let query = supabase
    .from("quotations")
    .select(
      "id,quotation_no,status,quote_date,grand_total,created_by,customer_name,customer_phone"
    )
    .order("created_at", { ascending: false });

  if (!canSeeAll) {
    const leadIds = await accessibleLeadIds(profile);
    query = applyOwnershipFilter(query, profile, leadIds);
  }

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.quoteNo) query = query.ilike("quotation_no", `%${filters.quoteNo}%`);
  if (filters.dateFrom) query = query.gte("quote_date", filters.dateFrom);
  if (filters.minAmount) query = query.gte("grand_total", Number(filters.minAmount));
  if (filters.customer) query = query.ilike("customer_name", `%${filters.customer}%`);

  const { data, error } = await query;
  if (error) {
    console.error("[getQuotations]", error.message);
    return [];
  }
  return data ?? [];
}

/**
 * Quotations for a CRM lead. Phone-matched history is only included for quotes
 * the caller is already allowed to see (own leads / created quotes).
 */
export async function getQuotationsForLead(
  leadId: string,
  phone?: string | null
): Promise<QuotationListItem[]> {
  const profile = await requireAuth();
  await assertCanAccessLead(profile, leadId);

  const supabase = await createClient();
  const canSeeAllQuotes = await canSeeAllQuotations(profile);
  const digits = (phone ?? "").replace(/\D/g, "");
  const phoneTail = digits.length >= 10 ? digits.slice(-10) : digits;

  const selectCols =
    "id,quotation_no,status,quote_date,grand_total,created_by,customer_name,customer_phone,lead_id";

  const byLeadPromise = supabase
    .from("quotations")
    .select(selectCols)
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });

  const phoneRowsPromise = (async (): Promise<QuotationListItem[]> => {
    if (phoneTail.length < 10) return [];

    let phoneQuery = supabase
      .from("quotations")
      .select(selectCols)
      .ilike("customer_phone", `%${phoneTail}%`)
      .order("created_at", { ascending: false });

    if (!canSeeAllQuotes) {
      const leadIds = await accessibleLeadIds(profile);
      phoneQuery = applyOwnershipFilter(phoneQuery, profile, leadIds);
    }

    const { data, error } = await phoneQuery;
    if (error) {
      console.error("[getQuotationsForLead:phone]", error.message);
      return [];
    }
    return (data ?? []) as QuotationListItem[];
  })();

  const [byLeadResult, phoneRows] = await Promise.all([byLeadPromise, phoneRowsPromise]);

  if (byLeadResult.error) {
    console.error("[getQuotationsForLead:lead]", byLeadResult.error.message);
    return phoneRows;
  }

  const map = new Map<string, QuotationListItem>();
  for (const row of [
    ...((byLeadResult.data ?? []) as QuotationListItem[]),
    ...phoneRows,
  ]) {
    map.set(row.id, row);
  }
  return Array.from(map.values()).sort((a, b) => {
    const da = a.quote_date ?? "";
    const db = b.quote_date ?? "";
    return db.localeCompare(da);
  });
}

export async function getQuotationById(id: string) {
  const profile = await requireAuth();
  const supabase = await createClient();
  const canSeeAll = await canSeeAllQuotations(profile);

  const { data, error } = await supabase
    .from("quotations")
    .select("*,quotation_items(*)")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[getQuotationById]", error.message);
    return null;
  }
  if (!data) return null;

  if (!canSeeAll) {
    const createdByMe = data.created_by === profile.id;
    if (!createdByMe) {
      const leadIds = await accessibleLeadIds(profile);
      if (!data.lead_id || !leadIds.includes(data.lead_id)) {
        return null;
      }
    }
  }

  return data;
}

export type AcceptedQuotationSummary = {
  id: string;
  quotation_no: string;
  status: string;
  quote_date: string | null;
  grand_total: number;
  module_type_name: string | null;
  module_company_name: string | null;
  module_capacity_label: string | null;
  system_size_kw: number | null;
  panel_count: number | null;
  inverter_company: string | null;
};

/** Latest accepted quotation for a lead (by lead_id, then phone match among visible quotes). */
export async function getAcceptedQuotationForLead(
  leadId: string,
  phone?: string | null
): Promise<AcceptedQuotationSummary | null> {
  const rows = await getQuotationsForLead(leadId, phone);
  const accepted = rows.find((r) => r.status === "accepted");
  if (!accepted) return null;

  const data = await getQuotationById(accepted.id);
  if (!data) return null;

  const items = (data.quotation_items ?? []) as Array<{
    item_name_snapshot?: string | null;
    brand_snapshot?: string | null;
  }>;
  const inverterItem = items.find((item) =>
    (item.item_name_snapshot ?? "").toLowerCase().includes("inverter")
  );

  return {
    id: data.id,
    quotation_no: data.quotation_no,
    status: data.status,
    quote_date: data.quote_date,
    grand_total: Number(data.grand_total ?? 0),
    module_type_name: data.module_type_name,
    module_company_name: data.module_company_name,
    module_capacity_label: data.module_capacity_label,
    system_size_kw: data.system_size_kw != null ? Number(data.system_size_kw) : null,
    panel_count: data.panel_count != null ? Number(data.panel_count) : null,
    inverter_company: inverterItem?.brand_snapshot?.trim() || null,
  };
}
