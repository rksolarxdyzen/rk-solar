"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, hasAuthority } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import {
  PAYMENT_MILESTONES,
  PAYMENT_METHODS,
  type PaymentMilestone,
  type PaymentRow,
} from "@/lib/domain/payments";
import { assertPaymentWithinQuoteCap } from "@/lib/accounts/receivables-math";
import { loadSettlementDiscount } from "@/lib/accounts/settlement-discount";
import { isWonOrLaterStage } from "@/lib/domain/workflow";

const recordSchema = z.object({
  leadId: z.string().uuid(),
  milestone: z.enum(PAYMENT_MILESTONES),
  amount: z.number().positive(),
  method: z.enum(PAYMENT_METHODS),
  transactionId: z.string().trim(),
  paidAt: z.string().min(4),
  notes: z.string().optional().nullable(),
  quotationId: z.string().uuid().optional().nullable(),
});

async function canRecord(profile: { id: string; role: string }) {
  return (
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    profile.role === "sales_executive" ||
    profile.role === "accounts" ||
    (await hasAuthority(profile.id, "record_payment")) ||
    (await hasAuthority(profile.id, "full_access"))
  );
}

async function canVerify(profile: { id: string; role: string }) {
  return (
    profile.role === "admin" ||
    profile.role === "accounts" ||
    (await hasAuthority(profile.id, "verify_payment")) ||
    (await hasAuthority(profile.id, "full_access"))
  );
}

async function maybeAdvanceTokenGates(
  companyId: string,
  leadId: string,
  actorId: string
) {
  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("id, sales_stage, token_verified, feasibility_approved")
    .eq("id", leadId)
    .single();

  if (!lead) return;
  if (lead.sales_stage !== "token_pending_verification") return;
  if (!lead.token_verified || !lead.feasibility_approved) return;

  const { error } = await supabase
    .from("leads")
    .update({ sales_stage: "token_verified_and_feasibility_ok" })
    .eq("id", leadId);

  if (error) throw new Error(error.message);

  await logAuditEvent({
    companyId,
    leadId,
    actorId,
    eventType: "stage_change",
    entityType: "lead",
    entityId: leadId,
    metadata: {
      from: "token_pending_verification",
      to: "token_verified_and_feasibility_ok",
      reason: "token_verified_and_feasibility_approved",
    },
  });
}

function publicPaymentError(err: unknown, fallback = "Payment update failed") {
  const msg = err instanceof Error ? err.message : fallback;
  if (
    /json object requested|0 rows|PGRST116|row-level security|permission denied|RLS/i.test(
      msg,
    )
  ) {
    return "This customer is hidden from Accounts, so verification cannot finish. Ask an admin to apply database update 047.";
  }
  return msg;
}

type PaymentActionResult = { ok: true } | { ok: false; error: string };

/** Advance lead stage when a milestone payment is already verified (idempotent). */
async function syncStageForVerifiedMilestone(input: {
  companyId: string;
  leadId: string;
  actorId: string;
  milestone: PaymentMilestone;
  paymentId: string;
}) {
  const supabase = await createClient();
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, sales_stage, token_verified, feasibility_approved")
    .eq("id", input.leadId)
    .maybeSingle();

  if (leadError) throw new Error(leadError.message);
  if (!lead) {
    throw new Error(
      "This customer is hidden from Accounts, so verification cannot finish. Ask an admin to apply database update 047.",
    );
  }

  if (input.milestone === "token") {
    if (!lead.token_verified) {
      const { error } = await supabase
        .from("leads")
        .update({ token_verified: true })
        .eq("id", lead.id);
      if (error) throw new Error(error.message);
    }
    await maybeAdvanceTokenGates(input.companyId, lead.id, input.actorId);
    return;
  }

  if (input.milestone === "pre_dispatch") {
    if (lead.sales_stage !== "pre_dispatch_pending_verification") return;
    const { error } = await supabase
      .from("leads")
      .update({ sales_stage: "pre_dispatch_verified" })
      .eq("id", lead.id);
    if (error) throw new Error(error.message);
    await logAuditEvent({
      companyId: input.companyId,
      leadId: lead.id,
      actorId: input.actorId,
      eventType: "stage_change",
      entityType: "lead",
      entityId: lead.id,
      metadata: {
        from: lead.sales_stage,
        to: "pre_dispatch_verified",
        paymentId: input.paymentId,
        reason: "payment_verified_sync",
      },
    });
    return;
  }

  if (input.milestone === "final") {
    if (lead.sales_stage !== "final_pending_verification") return;
    const { error } = await supabase
      .from("leads")
      .update({ sales_stage: "final_verified" })
      .eq("id", lead.id);
    if (error) throw new Error(error.message);
    await logAuditEvent({
      companyId: input.companyId,
      leadId: lead.id,
      actorId: input.actorId,
      eventType: "stage_change",
      entityType: "lead",
      entityId: lead.id,
      metadata: {
        from: lead.sales_stage,
        to: "final_verified",
        paymentId: input.paymentId,
        reason: "payment_verified_sync",
      },
    });
  }
}

