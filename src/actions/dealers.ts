"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, hasAuthority } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { isDealerRole } from "@/lib/domain/dealers";
import {
  assertProfileInPool,
  listProfilesInPool,
} from "@/lib/assignment-pool-profiles";

async function canSubmit(profile: { id: string; role: string }) {
  return (
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    profile.role === "accounts" ||
    isDealerRole(profile) ||
    (await hasAuthority(profile.id, "submit_dealer_commission")) ||
    (await hasAuthority(profile.id, "full_access"))
  );
}

async function canApprove(profile: { id: string; role: string }) {
  return (
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    profile.role === "accounts" ||
    (await hasAuthority(profile.id, "approve_dealer_commission")) ||
    (await hasAuthority(profile.id, "full_access"))
  );
}

async function canAssignDealer(profile: { id: string; role: string }) {
  return (
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    (await hasAuthority(profile.id, "assign_dealer")) ||
    (await hasAuthority(profile.id, "full_access"))
  );
}

function revalidateCommissionPaths(leadId?: string) {
  revalidatePath("/liaison");
  revalidatePath("/customers");
  revalidatePath("/pipeline");
  revalidatePath("/dealers");
  revalidatePath("/");
  if (leadId) revalidatePath(`/leads/${leadId}`);
}

async function canViewDealerDirectory(profile: { id: string; role: string }) {
  return (
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    profile.role === "accounts" ||
    isDealerRole(profile) ||
    (await hasAuthority(profile.id, "assign_dealer")) ||
    (await hasAuthority(profile.id, "approve_dealer_commission")) ||
    (await hasAuthority(profile.id, "submit_dealer_commission")) ||
    (await hasAuthority(profile.id, "full_access"))
  );
}

export async function listDealers() {
  const profile = await requireAuth();
  const supabase = await createClient();
  try {
    return await listProfilesInPool(supabase, profile.company_id, "dealer");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (/invalid input value for enum user_role|dealer/i.test(msg)) {
      throw new Error(
        "Dealer role not applied. Run supabase/migrations/027_dealer_role.sql and 028_dealer_commissions.sql."
      );
    }
    throw error;
  }
}

export type DealerDirectoryRow = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  is_active: boolean;
  created_at: string;
  filesLinked: number;
  filesCompleted: number;
  commissionsPending: number;
  commissionsApproved: number;
  approvedAmountInr: number;
  /** Pre-dispatch verified + commission not yet approved */
  shortlyDueInr: number;
  /** Approved commissions reviewed this calendar month */
  paidThisMonthInr: number;
};

export async function listDealerDirectory(): Promise<DealerDirectoryRow[]> {
  const profile = await requireAuth();
  if (!(await canViewDealerDirectory(profile))) {
    throw new Error("Missing authority to view dealers");
  }

  const supabase = await createClient();
  let rows: Awaited<ReturnType<typeof listProfilesInPool>>;
  try {
    rows = await listProfilesInPool(supabase, profile.company_id, "dealer");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (/invalid input value for enum user_role|dealer/i.test(msg)) {
      throw new Error(
        "Dealer role not applied. Run supabase/migrations/027_dealer_role.sql and 028_dealer_commissions.sql."
      );
    }
    throw error;
  }

  if (isDealerRole(profile)) {
    rows = rows.filter((d) => d.id === profile.id);
  }
  if (rows.length === 0) return [];

  const ids = rows.map((d) => d.id);

  const { data: leads, error: leadsError } = await supabase
    .from("leads")
    .select("id, dealer_id, sales_stage")
    .eq("company_id", profile.company_id)
    .in("dealer_id", ids);

  if (leadsError && /dealer_id|column .* does not exist/i.test(leadsError.message)) {
    throw new Error(
      "Database is missing dealer columns. Run supabase/migrations/027_dealer_role.sql and 028_dealer_commissions.sql."
    );
  }
  if (leadsError) throw new Error(leadsError.message);

  const { data: commissions } = await supabase
    .from("dealer_commissions")
    .select("id, dealer_id, lead_id, status, amount_inr, reviewed_at")
    .eq("company_id", profile.company_id)
    .in("dealer_id", ids);

  const { data: pdPays } = await supabase
    .from("payments")
    .select("lead_id")
    .eq("company_id", profile.company_id)
    .eq("milestone", "pre_dispatch")
    .eq("verification_status", "verified");

  const pdVerifiedLeads = new Set((pdPays ?? []).map((p) => p.lead_id));

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  ).toISOString();

  return rows.map((d) => {
    const dealerLeads = (leads ?? []).filter((l) => l.dealer_id === d.id);
    const dealerCommissions = (commissions ?? []).filter((c) => c.dealer_id === d.id);
    const approved = dealerCommissions.filter((c) => c.status === "approved");
    const commissionByLead = new Map(dealerCommissions.map((c) => [c.lead_id, c]));

    let shortlyDueInr = 0;
    for (const lead of dealerLeads) {
      if (!pdVerifiedLeads.has(lead.id)) continue;
      const c = commissionByLead.get(lead.id);
      if (!c || c.status === "pending") {
        shortlyDueInr += Number(c?.amount_inr) || 0;
      }
    }

    const paidThisMonthInr = approved
      .filter(
        (c) =>
          c.reviewed_at && c.reviewed_at >= monthStart && c.reviewed_at <= monthEnd
      )
      .reduce((sum, c) => sum + (Number(c.amount_inr) || 0), 0);

    return {
      id: d.id,
      name: d.name,
      phone: d.phone ?? "",
      email: d.email ?? null,
      is_active: d.is_active ?? true,
      created_at: d.created_at ?? "",
      filesLinked: dealerLeads.length,
      filesCompleted: dealerLeads.filter((l) => l.sales_stage === "completed").length,
      commissionsPending: dealerCommissions.filter((c) => c.status === "pending").length,
      commissionsApproved: approved.length,
      approvedAmountInr: approved.reduce(
        (sum, c) => sum + (Number(c.amount_inr) || 0),
        0
      ),
      shortlyDueInr,
      paidThisMonthInr,
    };
  });
}

