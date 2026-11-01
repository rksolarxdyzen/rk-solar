"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, getUserAuthorities } from "@/lib/auth";
import type { ReminderItem, ReminderSummary, ReminderUrgency } from "@/lib/domain/reminders";
import { summarizeReminders } from "@/lib/domain/reminders";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_MILESTONE_LABELS,
  type PaymentMethod,
  type PaymentMilestone,
} from "@/lib/domain/payments";
import { formatCurrency } from "@/lib/utils";

const PAYMENT_ALERT_OVERDUE_MS = 24 * 60 * 60 * 1000;

async function loadPaymentVerificationAlerts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  now: Date
): Promise<ReminderItem[]> {
  const { data, error } = await supabase
    .from("payments")
    .select(
      "id, lead_id, milestone, amount, method, transaction_id, created_at, lead:leads!payments_lead_id_fkey(name, phone, sales_stage)"
    )
    .eq("company_id", companyId)
    .eq("verification_status", "pending")
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) {
    console.error("loadPaymentVerificationAlerts", error.message);
    return [];
  }

  return (data ?? []).map((p) => {
    const lead = normalizeLead(p.lead);
    const milestone =
      PAYMENT_MILESTONE_LABELS[p.milestone as PaymentMilestone] ?? p.milestone;
    const method = PAYMENT_METHOD_LABELS[p.method as PaymentMethod] ?? p.method;
    const ageMs = now.getTime() - new Date(p.created_at).getTime();
    return {
      id: `payment:${p.id}`,
      leadId: p.lead_id,
      leadName: lead?.name ?? "Customer",
      leadPhone: lead?.phone ?? "",
      reminderType: "payment_verification",
      message: `${milestone} ${formatCurrency(Number(p.amount))} via ${method}${
        p.transaction_id ? ` · Txn ${p.transaction_id}` : ""
      } — verify or reject`,
      dueAt: p.created_at,
      urgency: ageMs > PAYMENT_ALERT_OVERDUE_MS ? "overdue" : "due_now",
      assignedTo: null,
      salesStage: lead?.sales_stage ?? null,
      kind: "payment",
      resolvable: false,
    } satisfies ReminderItem;
  });
}

function getUrgency(dueAt: string, now: Date): ReminderUrgency {
  const due = new Date(dueAt);
  if (due < now) return "overdue";
  const in15 = new Date(now.getTime() + 15 * 60 * 1000);
  if (due <= in15) return "due_now";
  const endToday = new Date(now);
  endToday.setHours(23, 59, 59, 999);
  if (due <= endToday) return "due_today";
  return "upcoming";
}

function normalizeLead(lead: unknown): {
  id?: string;
  name: string;
  phone: string;
  assigned_to: string | null;
  assigned_telecaller_id?: string | null;
  assigned_surveyor_id?: string | null;
  sales_stage?: string;
} | null {
  if (!lead) return null;
  if (Array.isArray(lead)) {
    const first = lead[0];
    if (!first || typeof first !== "object") return null;
    return first as {
      id?: string;
      name: string;
      phone: string;
      assigned_to: string | null;
      assigned_telecaller_id?: string | null;
      assigned_surveyor_id?: string | null;
      sales_stage?: string;
    };
  }
  return lead as {
    id?: string;
    name: string;
    phone: string;
    assigned_to: string | null;
    assigned_telecaller_id?: string | null;
    assigned_surveyor_id?: string | null;
    sales_stage?: string;
  };
}

function toReminderItem(
  row: {
    id: string;
    lead_id: string;
    reminder_type: string;
    message: string;
    due_at: string;
  },
  lead: ReturnType<typeof normalizeLead>,
  now: Date
): ReminderItem {
  return {
    id: row.id,
    leadId: row.lead_id,
    leadName: lead?.name ?? "Unknown",
    leadPhone: lead?.phone ?? "",
    reminderType: row.reminder_type,
    message: row.message,
    dueAt: row.due_at,
    urgency: getUrgency(row.due_at, now),
    assignedTo: lead?.assigned_to ?? null,
    salesStage: lead?.sales_stage ?? null,
    kind: "reminder",
    resolvable: true,
  };
}