/** Repair stuck leads: verified payment but stage still on pending. Returns true if stage changed. */
export async function reconcileVerifiedPaymentStages(leadId: string): Promise<boolean> {
  const profile = await requireAuth();
  const supabase = await createClient();
  const { data: payments, error } = await supabase
    .from("payments")
    .select("id, milestone, verification_status")
    .eq("lead_id", leadId)
    .eq("company_id", profile.company_id)
    .eq("verification_status", "verified");

  if (error) throw new Error(error.message);

  const { data: before } = await supabase
    .from("leads")
    .select("sales_stage, token_verified")
    .eq("id", leadId)
    .maybeSingle();

  for (const payment of payments ?? []) {
    await syncStageForVerifiedMilestone({
      companyId: profile.company_id,
      leadId,
      actorId: profile.id,
      milestone: payment.milestone as PaymentMilestone,
      paymentId: payment.id,
    });
  }

  const { data: after } = await supabase
    .from("leads")
    .select("sales_stage, token_verified")
    .eq("id", leadId)
    .maybeSingle();

  return (
    before?.sales_stage !== after?.sales_stage ||
    Boolean(before?.token_verified) !== Boolean(after?.token_verified)
  );
}

export async function listPaymentsForLead(leadId: string): Promise<PaymentRow[]> {
  await requireAuth();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as PaymentRow[];
}