export type DealerDetailFile = {
  id: string;
  name: string;
  phone: string;
  city: string | null;
  sales_stage: string;
  portal_code: string | null;
  created_at: string;
  won_closed_at?: string | null;
};

export type DealerDetailCommission = {
  id: string;
  lead_id: string;
  amount_inr: number | null;
  percent: number | null;
  notes: string | null;
  status: string;
  submitted_at: string;
  reviewed_at: string | null;
  review_notes: string | null;
  lead?: { id: string; name: string; phone: string } | null;
};

export async function getDealerDetail(
  dealerId: string,
  opts?: { from?: string | null; to?: string | null }
) {
  const profile = await requireAuth();
  if (!(await canViewDealerDirectory(profile))) {
    throw new Error("Missing authority to view dealers");
  }

  if (isDealerRole(profile) && dealerId !== profile.id) {
    throw new Error("Dealers may only view their own profile");
  }

  const supabase = await createClient();
  const { data: dealer, error } = await supabase
    .from("profiles")
    .select("id, name, phone, email, is_active, created_at, role")
    .eq("id", dealerId)
    .eq("company_id", profile.company_id)
    .eq("role", "dealer")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!dealer) throw new Error("Dealer not found");

  let filesQuery = supabase
    .from("leads")
    .select(
      "id, name, phone, city, sales_stage, portal_code, created_at, won_closed_at"
    )
    .eq("company_id", profile.company_id)
    .eq("dealer_id", dealerId)
    .order("updated_at", { ascending: false });

  const from = opts?.from?.trim() || null;
  const to = opts?.to?.trim() || null;
  if (from) filesQuery = filesQuery.gte("created_at", `${from}T00:00:00.000Z`);
  if (to) filesQuery = filesQuery.lte("created_at", `${to}T23:59:59.999Z`);

  const { data: files, error: filesError } = await filesQuery;

  if (filesError) throw new Error(filesError.message);

  const { data: commissions, error: commissionsError } = await supabase
    .from("dealer_commissions")
    .select(
      `
      id, lead_id, amount_inr, percent, notes, status, submitted_at, reviewed_at, review_notes,
      lead:leads!dealer_commissions_lead_id_fkey(id, name, phone)
    `
    )
    .eq("company_id", profile.company_id)
    .eq("dealer_id", dealerId)
    .order("submitted_at", { ascending: false });

  if (commissionsError && !/does not exist|schema cache/i.test(commissionsError.message)) {
    throw new Error(commissionsError.message);
  }

  const commissionRows = (commissions ?? []).map((c) => {
    const leadRel = c.lead;
    const lead = Array.isArray(leadRel) ? leadRel[0] ?? null : leadRel;
    return {
      id: c.id,
      lead_id: c.lead_id,
      amount_inr: c.amount_inr != null ? Number(c.amount_inr) : null,
      percent: c.percent != null ? Number(c.percent) : null,
      notes: c.notes,
      status: c.status,
      submitted_at: c.submitted_at,
      reviewed_at: c.reviewed_at,
      review_notes: c.review_notes,
      lead,
    } satisfies DealerDetailCommission;
  });

  const fileIds = new Set((files ?? []).map((f) => f.id));
  const { data: pdPays } = await supabase
    .from("payments")
    .select("lead_id")
    .eq("company_id", profile.company_id)
    .eq("milestone", "pre_dispatch")
    .eq("verification_status", "verified")
    .in(
      "lead_id",
      fileIds.size > 0 ? [...fileIds] : ["00000000-0000-0000-0000-000000000000"]
    );

  const pdSet = new Set((pdPays ?? []).map((p) => p.lead_id));
  const commissionByLead = new Map(commissionRows.map((c) => [c.lead_id, c]));

  let shortlyDueInr = 0;
  for (const f of files ?? []) {
    if (!pdSet.has(f.id)) continue;
    const c = commissionByLead.get(f.id);
    if (!c || c.status === "pending") {
      shortlyDueInr += Number(c?.amount_inr) || 0;
    }
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  ).toISOString();

  const paidAllTime = commissionRows
    .filter((c) => c.status === "approved")
    .reduce((s, c) => s + (Number(c.amount_inr) || 0), 0);
  const paidThisMonthInr = commissionRows
    .filter(
      (c) =>
        c.status === "approved" &&
        c.reviewed_at &&
        c.reviewed_at >= monthStart &&
        c.reviewed_at <= monthEnd
    )
    .reduce((s, c) => s + (Number(c.amount_inr) || 0), 0);

  return {
    dealer,
    files: (files ?? []) as DealerDetailFile[],
    commissions: commissionRows,
    totals: {
      filesInRange: (files ?? []).length,
      paidAllTime,
      paidThisMonthInr,
      shortlyDueInr,
    },
  };
}

