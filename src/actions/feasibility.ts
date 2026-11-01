"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, hasAuthority } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { advanceTokenGatesIfReady } from "@/actions/payments";
import type { FeasibilityReport } from "@/lib/domain/payments";
import { CUSTOMER_SALES_STAGES, isWonOrLaterStage } from "@/lib/domain/workflow";
import { proofsStoragePathFromUrl } from "@/lib/storage-url";

const submitSchema = z.object({
  leadId: z.string().uuid(),
  title: z.string().min(2),
  notes: z.string().optional().nullable(),
  fileUrl: z.string().min(8, "Upload a feasibility report (PDF or image)"),
  storagePath: z.string().optional().nullable(),
});

async function canUpload(profile: { id: string; role: string }) {
  return (
    profile.role === "admin" ||
    profile.role === "feasibility" ||
    profile.role === "liaison" ||
    profile.role === "sales_manager" ||
    (await hasAuthority(profile.id, "upload_feasibility_report")) ||
    (await hasAuthority(profile.id, "manage_liaison")) ||
    (await hasAuthority(profile.id, "full_access"))
  );
}

async function canApprove(profile: { id: string; role: string }) {
  return (
    profile.role === "admin" ||
    profile.role === "feasibility" ||
    (await hasAuthority(profile.id, "approve_feasibility_report")) ||
    (await hasAuthority(profile.id, "full_access"))
  );
}

function assertFeasibilityFile(fileUrl: string, storagePath: string | null) {
  const path = (storagePath || proofsStoragePathFromUrl(fileUrl) || fileUrl).toLowerCase();
  const ok =
    /\.(pdf|jpe?g|png|webp)(\?|$)/i.test(path) ||
    path.includes(".pdf?") ||
    path.includes(".jpg?") ||
    path.includes(".jpeg?") ||
    path.includes(".png?") ||
    path.includes(".webp?");
  if (!ok) {
    throw new Error("Upload a feasibility report as PDF, JPG, PNG, or WebP");
  }
}

function revalidateDocs(leadId?: string) {
  revalidatePath("/liaison");
  revalidatePath("/documentation");
  revalidatePath("/feasibility");
  revalidatePath("/payments");
  revalidatePath("/pipeline");
  revalidatePath("/customers");
  if (leadId) revalidatePath(`/leads/${leadId}`);
}

export async function listFeasibilityForLead(leadId: string) {
  await requireAuth();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feasibility_reports")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as FeasibilityReport[];
}

export type PreInstallQueueItem = {
  id: string;
  company_id: string;
  name: string;
  phone: string;
  city: string | null;
  sales_stage: string;
  portal_code: string | null;
  feasibility_approved: boolean;
  token_verified: boolean;
};

/** Won+ files still missing a stored feasibility PDF. */
export async function listPreInstallFeasibilityQueue(): Promise<PreInstallQueueItem[]> {
  const profile = await requireAuth();
  const can =
    (await canUpload(profile)) ||
    (await hasAuthority(profile.id, "view_payment_queues")) ||
    (await hasAuthority(profile.id, "manage_liaison"));
  if (!can) throw new Error("Missing authority: upload_feasibility_report");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select(
      "id, company_id, name, phone, city, sales_stage, portal_code, feasibility_approved, token_verified"
    )
    .eq("company_id", profile.company_id)
    .eq("feasibility_approved", false)
    .in("sales_stage", [...CUSTOMER_SALES_STAGES])
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as PreInstallQueueItem[];
}

