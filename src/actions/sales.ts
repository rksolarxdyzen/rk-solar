"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import type { ActivityType, CallOutcome } from "@/lib/domain/sales";
import { followupReminderTypeForStage } from "@/lib/domain/reminders";
import { mergeAutoContactedStage } from "@/lib/workflow-rules";

export async function getCallLogs(leadId: string) {
  const profile = await requireAuth();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("call_logs")
    .select("*, user:profiles(id, name)")
    .eq("lead_id", leadId)
    .eq("company_id", profile.company_id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return data ?? [];
}

export async function getLeadActivities(leadId: string) {
  return getCallLogs(leadId);
}

export async function getLeadFollowups(leadId: string) {
  const profile = await requireAuth();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("reminders")
    .select("*")
    .eq("lead_id", leadId)
    .eq("company_id", profile.company_id)
    .in("reminder_type", ["sales_followup", "post_survey_followup"])
    .is("resolved_at", null)
    .order("due_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function logCallWithFollowup(input: {
  leadId: string;
  outcome: CallOutcome;
  notes: string;
  followupAction?: string;
  followupAt?: string;
}) {
  return logLeadActivity({
    leadId: input.leadId,
    activityType: "call",
    notes: input.notes,
    nextAction: input.followupAction,
    nextActionAt: input.followupAt,
    outcome: input.outcome,
  });
}

export async function logLeadActivity(input: {
  leadId: string;
  activityType: ActivityType;
  notes: string;
  nextAction?: string;
  nextActionAt?: string;
  outcome?: CallOutcome | string;
}) {
  const profile = await requireAuth();
  const supabase = await createClient();

  const { data: lead } = await supabase
    .from("leads")
    .select("total_calls, sales_stage")
    .eq("id", input.leadId)
    .single();

  const storedOutcome = input.outcome ?? input.activityType;

  const { data: callLog, error: callError } = await supabase
    .from("call_logs")
    .insert({
      lead_id: input.leadId,
      company_id: profile.company_id,
      user_id: profile.id,
      outcome: storedOutcome,
      notes: input.notes.trim() || null,
    })
    .select()
    .single();

  if (callError) throw new Error(callError.message);

  const leadUpdates: Record<string, unknown> = {
    last_call_at: new Date().toISOString(),
    last_call_notes: input.notes.trim() || null,
    total_calls: (lead?.total_calls ?? 0) + 1,
  };

  const stageAdvanced = mergeAutoContactedStage(lead?.sales_stage, leadUpdates);

  if (input.nextAction?.trim() && input.nextActionAt) {
    let dueAt = input.nextActionAt;
    if (!dueAt.includes("T")) {
      const [y, m, d] = dueAt.split("-").map(Number);
      dueAt = new Date(y, m - 1, d, 10, 0, 0).toISOString();
    }

    leadUpdates.next_followup_action = input.nextAction.trim();
    leadUpdates.next_followup_at = dueAt;

    const stageForType =
      typeof leadUpdates.sales_stage === "string"
        ? leadUpdates.sales_stage
        : lead?.sales_stage;

    await supabase.from("reminders").insert({
      company_id: profile.company_id,
      lead_id: input.leadId,
      reminder_type: followupReminderTypeForStage(stageForType),
      message: `${input.nextAction.trim()}${input.notes.trim() ? ` — ${input.notes.trim()}` : ""}`,
      due_at: dueAt,
    });
  }

  const { error: leadError } = await supabase
    .from("leads")
    .update(leadUpdates)
    .eq("id", input.leadId);

  if (leadError) throw new Error(leadError.message);

  await logAuditEvent({
    companyId: profile.company_id,
    leadId: input.leadId,
    actorId: profile.id,
    eventType: "call_logged",
    entityType: "call_log",
    entityId: callLog.id,
    metadata: {
      activityType: input.activityType,
      outcome: storedOutcome,
      notes: input.notes,
      nextAction: input.nextAction,
      nextActionAt: input.nextActionAt,
    },
  });

  if (stageAdvanced) {
    await logAuditEvent({
      companyId: profile.company_id,
      leadId: input.leadId,
      actorId: profile.id,
      eventType: "stage_change",
      entityType: "lead",
      entityId: input.leadId,
      metadata: { from: "new_lead", to: "contacted", automatic: true },
    });
  }

  revalidatePath(`/leads/${input.leadId}`);
  revalidatePath("/pipeline");
  revalidatePath("/alerts");
  revalidatePath("/reminders");
  return callLog;
}

export async function setFollowupReminder(input: {
  leadId: string;
  action: string;
  dueAt: string;
  notes?: string;
}) {
  const profile = await requireAuth();
  const supabase = await createClient();

  const { data: lead } = await supabase
    .from("leads")
    .select("sales_stage")
    .eq("id", input.leadId)
    .single();

  const leadUpdates: Record<string, unknown> = {
    next_followup_action: input.action,
    next_followup_at: input.dueAt,
  };
  const stageAdvanced = mergeAutoContactedStage(lead?.sales_stage, leadUpdates);

  await supabase.from("leads").update(leadUpdates).eq("id", input.leadId);

  const { data, error } = await supabase
    .from("reminders")
    .insert({
      company_id: profile.company_id,
      lead_id: input.leadId,
      reminder_type: followupReminderTypeForStage(lead?.sales_stage),
      message: input.notes?.trim()
        ? `${input.action} — ${input.notes.trim()}`
        : input.action,
      due_at: input.dueAt,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  await logAuditEvent({
    companyId: profile.company_id,
    leadId: input.leadId,
    actorId: profile.id,
    eventType: "followup_scheduled",
    metadata: { action: input.action, dueAt: input.dueAt },
  });

  if (stageAdvanced) {
    await logAuditEvent({
      companyId: profile.company_id,
      leadId: input.leadId,
      actorId: profile.id,
      eventType: "stage_change",
      entityType: "lead",
      entityId: input.leadId,
      metadata: { from: "new_lead", to: "contacted", automatic: true },
    });
  }

  revalidatePath(`/leads/${input.leadId}`);
  revalidatePath("/pipeline");
  revalidatePath("/alerts");
  revalidatePath("/reminders");
  return data;
}

export async function resolveFollowup(reminderId: string, leadId: string) {
  const { resolveReminder } = await import("@/actions/reminders");
  return resolveReminder(reminderId, leadId);
}