export async function assignLeadDealer(input: {
  leadId: string;
  dealerId: string | null;
}) {
  const profile = await requireAuth();
  if (!(await canAssignDealer(profile))) {
    throw new Error("Missing authority: assign_dealer");
  }

  const parsed = z
    .object({
      leadId: z.string().uuid(),
      dealerId: z.string().uuid().nullable(),
    })
    .parse(input);

  const supabase = await createClient();

  if (parsed.dealerId) {
    await assertProfileInPool(
      supabase,
      profile.company_id,
      parsed.dealerId,
      "dealer",
      "Selected user is not in the Dealer assignment list"
    );
  }

  const { error } = await supabase
    .from("leads")
    .update({ dealer_id: parsed.dealerId })
    .eq("id", parsed.leadId)
    .eq("company_id", profile.company_id);

  if (error) {
    if (/dealer_id|column .* does not exist/i.test(error.message)) {
      throw new Error(
        "Database is missing dealer columns. Run supabase/migrations/027_dealer_role.sql and 028_dealer_commissions.sql."
      );
    }
    throw new Error(error.message);
  }

  await logAuditEvent({
    companyId: profile.company_id,
    leadId: parsed.leadId,
    actorId: profile.id,
    eventType: "dealer_assigned",
    entityType: "lead",
    entityId: parsed.leadId,
    metadata: { dealerId: parsed.dealerId },
  });

  revalidateCommissionPaths(parsed.leadId);
  return { ok: true as const };
}

export async function getDealerCommission(leadId: string) {
  const profile = await requireAuth();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dealer_commissions")
    .select(
      `
      *,
      dealer:profiles!dealer_commissions_dealer_id_fkey(id, name),
      submitter:profiles!dealer_commissions_submitted_by_fkey(id, name),
      reviewer:profiles!dealer_commissions_reviewed_by_fkey(id, name)
    `
    )
    .eq("lead_id", leadId)
    .eq("company_id", profile.company_id)
    .maybeSingle();

  if (error) {
    if (
      error.message.includes("dealer_commissions") ||
      error.message.includes("schema cache") ||
      error.message.includes("does not exist")
    ) {
      return null;
    }
    throw new Error(error.message);
  }
  return data;
}