export async function listFeasibilityQueue(filter: "pending" | "all" = "pending") {
  const profile = await requireAuth();
  const can =
    (await canUpload(profile)) ||
    (await canApprove(profile)) ||
    (await hasAuthority(profile.id, "view_payment_queues"));
  if (!can) throw new Error("Missing authority: view_payment_queues");

  const supabase = await createClient();
  let q = supabase
    .from("feasibility_reports")
    .select(
      "*, lead:leads!feasibility_reports_lead_id_fkey(id, name, phone, city, sales_stage, token_verified, feasibility_approved)"
    )
    .eq("company_id", profile.company_id)
    .order("created_at", { ascending: false });

  if (filter === "pending") q = q.eq("status", "submitted");

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function submitFeasibilityReport(input: z.infer<typeof submitSchema>) {
  const profile = await requireAuth();
  if (!(await canUpload(profile))) {
    throw new Error("Missing authority: upload_feasibility_report");
  }

  const parsed = submitSchema.parse({
    ...input,
    title: input.title?.trim() || "Grid Feasibility Report",
  });

  const storagePath =
    parsed.storagePath?.trim() || proofsStoragePathFromUrl(parsed.fileUrl);

  assertFeasibilityFile(parsed.fileUrl, storagePath);

  const supabase = await createClient();
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, sales_stage, company_id, feasibility_approved")
    .eq("id", parsed.leadId)
    .eq("company_id", profile.company_id)
    .single();

  if (leadError || !lead) throw new Error("Lead not found");

  if (!isWonOrLaterStage(lead.sales_stage)) {
    throw new Error("Feasibility PDF can be uploaded after the file is Won");
  }

  const now = new Date().toISOString();
  const row = {
    company_id: profile.company_id,
    lead_id: lead.id,
    title: parsed.title || "Grid Feasibility Report",
    notes: parsed.notes ?? null,
    file_url: parsed.fileUrl,
    storage_path: storagePath,
    status: "approved" as const,
    uploaded_by: profile.id,
    approved_by: profile.id,
    approved_at: now,
    rejection_reason: null,
  };

  const { data: existing } = await supabase
    .from("feasibility_reports")
    .select("id")
    .eq("lead_id", lead.id)
    .eq("company_id", profile.company_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const replacing = Boolean(existing?.id);
  let reportId: string;

  async function insertWithoutStoragePath() {
    const { storage_path: _omit, ...rest } = row;
    void _omit;
    const retry = await supabase
      .from("feasibility_reports")
      .insert(rest)
      .select("*")
      .single();
    if (retry.error || !retry.data) {
      throw new Error(retry.error?.message ?? "Could not save file — retry");
    }
    return retry.data as FeasibilityReport;
  }

  if (existing?.id) {
    const { data, error } = await supabase
      .from("feasibility_reports")
      .update({
        title: row.title,
        notes: row.notes,
        file_url: row.file_url,
        storage_path: row.storage_path,
        status: row.status,
        uploaded_by: row.uploaded_by,
        approved_by: row.approved_by,
        approved_at: row.approved_at,
        rejection_reason: null,
      })
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) {
      if (/storage_path/i.test(error.message)) {
        const fallback = await supabase
          .from("feasibility_reports")
          .update({
            title: row.title,
            notes: row.notes,
            file_url: row.file_url,
            status: row.status,
            uploaded_by: row.uploaded_by,
            approved_by: row.approved_by,
            approved_at: row.approved_at,
            rejection_reason: null,
          })
          .eq("id", existing.id)
          .select("*")
          .single();
        if (fallback.error || !fallback.data) {
          throw new Error(fallback.error?.message ?? "Could not save file — retry");
        }
        reportId = fallback.data.id;
      } else {
        throw new Error(
          /rls|permission|policy/i.test(error.message)
            ? "Could not save file — retry"
            : error.message
        );
      }
    } else {
      reportId = data.id;
    }
  } else {
    const { data, error } = await supabase
      .from("feasibility_reports")
      .insert(row)
      .select("*")
      .single();

    if (error) {
      if (/storage_path/i.test(error.message)) {
        const inserted = await insertWithoutStoragePath();
        reportId = inserted.id;
      } else {
        throw new Error(
          /rls|permission|policy/i.test(error.message)
            ? "Could not save file — retry"
            : error.message
        );
      }
    } else {
      reportId = data.id;
    }
  }

  await supabase
    .from("leads")
    .update({ feasibility_approved: true })
    .eq("id", lead.id);

  await advanceTokenGatesIfReady(profile.company_id, lead.id, profile.id);

  await logAuditEvent({
    companyId: profile.company_id,
    leadId: lead.id,
    actorId: profile.id,
    eventType: replacing ? "feasibility_replaced" : "feasibility_submitted",
    entityType: "feasibility_report",
    entityId: reportId,
    metadata: { title: parsed.title, auto_approved: true },
  });

  revalidateDocs(lead.id);
  const { data: saved } = await supabase
    .from("feasibility_reports")
    .select("*")
    .eq("id", reportId)
    .single();
  return (saved ?? { id: reportId, ...row }) as FeasibilityReport;
}

/** Legacy: keep for rows still in `submitted`. Happy path auto-approves on PDF upload. */
export async function approveFeasibilityReport(reportId: string) {
  const profile = await requireAuth();
  if (!(await canApprove(profile))) {
    throw new Error("Missing authority: approve_feasibility_report");
  }

  const supabase = await createClient();
  const { data: report, error } = await supabase
    .from("feasibility_reports")
    .select("*")
    .eq("id", reportId)
    .eq("company_id", profile.company_id)
    .single();

  if (error || !report) throw new Error("Report not found");
  if (!report.file_url) {
    throw new Error("Cannot approve until a feasibility PDF is uploaded");
  }

  const { error: updError } = await supabase
    .from("feasibility_reports")
    .update({
      status: "approved",
      approved_by: profile.id,
      approved_at: new Date().toISOString(),
      rejection_reason: null,
    })
    .eq("id", reportId);

  if (updError) throw new Error(updError.message);

  await supabase
    .from("leads")
    .update({ feasibility_approved: true })
    .eq("id", report.lead_id);

  await advanceTokenGatesIfReady(profile.company_id, report.lead_id, profile.id);

  await logAuditEvent({
    companyId: profile.company_id,
    leadId: report.lead_id,
    actorId: profile.id,
    eventType: "feasibility_approved",
    entityType: "feasibility_report",
    entityId: reportId,
    metadata: {},
  });

  revalidateDocs(report.lead_id);
  return { ok: true };
}

export async function rejectFeasibilityReport(reportId: string, reason: string) {
  const profile = await requireAuth();
  if (!(await canApprove(profile))) {
    throw new Error("Missing authority: approve_feasibility_report");
  }
  const rejection = reason.trim();
  if (rejection.length < 2) throw new Error("Rejection reason is required");

  const supabase = await createClient();
  const { data: report, error } = await supabase
    .from("feasibility_reports")
    .select("*")
    .eq("id", reportId)
    .eq("company_id", profile.company_id)
    .single();

  if (error || !report) throw new Error("Report not found");

  await supabase
    .from("feasibility_reports")
    .update({
      status: "rejected",
      rejection_reason: rejection,
      approved_by: profile.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", reportId);

  await supabase
    .from("leads")
    .update({ feasibility_approved: false })
    .eq("id", report.lead_id);

  await logAuditEvent({
    companyId: profile.company_id,
    leadId: report.lead_id,
    actorId: profile.id,
    eventType: "feasibility_rejected",
    entityType: "feasibility_report",
    entityId: reportId,
    metadata: { reason: rejection },
  });

  revalidateDocs(report.lead_id);
  return { ok: true };
}