/** Grand total for a lead's accepted quotation (staff payment balance). */
export async function getLeadQuoteGrandTotal(leadId: string): Promise<number | null> {
  await requireAuth();
  const supabase = await createClient();
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("accepted_quotation_id, company_id")
    .eq("id", leadId)
    .maybeSingle();
  if (leadError) throw new Error(leadError.message);
  if (!lead?.accepted_quotation_id) return null;

  const { data: quote, error } = await supabase
    .from("quotations")
    .select("grand_total")
    .eq("id", lead.accepted_quotation_id)
    .eq("company_id", lead.company_id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return quote?.grand_total != null ? Number(quote.grand_total) : null;
}

export async function getLeadSettlementDiscount(
  leadId: string
): Promise<{ amount: number; reason: string | null }> {
  await requireAuth();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select("settlement_discount_amount, settlement_discount_reason")
    .eq("id", leadId)
    .maybeSingle();
  if (error || !data) return { amount: 0, reason: null };
  return {
    amount: Math.max(0, Number(data.settlement_discount_amount) || 0),
    reason: (data.settlement_discount_reason as string | null) ?? null,
  };
}

export async function listPaymentQueue(filter: "pending" | "all" = "pending") {
  const profile = await requireAuth();
  const can =
    (await canVerify(profile)) ||
    (await canRecord(profile)) ||
    (await hasAuthority(profile.id, "view_payment_queues"));
  if (!can) throw new Error("Missing authority: view_payment_queues");

  const supabase = await createClient();
  let q = supabase
    .from("payments")
    .select(
      `*, lead:leads!payments_lead_id_fkey(
        id, name, phone, city, sales_stage, token_verified, feasibility_approved,
        assigned_to, assigned_telecaller_id, dealer_id,
        assigned_profile:profiles!leads_assigned_to_fkey(id, name),
        telecaller_profile:profiles!leads_assigned_telecaller_id_fkey(id, name),
        dealer_profile:profiles!leads_dealer_id_fkey(id, name)
      )`
    )
    .eq("company_id", profile.company_id)
    .order("created_at", { ascending: false });

  if (filter === "pending") {
    q = q.eq("verification_status", "pending");
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  type NestedProfile = { id: string; name: string } | { id: string; name: string }[] | null;
  const unwrap = (p: NestedProfile) => (Array.isArray(p) ? (p[0] ?? null) : p);

  return (data ?? []).map((row) => {
    const raw = row.lead as
      | {
          assigned_profile?: NestedProfile;
          telecaller_profile?: NestedProfile;
          dealer_profile?: NestedProfile;
          [key: string]: unknown;
        }
      | null
      | undefined;
    const leadRow = Array.isArray(raw) ? (raw[0] ?? null) : (raw ?? null);
    if (!leadRow) return { ...row, lead: null };
    return {
      ...row,
      lead: {
        ...leadRow,
        assigned_profile: unwrap(leadRow.assigned_profile ?? null),
        telecaller_profile: unwrap(leadRow.telecaller_profile ?? null),
        dealer_profile: unwrap(leadRow.dealer_profile ?? null),
      },
    };
  });
}

export async function recordPayment(
  input: z.infer<typeof recordSchema>
): Promise<{ ok: true; payment: PaymentRow } | { ok: false; error: string }> {
  try {
    return { ok: true, payment: await recordPaymentOrThrow(input) };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, error: err.issues[0]?.message ?? "Invalid payment details" };
    }
    return { ok: false, error: err instanceof Error ? err.message : "Failed to record payment" };
  }
}