export async function submitDealerCommission(input: {
  leadId: string;
  amountInr?: number | null;
  percent?: number | null;
  notes?: string;
}) {
  const profile = await requireAuth();
  if (!(await canSubmit(profile))) {
    throw new Error("Missing authority: submit_dealer_commission");
  }

  const parsed = z
    .object({
      leadId: z.string().uuid(),
      amountInr: z.number().min(0).nullable().optional(),
      percent: z.number().min(0).max(100).nullable().optional(),
      notes: z.string().trim().max(4000).optional(),
    })
    .parse(input);

  const amount =
    parsed.amountInr === undefined || parsed.amountInr === null
      ? null
      : Number(parsed.amountInr);
  const percent =
    parsed.percent === undefined || parsed.percent === null
      ? null
      : Number(parsed.percent);

  if (amount == null && percent == null) {
    throw new Error("Enter a commission amount (₹) and/or percent (%)");
  }

  const supabase = await createClient();
  const { data: lead, error } = await supabase
    .from("leads")
    .select("id, company_id, sales_stage, dealer_id, name")
    .eq("id", parsed.leadId)
    .eq("company_id", profile.company_id)
    .single();

  if (error || !lead) throw new Error("Lead not found");
  if (lead.sales_stage !== "completed") {
    throw new Error("Commission form is only available after the file is completed");
  }
  if (!lead.dealer_id) {
    throw new Error("Assign a dealer on this file before submitting commission");
  }

  if (isDealerRole(profile) && lead.dealer_id !== profile.id) {
    throw new Error("Dealers may only submit commission on their own files");
  }

  const { data: existing } = await supabase
    .from("dealer_commissions")
    .select("id, status")
    .eq("lead_id", lead.id)
    .maybeSingle();

  if (existing?.status === "approved") {
    throw new Error("Commission already approved — cannot resubmit");
  }

  const payload = {
    company_id: profile.company_id,
    lead_id: lead.id,
    dealer_id: lead.dealer_id,
    amount_inr: amount,
    percent,
    notes: parsed.notes?.trim() || null,
    status: "pending" as const,
    submitted_by: profile.id,
    submitted_at: new Date().toISOString(),
    reviewed_by: null,
    reviewed_at: null,
    review_notes: null,
  };

  if (existing) {
    const { error: updError } = await supabase
      .from("dealer_commissions")
      .update(payload)
      .eq("id", existing.id)
      .eq("company_id", profile.company_id);
    if (updError) throw new Error(updError.message);
  } else {
    const { error: insError } = await supabase
      .from("dealer_commissions")
      .insert(payload);
    if (insError) throw new Error(insError.message);
  }

  await logAuditEvent({
    companyId: profile.company_id,
    leadId: lead.id,
    actorId: profile.id,
    eventType: "dealer_commission_submitted",
    entityType: "dealer_commission",
    entityId: lead.id,
    metadata: { amount, percent },
  });

  revalidateCommissionPaths(lead.id);
  return { ok: true as const };
}

export async function reviewDealerCommission(input: {
  leadId: string;
  decision: "approved" | "rejected";
  reviewNotes?: string;
}) {
  const profile = await requireAuth();
  if (!(await canApprove(profile))) {
    throw new Error("Missing authority: approve_dealer_commission");
  }

  const parsed = z
    .object({
      leadId: z.string().uuid(),
      decision: z.enum(["approved", "rejected"]),
      reviewNotes: z.string().trim().max(2000).optional(),
    })
    .parse(input);

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("dealer_commissions")
    .select("id, status")
    .eq("lead_id", parsed.leadId)
    .eq("company_id", profile.company_id)
    .maybeSingle();

  if (error || !row) throw new Error("Commission form not found");
  if (row.status !== "pending") {
    throw new Error("Only pending commissions can be reviewed");
  }

  const { error: updError } = await supabase
    .from("dealer_commissions")
    .update({
      status: parsed.decision,
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
      review_notes: parsed.reviewNotes?.trim() || null,
    })
    .eq("id", row.id)
    .eq("company_id", profile.company_id);

  if (updError) throw new Error(updError.message);

  await logAuditEvent({
    companyId: profile.company_id,
    leadId: parsed.leadId,
    actorId: profile.id,
    eventType: `dealer_commission_${parsed.decision}`,
    entityType: "dealer_commission",
    entityId: row.id,
  });

  revalidateCommissionPaths(parsed.leadId);
  return { ok: true as const };
}

export async function dealerCommissionCapabilities(profile: {
  id: string;
  role: string;
}) {
  return {
    canSubmit: await canSubmit(profile),
    canApprove: await canApprove(profile),
    canAssign: await canAssignDealer(profile),
    canViewDirectory: await canViewDealerDirectory(profile),
  };
}
