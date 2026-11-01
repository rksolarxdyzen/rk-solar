"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, requireAuthority, hasAuthority } from "@/lib/auth";
import { getAppUrl } from "@/lib/env";
import { ingestLead } from "@/lib/ingest/create-lead";
import { LEAD_SOURCE_LABELS, type LeadSource } from "@/lib/domain/workflow";
import { canSeeAllLeads } from "@/lib/leads/visibility-server";

export async function createStaffReferralLead(input: {
  name: string;
  phone: string;
  email?: string;
  city?: string;
  address?: string;
  requirement?: string;
  referrerName?: string;
  referrerPhone?: string;
}) {
  const profile = await requireAuthority("add_edit_leads");
  const result = await ingestLead({
    companyId: profile.company_id,
    source: "referral",
    name: input.name,
    phone: input.phone,
    email: input.email || null,
    city: input.city || null,
    address: input.address || null,
    requirementNotes: input.requirement || null,
    sourceDetail: "staff_referral_entry",
    referrerName: input.referrerName || null,
    referrerPhone: input.referrerPhone || null,
    payload: { via: "staff_form", createdBy: profile.id },
  });

  if (result.status === "error") throw new Error(result.message);

  revalidatePath("/pipeline");
  revalidatePath("/ingest");
  return result;
}

export async function listReferralLinks() {
  const profile = await requireAuthority("import_leads");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("referral_links")
    .select("id, code, label, is_active, created_at")
    .eq("company_id", profile.company_id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const base = getAppUrl() ?? "";
  return (data ?? []).map((row) => ({
    ...row,
    url: `${base}/r/${row.code}`,
  }));
}

export async function createReferralLink(label: string, code?: string) {
  const profile = await requireAuthority("import_leads");
  const supabase = await createClient();
  const slug =
    code?.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-") ||
    `ref-${Math.random().toString(36).slice(2, 8)}`;

  const { data, error } = await supabase
    .from("referral_links")
    .insert({
      company_id: profile.company_id,
      code: slug,
      label: label.trim() || slug,
      created_by: profile.id,
      is_active: true,
    })
    .select("id, code, label")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/ingest");
  const base = getAppUrl() ?? "";
  return { ...data, url: `${base}/r/${data.code}` };
}

export async function listRecentIngestEvents(limit = 30) {
  const profile = await requireAuthority("import_leads");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead_ingest_events")
    .select("id, channel, external_id, status, error_message, lead_id, created_at")
    .eq("company_id", profile.company_id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export type SourceStat = {
  source: LeadSource | string;
  label: string;
  total: number;
  active: number;
  lost: number;
  surveyCompleted: number;
};

export async function getLeadSourceStats(): Promise<SourceStat[]> {
  const profile = await requireAuth();
  // Company-wide source totals — not for assigned-only sales (import alone is not enough).
  const can =
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    (await hasAuthority(profile.id, "view_reports")) ||
    (await hasAuthority(profile.id, "full_access")) ||
    (await canSeeAllLeads(profile));

  if (!can) throw new Error("Missing authority to view source analytics");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select("source, sales_stage")
    .eq("company_id", profile.company_id);

  if (error) throw new Error(error.message);

  const map = new Map<string, SourceStat>();
  for (const row of data ?? []) {
    const source = row.source as string;
    const cur =
      map.get(source) ??
      ({
        source,
        label: LEAD_SOURCE_LABELS[source as LeadSource] ?? source,
        total: 0,
        active: 0,
        lost: 0,
        surveyCompleted: 0,
      } satisfies SourceStat);

    cur.total += 1;
    if (row.sales_stage === "lost") cur.lost += 1;
    else cur.active += 1;
    if (row.sales_stage === "survey_completed") cur.surveyCompleted += 1;
    map.set(source, cur);
  }

  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}