async function recordPaymentOrThrow(input: z.infer<typeof recordSchema>) {
  const profile = await requireAuth();
  if (!(await canRecord(profile))) throw new Error("Missing authority: record_payment");

  const parsed = recordSchema.parse(input);
  let transactionId = parsed.transactionId;
  if (parsed.method === "cash" && transactionId.length < 2) {
    transactionId = "Cash";
  }
  if (transactionId.length < 2) {
    throw new Error("Enter a transaction or receipt reference (at least 2 characters)");
  }
  const supabase = await createClient();

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select(
      "id, sales_stage, company_id, accepted_quotation_id, token_verified, feasibility_approved, won_token_amount, won_pre_dispatch_amount, won_final_amount"
    )
    .eq("id", parsed.leadId)
    .eq("company_id", profile.company_id)
    .single();

  if (leadError || !lead) throw new Error("Lead not found");

  const stage = lead.sales_stage as string;
  const milestone = parsed.milestone as PaymentMilestone;

  if (milestone === "token") {
    if (stage !== "quote_accepted" && stage !== "token_pending_verification") {
      throw new Error("Token payment requires an accepted quotation");
    }
  } else if (milestone === "pre_dispatch") {
    if (!isWonOrLaterStage(stage)) {
      throw new Error("Pre-dispatch can be recorded after the file is Won");
    }
    const { data: tokenRow } = await supabase
      .from("payments")
      .select("id, verification_status")
      .eq("lead_id", lead.id)
      .eq("milestone", "token")
      .maybeSingle();
    if (!tokenRow || tokenRow.verification_status === "rejected") {
      throw new Error("Record Token first, then Pre-dispatch");
    }
  } else if (milestone === "final") {
    const okFinal = new Set([
      "installation_completed",
      "final_pending_verification",
      "final_verified",
      "liaison_in_progress",
      "meter_installed",
      "subsidy_pending",
      "subsidy_received_pending_accounts",
    ]);
    if (!okFinal.has(stage)) {
      throw new Error("Final payment requires installation completed");
    }
  }

  const quotationId =
    parsed.quotationId ?? lead.accepted_quotation_id ?? null;

  // Replace rejected row if re-recording
  await supabase
    .from("payments")
    .delete()
    .eq("lead_id", lead.id)
    .eq("milestone", milestone)
    .eq("verification_status", "rejected");

  const { data: existing } = await supabase
    .from("payments")
    .select("id, verification_status, amount")
    .eq("lead_id", lead.id)
    .eq("milestone", milestone)
    .maybeSingle();

  if (existing?.verification_status === "verified") {
    throw new Error("This milestone is already verified");
  }

  const { data: allPays } = await supabase
    .from("payments")
    .select("amount, verification_status")
    .eq("lead_id", lead.id);

  let projectTotal: number | null = null;
  if (quotationId) {
    const { data: quote } = await supabase
      .from("quotations")
      .select("grand_total")
      .eq("id", quotationId)
      .eq("company_id", profile.company_id)
      .maybeSingle();
    if (quote?.grand_total != null) projectTotal = Number(quote.grand_total);
  }
  if (projectTotal == null || !(projectTotal > 0)) {
    const wonPlan =
      (Number(lead.won_token_amount) || 0) +
      (Number(lead.won_pre_dispatch_amount) || 0) +
      (Number(lead.won_final_amount) || 0);
    if (wonPlan > 0) projectTotal = wonPlan;
  }
  if (projectTotal != null && projectTotal > 0) {
    const discount = await loadSettlementDiscount(supabase, lead.id);
    if (discount > 0) projectTotal = Math.max(0.01, projectTotal - discount);
  }

  const existingTotal = (allPays ?? [])
    .filter((p) => p.verification_status !== "rejected")
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const cap = assertPaymentWithinQuoteCap({
    projectTotal,
    existingNonRejectedTotal: existingTotal,
    newAmount: parsed.amount,
    replacingAmount: existing ? Number(existing.amount) || 0 : 0,
  });
  if (!cap.ok) throw new Error(cap.message);

  const payload = {
    company_id: profile.company_id,
    lead_id: lead.id,
    quotation_id: quotationId,
    milestone,
    amount: parsed.amount,
    method: parsed.method,
    transaction_id: transactionId,
    paid_at: parsed.paidAt,
    notes: parsed.notes ?? null,
    verification_status: "pending" as const,
    recorded_by: profile.id,
    verified_by: null,
    verified_at: null,
    rejection_reason: null,
    bank_reference: null,
  };

  const { data: payment, error } = existing
    ? await supabase
        .from("payments")
        .update(payload)
        .eq("id", existing.id)
        .select("*")
        .single()
    : await supabase.from("payments").insert(payload).select("*").single();

  if (error) throw new Error(error.message);

  let nextStage: string | null = null;
  if (milestone === "token" && stage === "quote_accepted") {
    nextStage = "token_pending_verification";
  } else if (
    milestone === "pre_dispatch" &&
    (stage === "quote_accepted" ||
      stage === "token_pending_verification" ||
      stage === "token_verified_and_feasibility_ok")
  ) {
    nextStage = "pre_dispatch_pending_verification";
  } else if (milestone === "final" && stage === "installation_completed") {
    nextStage = "final_pending_verification";
  }

  if (nextStage) {
    const updates: Record<string, unknown> = { sales_stage: nextStage };
    if (milestone === "token") {
      updates.token_verified = false;
    }
    await supabase.from("leads").update(updates).eq("id", lead.id);
    await logAuditEvent({
      companyId: profile.company_id,
      leadId: lead.id,
      actorId: profile.id,
      eventType: "stage_change",
      entityType: "lead",
      entityId: lead.id,
      metadata: { from: stage, to: nextStage, paymentId: payment.id, milestone },
    });
  }

  await logAuditEvent({
    companyId: profile.company_id,
    leadId: lead.id,
    actorId: profile.id,
    eventType: "payment_recorded",
    entityType: "payment",
    entityId: payment.id,
    metadata: {
      milestone,
      amount: parsed.amount,
      transactionId: parsed.transactionId,
    },
  });

  revalidatePath("/payments");
  revalidatePath("/feasibility");
  revalidatePath("/pipeline");
  return payment as PaymentRow;
}

