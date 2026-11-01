"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, hasAuthority } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import {
  GRIEVANCE_CATEGORIES,
  GRIEVANCE_PRIORITIES,
  OPEN_GRIEVANCE_STATUSES,
  type GrievanceStatus,
} from "@/lib/domain/grievances";

async function canView(_profile: { id: string; role: string }) {
  return true;
}

async function canRaise(_profile: { id: string; role: string }) {
  // All staff can raise (revise ┬º6.6); RLS still requires raise_grievance after 026
  return true;
}

/** Managers escalate / resolve per revise ┬º6.6 */
async function canManage(profile: { id: string; role: string }) {
  return (
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    (await hasAuthority(profile.id, "escalate_grievance")) ||
    (await hasAuthority(profile.id, "resolve_grievance")) ||
    (await hasAuthority(profile.id, "full_access"))
  );
}

function revalidateGrievances() {
  revalidatePath("/grievances");
  revalidatePath("/");
}

const raiseSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(5).max(8000),
  category: z.enum(GRIEVANCE_CATEGORIES),
  priority: z.enum(GRIEVANCE_PRIORITIES),
  assignedTo: z.string().uuid().nullable().optional(),
  attachmentUrls: z.array(z.string().min(1)).max(10).optional(),
});

export async function listGrievances() {
  const profile = await requireAuth();
  if (!(await canView(profile))) {
    throw new Error("Missing authority: view_grievances");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("grievances")
    .select(
      `
      *,
      raiser:profiles!grievances_raised_by_fkey(id, name, role),
      assignee:profiles!grievances_assigned_to_fkey(id, name, role),
      attachments:grievance_attachments(id, file_url, caption, created_at)
    `
    )
    .eq("company_id", profile.company_id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listGrievanceAssignees() {
  const profile = await requireAuth();
  if (!(await canView(profile))) {
    throw new Error("Missing authority: view_grievances");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, role")
    .eq("company_id", profile.company_id)
    .eq("is_active", true)
    .order("name");

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function raiseGrievance(input: z.infer<typeof raiseSchema>) {
  const profile = await requireAuth();
  if (!(await canRaise(profile))) {
    throw new Error("Missing authority: raise_grievance");
  }

  const parsed = raiseSchema.parse(input);
  const supabase = await createClient();

  if (parsed.assignedTo) {
    const { data: assignee } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", parsed.assignedTo)
      .eq("company_id", profile.company_id)
      .eq("is_active", true)
      .maybeSingle();
    if (!assignee) throw new Error("Assignee not found");
  }

  const { data: row, error } = await supabase
    .from("grievances")
    .insert({
      company_id: profile.company_id,
      title: parsed.title,
      description: parsed.description,
      category: parsed.category,
      priority: parsed.priority,
      status: "open",
      raised_by: profile.id,
      assigned_to: parsed.assignedTo ?? null,
    })
    .select("id")
    .single();

  if (error || !row) throw new Error(error?.message ?? "Failed to raise grievance");

  const urls = (parsed.attachmentUrls ?? []).map((u) => u.trim()).filter(Boolean);
  if (urls.length > 0) {
    const { error: attError } = await supabase.from("grievance_attachments").insert(
      urls.map((file_url) => ({
        company_id: profile.company_id,
        grievance_id: row.id,
        file_url,
        uploaded_by: profile.id,
      }))
    );
    if (attError) throw new Error(attError.message);
  }

  await logAuditEvent({
    companyId: profile.company_id,
    actorId: profile.id,
    eventType: "grievance_raised",
    entityType: "grievance",
    entityId: row.id,
    metadata: {
      category: parsed.category,
      priority: parsed.priority,
      attachmentCount: urls.length,
    },
  });

  revalidateGrievances();
  return { ok: true as const, id: row.id };
}

export async function startGrievance(grievanceId: string) {
  const profile = await requireAuth();
  if (!(await canView(profile))) {
    throw new Error("Missing authority: view_grievances");
  }

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("grievances")
    .select("id, status, raised_by, assigned_to")
    .eq("id", grievanceId)
    .eq("company_id", profile.company_id)
    .single();

  if (error || !row) throw new Error("Grievance not found");
  if (row.status !== "open" && row.status !== "escalated") {
    throw new Error("Only open or escalated grievances can be started");
  }

  const manager = await canManage(profile);
  const isParty =
    row.assigned_to === profile.id || row.raised_by === profile.id;
  if (!manager && !isParty) {
    throw new Error("Only the assignee, raiser, or a manager can start work");
  }

  const { error: updError } = await supabase
    .from("grievances")
    .update({
      status: "in_progress" satisfies GrievanceStatus,
      assigned_to: row.assigned_to ?? profile.id,
    })
    .eq("id", grievanceId)
    .eq("company_id", profile.company_id);

  if (updError) throw new Error(updError.message);

  await logAuditEvent({
    companyId: profile.company_id,
    actorId: profile.id,
    eventType: "grievance_started",
    entityType: "grievance",
    entityId: grievanceId,
  });

  revalidateGrievances();
  return { ok: true as const };
}

export async function escalateGrievance(input: {
  grievanceId: string;
  assignedTo?: string | null;
  note?: string;
}) {
  const profile = await requireAuth();
  if (!(await canManage(profile))) {
    throw new Error("Missing authority: escalate_grievance");
  }

  const parsed = z
    .object({
      grievanceId: z.string().uuid(),
      assignedTo: z.string().uuid().nullable().optional(),
      note: z.string().trim().max(2000).optional(),
    })
    .parse(input);

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("grievances")
    .select("id, status, resolution_notes")
    .eq("id", parsed.grievanceId)
    .eq("company_id", profile.company_id)
    .single();

  if (error || !row) throw new Error("Grievance not found");
  if (row.status === "resolved") {
    throw new Error("Resolved grievances cannot be escalated");
  }

  const note = parsed.note?.trim();
  const patch: Record<string, unknown> = {
    status: "escalated" satisfies GrievanceStatus,
    escalated_at: new Date().toISOString(),
  };
  if (parsed.assignedTo !== undefined) {
    patch.assigned_to = parsed.assignedTo;
  }
  if (note) {
    patch.resolution_notes = [row.resolution_notes, `Escalation: ${note}`]
      .filter(Boolean)
      .join("\n");
  }

  const { error: updError } = await supabase
    .from("grievances")
    .update(patch)
    .eq("id", parsed.grievanceId)
    .eq("company_id", profile.company_id);

  if (updError) throw new Error(updError.message);

  await logAuditEvent({
    companyId: profile.company_id,
    actorId: profile.id,
    eventType: "grievance_escalated",
    entityType: "grievance",
    entityId: parsed.grievanceId,
    metadata: { assignedTo: parsed.assignedTo ?? null },
  });

  revalidateGrievances();
  return { ok: true as const };
}

export async function resolveGrievance(input: {
  grievanceId: string;
  resolutionNotes: string;
}) {
  const profile = await requireAuth();
  if (!(await canManage(profile))) {
    throw new Error("Missing authority: resolve_grievance");
  }

  const parsed = z
    .object({
      grievanceId: z.string().uuid(),
      resolutionNotes: z.string().trim().min(3).max(4000),
    })
    .parse(input);

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("grievances")
    .select("id, status")
    .eq("id", parsed.grievanceId)
    .eq("company_id", profile.company_id)
    .single();

  if (error || !row) throw new Error("Grievance not found");
  if (row.status === "resolved") throw new Error("Already resolved");

  const { error: updError } = await supabase
    .from("grievances")
    .update({
      status: "resolved" satisfies GrievanceStatus,
      resolution_notes: parsed.resolutionNotes,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", parsed.grievanceId)
    .eq("company_id", profile.company_id);

  if (updError) throw new Error(updError.message);

  await logAuditEvent({
    companyId: profile.company_id,
    actorId: profile.id,
    eventType: "grievance_resolved",
    entityType: "grievance",
    entityId: parsed.grievanceId,
  });

  revalidateGrievances();
  return { ok: true as const };
}

export async function assignGrievance(input: {
  grievanceId: string;
  assignedTo: string | null;
}) {
  const profile = await requireAuth();
  if (!(await canManage(profile))) {
    throw new Error("Missing authority: escalate_grievance");
  }

  const parsed = z
    .object({
      grievanceId: z.string().uuid(),
      assignedTo: z.string().uuid().nullable(),
    })
    .parse(input);

  const supabase = await createClient();

  if (parsed.assignedTo) {
    const { data: assignee } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", parsed.assignedTo)
      .eq("company_id", profile.company_id)
      .eq("is_active", true)
      .maybeSingle();
    if (!assignee) throw new Error("Assignee not found");
  }

  const { error } = await supabase
    .from("grievances")
    .update({ assigned_to: parsed.assignedTo })
    .eq("id", parsed.grievanceId)
    .eq("company_id", profile.company_id)
    .neq("status", "resolved");

  if (error) throw new Error(error.message);

  await logAuditEvent({
    companyId: profile.company_id,
    actorId: profile.id,
    eventType: "grievance_assigned",
    entityType: "grievance",
    entityId: parsed.grievanceId,
    metadata: { assignedTo: parsed.assignedTo },
  });

  revalidateGrievances();
  return { ok: true as const };
}

export async function addGrievanceAttachment(input: {
  grievanceId: string;
  fileUrl: string;
  caption?: string;
}) {
  const profile = await requireAuth();
  if (!(await canRaise(profile)) && !(await canManage(profile))) {
    throw new Error("Missing authority to attach files");
  }

  const parsed = z
    .object({
      grievanceId: z.string().uuid(),
      fileUrl: z.string().min(1),
      caption: z.string().trim().max(200).optional(),
    })
    .parse(input);

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("grievances")
    .select("id, status")
    .eq("id", parsed.grievanceId)
    .eq("company_id", profile.company_id)
    .single();

  if (error || !row) throw new Error("Grievance not found");
  if (row.status === "resolved") {
    throw new Error("Cannot attach files to a resolved grievance");
  }

  const { error: insError } = await supabase.from("grievance_attachments").insert({
    company_id: profile.company_id,
    grievance_id: parsed.grievanceId,
    file_url: parsed.fileUrl,
    caption: parsed.caption ?? null,
    uploaded_by: profile.id,
  });
  if (insError) throw new Error(insError.message);

  revalidateGrievances();
  return { ok: true as const };
}

export async function countOpenGrievances(companyId: string) {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("grievances")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .in("status", [...OPEN_GRIEVANCE_STATUSES]);

  if (error) {
    if (
      error.message.includes("grievances") ||
      error.message.includes("schema cache") ||
      error.message.includes("does not exist")
    ) {
      return 0;
    }
    throw new Error(error.message);
  }
  return count ?? 0;
}

/** Exported for page capability flags */
export async function grievanceCapabilities(profile: {
  id: string;
  role: string;
}) {
  return {
    canView: await canView(profile),
    canRaise: await canRaise(profile),
    canManage: await canManage(profile),
  };
}
