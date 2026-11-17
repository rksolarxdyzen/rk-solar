"use server";

import { revalidatePath } from "next/cache";
import { canViewAdSubmissions } from "@/lib/ads/access";
import type { AdCampaignSubmission, AdSubmissionStatus } from "@/lib/ads/types";
import { AD_SUBMISSION_STATUSES } from "@/lib/ads/types";
import { getSession, requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type AdInboxFilters = {
  status?: string;
  q?: string;
  from?: string;
  to?: string;
};

export async function listAdSubmissions(
  filters: AdInboxFilters = {}
): Promise<AdCampaignSubmission[]> {
  const session = await getSession();
  if (!session || !canViewAdSubmissions(session.authorities)) {
    throw new Error("Missing authority: view_ad_submissions");
  }

  const supabase = await createClient();
  let query = supabase
    .from("ad_campaign_submissions")
    .select("*")
    .eq("company_id", session.profile.company_id)
    .order("created_at", { ascending: false })
    .limit(500);

  if (filters.status && AD_SUBMISSION_STATUSES.includes(filters.status as AdSubmissionStatus)) {
    query = query.eq("status", filters.status);
  }
  if (filters.from) query = query.gte("created_at", `${filters.from}T00:00:00.000Z`);
  if (filters.to) query = query.lte("created_at", `${filters.to}T23:59:59.999Z`);
  if (filters.q?.trim()) {
    const q = filters.q.trim().replace(/[%_]/g, "");
    query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%,city.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as AdCampaignSubmission[];
}

export async function updateAdSubmissionStatus(id: string, status: AdSubmissionStatus) {
  const session = await getSession();
  if (!session || !canViewAdSubmissions(session.authorities)) {
    throw new Error("Missing authority: view_ad_submissions");
  }
  if (!AD_SUBMISSION_STATUSES.includes(status)) {
    throw new Error("Invalid status");
  }

  await requireAuth();
  const supabase = await createClient();
  const patch: Record<string, unknown> = { status };
  if (status === "contacted") patch.contacted_at = new Date().toISOString();
  if (status === "new") patch.contacted_at = null;

  const { error } = await supabase
    .from("ad_campaign_submissions")
    .update(patch)
    .eq("id", id)
    .eq("company_id", session.profile.company_id);

  if (error) throw new Error(error.message);
  revalidatePath("/ads");
}