export async function verifyPayment(input: {
  paymentId: string;
  bankReference: string;
}): Promise<PaymentActionResult> {
  try {
    return await verifyPaymentInner(input);
  } catch (err) {
    return { ok: false, error: publicPaymentError(err) };
  }
}

async function verifyPaymentInner(input: {
  paymentId: string;
  bankReference: string;
}): Promise<PaymentActionResult> {
  const profile = await requireAuth();
  if (!(await canVerify(profile))) throw new Error("Missing authority: verify_payment");

  const bankReference = input.bankReference.trim();
  if (bankReference.length < 2) throw new Error("Bank reference is required");

  const supabase = await createClient();
  const { data: payment, error } = await supabase
    .from("payments")
    .select("*")
    .eq("id", input.paymentId)
    .eq("company_id", profile.company_id)
    .single();

  if (error || !payment) throw new Error("Payment not found");

  if (payment.verification_status !== "verified") {
    const { error: updError } = await supabase
      .from("payments")
      .update({
        verification_status: "verified",
        bank_reference: bankReference,
        verified_by: profile.id,
        verified_at: new Date().toISOString(),
        rejection_reason: null,
      })
      .eq("id", payment.id);

    if (updError) throw new Error(updError.message);

    await logAuditEvent({
      companyId: profile.company_id,
      leadId: payment.lead_id,
      actorId: profile.id,
      eventType: "payment_verified",
      entityType: "payment",
      entityId: payment.id,
      metadata: { milestone: payment.milestone, bankReference },
    });
  }

  // Always sync stage (also repairs stuck leads where payment was verified but stage was not).
  await syncStageForVerifiedMilestone({
    companyId: profile.company_id,
    leadId: payment.lead_id,
    actorId: profile.id,
    milestone: payment.milestone as PaymentMilestone,
    paymentId: payment.id,
  });

  revalidatePath("/payments");
  revalidatePath("/feasibility");
  revalidatePath("/pipeline");
  revalidatePath("/customers");
  revalidatePath("/installation");
  return { ok: true };
}

export async function rejectPayment(input: {
  paymentId: string;
  reason: string;
}): Promise<PaymentActionResult> {
  try {
    return await rejectPaymentInner(input);
  } catch (err) {
    return { ok: false, error: publicPaymentError(err) };
  }
}

async function rejectPaymentInner(input: {
  paymentId: string;
  reason: string;
}): Promise<PaymentActionResult> {
  const profile = await requireAuth();
  if (!(await canVerify(profile))) throw new Error("Missing authority: verify_payment");

  const reason = input.reason.trim();
  if (reason.length < 2) throw new Error("Rejection reason is required");

  const supabase = await createClient();
  const { data: payment, error } = await supabase
    .from("payments")
    .select("*")
    .eq("id", input.paymentId)
    .eq("company_id", profile.company_id)
    .single();

  if (error || !payment) throw new Error("Payment not found");

  const { error: updError } = await supabase
    .from("payments")
    .update({
      verification_status: "rejected",
      rejection_reason: reason,
      verified_by: profile.id,
      verified_at: new Date().toISOString(),
    })
    .eq("id", payment.id);

  if (updError) throw new Error(updError.message);

  if (payment.milestone === "token") {
    await supabase
      .from("leads")
      .update({ token_verified: false })
      .eq("id", payment.lead_id);
  }

  await logAuditEvent({
    companyId: profile.company_id,
    leadId: payment.lead_id,
    actorId: profile.id,
    eventType: "payment_rejected",
    entityType: "payment",
    entityId: payment.id,
    metadata: { milestone: payment.milestone, reason },
  });

  revalidatePath("/payments");
  revalidatePath("/pipeline");
  return { ok: true };
}