async function syncLeadFollowupFromOpenReminders(
  supabase: Awaited<ReturnType<typeof createClient>>,
  leadId: string,
  companyId: string
) {
  const { data: remaining } = await supabase
    .from("reminders")
    .select("id, due_at, message, reminder_type")
    .eq("lead_id", leadId)
    .eq("company_id", companyId)
    .in("reminder_type", ["sales_followup", "post_survey_followup"])
    .is("resolved_at", null)
    .order("due_at", { ascending: true })
    .limit(1);

  if (remaining?.length) {
    await supabase
      .from("leads")
      .update({
        next_followup_at: remaining[0].due_at,
        next_followup_action: remaining[0].message,
      })
      .eq("id", leadId)
      .eq("company_id", companyId);
  } else {
    await supabase
      .from("leads")
      .update({ next_followup_at: null, next_followup_action: null })
      .eq("id", leadId)
      .eq("company_id", companyId);
  }
}

export async function getMyReminders(): Promise<ReminderSummary> {
  const profile = await requireAuth();
  const supabase = await createClient();
  const authorities = await getUserAuthorities(profile.id);
  const hasFullAccess = authorities.has("full_access") || authorities.has("view_all_leads");
  const paymentAlerts = profile.role === "accounts" || authorities.has("verify_payment");
  const now = new Date();

  const { data, error } = await supabase
    .from("reminders")
    .select(
      "id, lead_id, reminder_type, message, due_at, lead:leads(id, name, phone, assigned_to, assigned_telecaller_id, assigned_surveyor_id, sales_stage)"
    )
    .eq("company_id", profile.company_id)
    .is("resolved_at", null)
    .order("due_at", { ascending: true })
    .limit(100);

  if (error) throw error;

  let rows = data ?? [];
  if (!hasFullAccess) {
    rows = rows.filter((r) => {
      const lead = normalizeLead(r.lead);
      if (!lead) return false;
      return (
        lead.assigned_telecaller_id === profile.id ||
        lead.assigned_surveyor_id === profile.id ||
        lead.assigned_to === profile.id
      );
    });
  }

  const items = rows.map((r) => toReminderItem(r, normalizeLead(r.lead), now));
  items.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());

  if (!paymentAlerts) return summarizeReminders(items);

  const paymentItems = await loadPaymentVerificationAlerts(supabase, profile.company_id, now);
  return { ...summarizeReminders([...paymentItems, ...items]), paymentAlerts };
}

export type ResolveReminderResult = { ok: true; reminderId: string; leadId: string };

/**
 * Mark a reminder done. Always returns after a durable DB resolve (or throws).
 * Synthetic `survey:` ids resolve the underlying open survey_scheduled row for the lead.
 */
export async function resolveReminder(
  reminderId: string,
  leadId: string
): Promise<ResolveReminderResult> {
  const profile = await requireAuth();
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  let targetId = reminderId;

  if (reminderId.startsWith("survey:")) {
    const { data: surveyRow, error: surveyErr } = await supabase
      .from("reminders")
      .select("id, reminder_type")
      .eq("company_id", profile.company_id)
      .eq("lead_id", leadId)
      .eq("reminder_type", "survey_scheduled")
      .is("resolved_at", null)
      .order("due_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (surveyErr) throw new Error(surveyErr.message);
    if (!surveyRow) {
      throw new Error("No open site-visit reminder found to mark done");
    }
    targetId = surveyRow.id;
  }

  const { data: updated, error } = await supabase
    .from("reminders")
    .update({ resolved_at: nowIso })
    .eq("id", targetId)
    .eq("company_id", profile.company_id)
    .is("resolved_at", null)
    .select("id, reminder_type, lead_id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!updated) {
    // Already resolved — treat as success so the UI can clear
    const { data: existing } = await supabase
      .from("reminders")
      .select("id, reminder_type, lead_id, resolved_at")
      .eq("id", targetId)
      .eq("company_id", profile.company_id)
      .maybeSingle();

    if (existing?.resolved_at) {
      await syncLeadFollowupFromOpenReminders(supabase, leadId, profile.company_id);
      revalidateReminderPaths(leadId);
      return { ok: true, reminderId: existing.id, leadId };
    }
    throw new Error("Reminder not found or already cleared");
  }

  if (
    updated.reminder_type === "sales_followup" ||
    updated.reminder_type === "post_survey_followup"
  ) {
    await syncLeadFollowupFromOpenReminders(supabase, leadId, profile.company_id);
  }

  revalidateReminderPaths(leadId);
  return { ok: true, reminderId: updated.id, leadId: updated.lead_id };
}

function revalidateReminderPaths(leadId: string) {
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/");
  revalidatePath("/alerts");
  revalidatePath("/reminders");
  revalidatePath("/pipeline");
  revalidatePath("/customers");
}