async function canOwnerDeletePayments(profile: { id: string; role: string }) {
  return (
    profile.role === "admin" || (await hasAuthority(profile.id, "full_access"))
  );
}

async function rewindLeadAfterPaymentDeleted(input: {
  companyId: string;
  leadId: string;
  actorId: string;
  milestone: PaymentMilestone;
}) {
  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("id, sales_stage, token_verified")
    .eq("id", input.leadId)
    .maybeSingle();
  if (!lead) return;

  const updates: Record<string, unknown> = {};
  const stage = lead.sales_stage as string;

  if (input.milestone === "token") {
    updates.token_verified = false;
    if (
      stage === "token_pending_verification" ||
      stage === "token_verified_and_feasibility_ok"
    ) {
      updates.sales_stage = "quote_accepted";
    }
  } else if (input.milestone === "pre_dispatch") {
    if (stage === "pre_dispatch_pending_verification" || stage === "pre_dispatch_verified") {
      updates.sales_stage = "token_verified_and_feasibility_ok";
    }
  } else if (input.milestone === "final") {
    if (stage === "final_pending_verification" || stage === "final_verified") {
      updates.sales_stage = "installation_completed";
    }
  }

  if (Object.keys(updates).length === 0) return;

  const { error } = await supabase.from("leads").update(updates).eq("id", lead.id);
  if (error) throw new Error(error.message);

  if (updates.sales_stage) {
    await logAuditEvent({
      companyId: input.companyId,
      leadId: lead.id,
      actorId: input.actorId,
      eventType: "stage_change",
      entityType: "lead",
      entityId: lead.id,
      metadata: {
        from: stage,
        to: updates.sales_stage,
        reason: "payment_deleted",
        milestone: input.milestone,
      },
    });
  }
}

export async function deletePayment(input: {
  paymentId: string;
}): Promise<PaymentActionResult> {
  try {
    const profile = await requireAuth();
    if (!(await canOwnerDeletePayments(profile))) {
      throw new Error("Only the owner can delete a payment");
    }

    const supabase = await createClient();
    const { data: payment, error } = await supabase
      .from("payments")
      .select("*")
      .eq("id", input.paymentId)
      .eq("company_id", profile.company_id)
      .maybeSingle();

    if (error || !payment) throw new Error("Payment not found");

    const { error: delError } = await supabase
      .from("payments")
      .delete()
      .eq("id", payment.id)
      .eq("company_id", profile.company_id);

    if (delError) throw new Error(delError.message);

    await rewindLeadAfterPaymentDeleted({
      companyId: profile.company_id,
      leadId: payment.lead_id,
      actorId: profile.id,
      milestone: payment.milestone as PaymentMilestone,
    });

    await logAuditEvent({
      companyId: profile.company_id,
      leadId: payment.lead_id,
      actorId: profile.id,
      eventType: "payment_deleted",
      entityType: "payment",
      entityId: payment.id,
      metadata: {
        milestone: payment.milestone,
        amount: payment.amount,
        transactionId: payment.transaction_id,
        verificationStatus: payment.verification_status,
      },
    });

    revalidatePath("/payments");
    revalidatePath("/pipeline");
    revalidatePath("/customers");
    revalidatePath("/feasibility");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: publicPaymentError(err, "Could not delete payment") };
  }
}

const correctPaymentSchema = z.object({
  paymentId: z.string().uuid(),
  amount: z.number().positive("Amount must be more than 0"),
  method: z.enum(PAYMENT_METHODS),
  transactionId: z.string().trim().min(2, "Transaction ID is required"),
  paidAt: z.string().min(4, "Paid-on date is required"),
  reason: z.string().trim().min(3, "Give a short reason for the correction"),
});

/**
 * Accounts correction of a recorded payment (e.g. sales entered the full
 * project amount as Token). Skips the quotation cap; status is unchanged.
 */
export async function correctPayment(
  input: z.input<typeof correctPaymentSchema>
): Promise<PaymentActionResult> {
  try {
    const profile = await requireAuth();
    if (!(await canVerify(profile))) {
      throw new Error("Only Accounts can correct payment amounts");
    }
    const parsed = correctPaymentSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid correction");
    }
    const data = parsed.data;

    const supabase = await createClient();
    const { data: payment, error } = await supabase
      .from("payments")
      .select("*")
      .eq("id", data.paymentId)
      .eq("company_id", profile.company_id)
      .maybeSingle();
    if (error || !payment) throw new Error("Payment not found");
    if (payment.verification_status === "rejected") {
      throw new Error("Rejected payments cannot be corrected. Record the milestone again instead.");
    }

    const { data: updated, error: updError } = await supabase
      .from("payments")
      .update({
        amount: data.amount,
        method: data.method,
        transaction_id: data.transactionId,
        paid_at: data.paidAt,
      })
      .eq("id", payment.id)
      .eq("company_id", profile.company_id)
      .select("id");
    if (updError) throw new Error(updError.message);
    if (!updated?.length) throw new Error("Correction was blocked by permissions");

    await logAuditEvent({
      companyId: profile.company_id,
      leadId: payment.lead_id,
      actorId: profile.id,
      eventType: "payment_corrected",
      entityType: "payment",
      entityId: payment.id,
      metadata: {
        milestone: payment.milestone,
        reason: data.reason,
        verificationStatus: payment.verification_status,
        before: {
          amount: Number(payment.amount),
          method: payment.method,
          transactionId: payment.transaction_id,
          paidAt: payment.paid_at,
        },
        after: {
          amount: data.amount,
          method: data.method,
          transactionId: data.transactionId,
          paidAt: data.paidAt,
        },
      },
    });

    revalidatePath("/payments");
    revalidatePath("/accounts/receivables");
    revalidatePath("/customers");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: publicPaymentError(err, "Could not correct payment") };
  }
}

const correctPlanSchema = z.object({
  leadId: z.string().uuid(),
  tokenAmount: z.number().min(0),
  preDispatchAmount: z.number().min(0),
  finalAmount: z.number().min(0),
  reason: z.string().trim().min(3, "Give a short reason for the correction"),
});

/** Accounts correction of the Won payment plan (Token / Pre-dispatch / Final split). */
export async function correctWonPaymentPlan(
  input: z.input<typeof correctPlanSchema>
): Promise<PaymentActionResult> {
  try {
    const profile = await requireAuth();
    if (!(await canVerify(profile))) {
      throw new Error("Only Accounts can correct the payment plan");
    }
    const parsed = correctPlanSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid payment plan");
    }
    const data = parsed.data;
    if (data.tokenAmount + data.preDispatchAmount + data.finalAmount <= 0) {
      throw new Error("The payment plan total must be more than 0");
    }

    const supabase = await createClient();
    const { data: lead, error } = await supabase
      .from("leads")
      .select("id, won_token_amount, won_pre_dispatch_amount, won_final_amount")
      .eq("id", data.leadId)
      .eq("company_id", profile.company_id)
      .maybeSingle();
    if (error || !lead) throw new Error("Customer not found");

    const { data: updated, error: updError } = await supabase
      .from("leads")
      .update({
        won_token_amount: data.tokenAmount,
        won_pre_dispatch_amount: data.preDispatchAmount,
        won_final_amount: data.finalAmount,
      })
      .eq("id", lead.id)
      .eq("company_id", profile.company_id)
      .select("id");
    if (updError) throw new Error(updError.message);
    if (!updated?.length) throw new Error("Correction was blocked by permissions");

    await logAuditEvent({
      companyId: profile.company_id,
      leadId: lead.id,
      actorId: profile.id,
      eventType: "payment_plan_corrected",
      entityType: "lead",
      entityId: lead.id,
      metadata: {
        reason: data.reason,
        before: {
          token: Number(lead.won_token_amount) || 0,
          preDispatch: Number(lead.won_pre_dispatch_amount) || 0,
          final: Number(lead.won_final_amount) || 0,
        },
        after: {
          token: data.tokenAmount,
          preDispatch: data.preDispatchAmount,
          final: data.finalAmount,
        },
      },
    });

    revalidatePath("/accounts/receivables");
    revalidatePath("/customers");
    revalidatePath("/payments");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: publicPaymentError(err, "Could not correct payment plan") };
  }
}

const settlementDiscountSchema = z.object({
  leadId: z.string().uuid(),
  amount: z.number().min(0, "Discount cannot be negative"),
  reason: z.string().trim().default(""),
});

/**
 * Accounts settlement discount (amount waived after Won). 0 clears it.
 * Pending balances subtract it: Final first, then Pre-dispatch, then Token.
 */
export async function setSettlementDiscount(
  input: z.input<typeof settlementDiscountSchema>
): Promise<PaymentActionResult> {
  try {
    const profile = await requireAuth();
    if (!(await canVerify(profile))) {
      throw new Error("Only Accounts can apply a settlement discount");
    }
    const parsed = settlementDiscountSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid discount");
    }
    const { leadId, amount, reason } = parsed.data;
    if (amount > 0 && reason.length < 3) {
      throw new Error("Give a short reason for the discount");
    }

    const supabase = await createClient();
    const { data: lead, error } = await supabase
      .from("leads")
      .select("id, won_token_amount, won_pre_dispatch_amount, won_final_amount, accepted_quotation_id")
      .eq("id", leadId)
      .eq("company_id", profile.company_id)
      .maybeSingle();
    if (error || !lead) throw new Error("Customer not found");

    let projectTotal =
      (Number(lead.won_token_amount) || 0) +
      (Number(lead.won_pre_dispatch_amount) || 0) +
      (Number(lead.won_final_amount) || 0);
    if (lead.accepted_quotation_id) {
      const { data: quote } = await supabase
        .from("quotations")
        .select("grand_total")
        .eq("id", lead.accepted_quotation_id)
        .maybeSingle();
      if (quote?.grand_total != null && Number(quote.grand_total) > 0) {
        projectTotal = Math.max(projectTotal, Number(quote.grand_total));
      }
    }
    if (projectTotal > 0 && amount >= projectTotal) {
      throw new Error("Discount must be less than the project total");
    }

    const before = await loadSettlementDiscount(supabase, lead.id);
    const { data: updated, error: updError } = await supabase
      .from("leads")
      .update({
        settlement_discount_amount: amount,
        settlement_discount_reason: amount > 0 ? reason : null,
        settlement_discount_by: amount > 0 ? profile.id : null,
        settlement_discount_at: amount > 0 ? new Date().toISOString() : null,
      })
      .eq("id", lead.id)
      .eq("company_id", profile.company_id)
      .select("id");
    if (updError) {
      if (/settlement_discount|column .* does not exist/i.test(updError.message)) {
        throw new Error(
          "Database is missing the discount columns. Run supabase/migrations/058_settlement_discount.sql in the Supabase SQL editor."
        );
      }
      throw new Error(updError.message);
    }
    if (!updated?.length) throw new Error("Discount was blocked by permissions");

    await logAuditEvent({
      companyId: profile.company_id,
      leadId: lead.id,
      actorId: profile.id,
      eventType: "settlement_discount_set",
      entityType: "lead",
      entityId: lead.id,
      metadata: { before, after: amount, reason: amount > 0 ? reason : null },
    });

    revalidatePath("/accounts/receivables");
    revalidatePath("/customers");
    revalidatePath("/payments");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: publicPaymentError(err, "Could not save discount") };
  }
}

/** Exported for feasibility action to call after approve. */
export async function advanceTokenGatesIfReady(
  companyId: string,
  leadId: string,
  actorId: string
) {
  return maybeAdvanceTokenGates(companyId, leadId, actorId);
}
