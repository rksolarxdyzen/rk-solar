"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSettlementDiscount } from "@/lib/accounts/settlement-discount";
import { requireAuth, hasAuthority } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import {
  computeSubsidyDueAt,
  isSubsidyTimerOverdue,
  PORTAL_DOC_TYPES,
} from "@/lib/domain/portal";
import { computeCleaningDueAt } from "@/lib/domain/maintenance";
import { getAppUrl, getSupabaseEnv, hasSupabaseServiceRoleKey } from "@/lib/env";
import {
  assertProofFileSize,
  fileExtension,
  isAllowedProofUpload,
  PROOF_UPLOAD_MAX_BYTES,
  readFormDataFile,
  resolveProofContentType,
} from "@/lib/uploads/proof-mime";
import { loadPortalTicketsForLead } from "@/lib/portal/portal-tickets";

async function canLiaison(profile: { id: string; role: string }) {
  return (
    profile.role === "admin" ||
    profile.role === "liaison" ||
    profile.role === "sales_manager" ||
    (await hasAuthority(profile.id, "manage_liaison")) ||
    (await hasAuthority(profile.id, "full_access"))
  );
}

async function canVerifySubsidy(profile: { id: string; role: string }) {
  return (
    profile.role === "admin" ||
    profile.role === "accounts" ||
    (await hasAuthority(profile.id, "verify_subsidy")) ||
    (await hasAuthority(profile.id, "full_access"))
  );
}

function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length > 10) return digits.slice(-10);
  return digits;
}

export async function listLiaisonQueue() {
  const profile = await requireAuth();
  if (!(await canLiaison(profile)) && !(await canVerifySubsidy(profile))) {
    throw new Error("Missing authority: manage_liaison");
  }

  const supabase = await createClient();
  const stages = [
    "liaison_in_progress",
    "meter_installed",
    "subsidy_pending",
    "subsidy_received_pending_accounts",
  ];

  const { data, error } = await supabase
    .from("leads")
    .select(
      "id, name, phone, city, sales_stage, portal_code, meter_installed_at, subsidy_timer_due_at, subsidy_received_at, subsidy_verified_at, subsidy_followup_sent_at, completion_certificate_url, installation_completed_at, subsidy_timer_started_at, liaison_notes, dealer_id"
    )
    .eq("company_id", profile.company_id)
    .in("sales_stage", stages)
    .order("updated_at", { ascending: false });

  if (error) {
    if (/dealer_id|column .* does not exist/i.test(error.message)) {
      const fallback = await supabase
        .from("leads")
        .select(
          "id, name, phone, city, sales_stage, portal_code, meter_installed_at, subsidy_timer_due_at, subsidy_received_at, subsidy_verified_at, subsidy_followup_sent_at, completion_certificate_url, installation_completed_at, subsidy_timer_started_at, liaison_notes"
        )
        .eq("company_id", profile.company_id)
        .in("sales_stage", stages)
        .order("updated_at", { ascending: false });
      if (fallback.error) throw new Error(fallback.error.message);
      return (fallback.data ?? []).map((row) => ({
        ...row,
        dealer_id: null as string | null,
        overdue: isSubsidyTimerOverdue(row),
        portalUrl: row.portal_code
          ? `${getAppUrl() ?? ""}/portal/${row.portal_code}`
          : null,
      }));
    }
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => ({
    ...row,
    overdue: isSubsidyTimerOverdue(row),
    portalUrl: row.portal_code
      ? `${getAppUrl() ?? ""}/portal/${row.portal_code}`
      : null,
  }));
}

export async function markMeterInstalled(input: {
  leadId: string;
  notes?: string | null;
}) {
  const profile = await requireAuth();
  const ok =
    (await canLiaison(profile)) ||
    (await hasAuthority(profile.id, "mark_meter_installed"));
  if (!ok) throw new Error("Missing authority: mark_meter_installed");

  return markMeterInstalledInternal({
    leadId: input.leadId,
    companyId: profile.company_id,
    actorId: profile.id,
    notes: input.notes,
    via: "staff",
  });
}

async function markMeterInstalledInternal(input: {
  leadId: string;
  companyId: string;
  actorId: string | null;
  notes?: string | null;
  via: "staff" | "portal";
}) {
  const supabase = await createClient();
  const admin = input.via === "portal" ? createAdminClient() : null;
  const db = admin ?? supabase;

  const { data: lead, error } = await db
    .from("leads")
    .select(
      "id, sales_stage, company_id, meter_installed_at, subsidy_timer_due_at"
    )
    .eq("id", input.leadId)
    .eq("company_id", input.companyId)
    .single();

  if (error || !lead) throw new Error("Lead not found");

  const allowed = new Set([
    "installation_completed",
    "liaison_in_progress",
    "meter_installed",
    "subsidy_pending",
  ]);
  if (!allowed.has(lead.sales_stage) && !lead.meter_installed_at) {
    throw new Error("Meter can be marked after installation enters liaison");
  }

  const now = new Date();
  const due = computeSubsidyDueAt(now);

  const { error: updError } = await db
    .from("leads")
    .update({
      sales_stage: "subsidy_pending",
      meter_installed_at: lead.meter_installed_at ?? now.toISOString(),
      meter_marked_by: input.actorId,
      subsidy_timer_started_at: now.toISOString(),
      subsidy_timer_due_at: due.toISOString(),
      liaison_notes: input.notes ?? null,
    })
    .eq("id", lead.id);

  if (updError) throw new Error(updError.message);

  if (input.actorId) {
    await logAuditEvent({
      companyId: input.companyId,
      leadId: lead.id,
      actorId: input.actorId,
      eventType: "stage_change",
      entityType: "lead",
      entityId: lead.id,
      metadata: {
        from: lead.sales_stage,
        to: "subsidy_pending",
        via: input.via,
        meterInstalled: true,
      },
    });
  } else {
    await admin!.from("audit_events").insert({
      company_id: input.companyId,
      lead_id: lead.id,
      actor_id: null,
      event_type: "stage_change",
      entity_type: "lead",
      entity_id: lead.id,
      metadata: {
        from: lead.sales_stage,
        to: "subsidy_pending",
        via: "portal",
        meterInstalled: true,
      },
    });
  }

  revalidatePath("/liaison");
  revalidatePath("/pipeline");
  revalidatePath("/portal");
  return { ok: true, dueAt: due.toISOString() };
}

export async function markSubsidyReceived(input: {
  leadId: string;
  notes?: string | null;
}) {
  const profile = await requireAuth();
  const ok =
    (await canLiaison(profile)) ||
    (await hasAuthority(profile.id, "mark_subsidy_received"));
  if (!ok) throw new Error("Missing authority: mark_subsidy_received");

  return markSubsidyReceivedInternal({
    leadId: input.leadId,
    companyId: profile.company_id,
    actorId: profile.id,
    notes: input.notes,
    via: "staff",
  });
}

async function markSubsidyReceivedInternal(input: {
  leadId: string;
  companyId: string;
  actorId: string | null;
  notes?: string | null;
  via: "staff" | "portal";
}) {
  const supabase = await createClient();
  const admin = input.via === "portal" ? createAdminClient() : null;
  const db = admin ?? supabase;

  const { data: lead, error } = await db
    .from("leads")
    .select("id, sales_stage, company_id, meter_installed_at")
    .eq("id", input.leadId)
    .eq("company_id", input.companyId)
    .single();

  if (error || !lead) throw new Error("Lead not found");
  if (!lead.meter_installed_at) {
    throw new Error("Mark meter installed before subsidy received");
  }

  const { error: updError } = await db
    .from("leads")
    .update({
      sales_stage: "subsidy_received_pending_accounts",
      subsidy_received_at: new Date().toISOString(),
      liaison_notes: input.notes ?? null,
    })
    .eq("id", lead.id);

  if (updError) throw new Error(updError.message);

  if (input.actorId) {
    await logAuditEvent({
      companyId: input.companyId,
      leadId: lead.id,
      actorId: input.actorId,
      eventType: "stage_change",
      entityType: "lead",
      entityId: lead.id,
      metadata: {
        from: lead.sales_stage,
        to: "subsidy_received_pending_accounts",
        via: input.via,
      },
    });
  } else {
    await admin!.from("audit_events").insert({
      company_id: input.companyId,
      lead_id: lead.id,
      actor_id: null,
      event_type: "stage_change",
      entity_type: "lead",
      entity_id: lead.id,
      metadata: {
        from: lead.sales_stage,
        to: "subsidy_received_pending_accounts",
        via: "portal",
      },
    });
  }

  revalidatePath("/liaison");
  revalidatePath("/pipeline");
  revalidatePath("/portal");
  return { ok: true };
}

export async function verifySubsidy(input: {
  leadId: string;
  bankReference: string;
  certificateUrl?: string | null;
}) {
  const profile = await requireAuth();
  if (!(await canVerifySubsidy(profile))) {
    throw new Error("Missing authority: verify_subsidy");
  }

  const bankReference = input.bankReference.trim();
  if (bankReference.length < 2) throw new Error("Bank reference is required");

  const supabase = await createClient();
  const { data: lead, error } = await supabase
    .from("leads")
    .select("id, sales_stage, company_id, name, dealer_id")
    .eq("id", input.leadId)
    .eq("company_id", profile.company_id)
    .single();

  if (error || !lead) throw new Error("Lead not found");
  if (lead.sales_stage !== "subsidy_received_pending_accounts") {
    throw new Error("Subsidy must be marked received before Accounts verify");
  }

  const cert =
    input.certificateUrl?.trim() ||
    `Certificate issued ${new Date().toISOString().slice(0, 10)} for ${lead.name}`;

  const { error: updError } = await supabase
    .from("leads")
    .update({
      sales_stage: "completed",
      subsidy_verified_at: new Date().toISOString(),
      subsidy_verified_by: profile.id,
      subsidy_bank_reference: bankReference,
      completion_certificate_url: cert.startsWith("http") ? cert : null,
      liaison_notes: cert.startsWith("http") ? null : cert,
      cleaning_next_due_at: computeCleaningDueAt().toISOString(),
    })
    .eq("id", lead.id);

  if (updError) throw new Error(updError.message);

  await supabase.from("notification_outbox").insert({
    company_id: profile.company_id,
    lead_id: lead.id,
    event_type: "project_completed",
    audience: "sales",
    payload: { bankReference, certificate: cert },
    status: "pending",
  });

  await logAuditEvent({
    companyId: profile.company_id,
    leadId: lead.id,
    actorId: profile.id,
    eventType: "stage_change",
    entityType: "lead",
    entityId: lead.id,
    metadata: {
      from: "subsidy_received_pending_accounts",
      to: "completed",
      bankReference,
    },
  });

  revalidatePath("/liaison");
  revalidatePath("/pipeline");
  revalidatePath("/customers");
  revalidatePath("/maintenance");
  return {
    ok: true as const,
    needsCommissionForm: Boolean(lead.dealer_id),
    leadId: lead.id,
    dealerId: lead.dealer_id as string | null,
  };
}

export async function enqueueOverdueSubsidyFollowUps() {
  const profile = await requireAuth();
  if (!(await canLiaison(profile))) {
    throw new Error("Missing authority: manage_liaison");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select(
      "id, name, company_id, subsidy_timer_due_at, subsidy_received_at, subsidy_followup_sent_at"
    )
    .eq("company_id", profile.company_id)
    .not("subsidy_timer_due_at", "is", null)
    .is("subsidy_received_at", null);

  if (error) throw new Error(error.message);

  let enqueued = 0;
  for (const lead of data ?? []) {
    if (!isSubsidyTimerOverdue(lead)) continue;
    if (lead.subsidy_followup_sent_at) continue;

    await supabase.from("notification_outbox").insert({
      company_id: profile.company_id,
      lead_id: lead.id,
      event_type: "subsidy_timer_overdue",
      audience: "liaison",
      payload: { leadName: lead.name, dueAt: lead.subsidy_timer_due_at },
      status: "pending",
    });

    await supabase
      .from("leads")
      .update({ subsidy_followup_sent_at: new Date().toISOString() })
      .eq("id", lead.id);

    enqueued += 1;
  }

  revalidatePath("/liaison");
  return { enqueued };
}

export async function addPortalDocument(input: {
  leadId: string;
  docType: (typeof PORTAL_DOC_TYPES)[number];
  title: string;
  fileUrl: string;
}) {
  const profile = await requireAuth();
  const ok =
    (await hasAuthority(profile.id, "manage_portal_documents")) ||
    (await canLiaison(profile)) ||
    profile.role === "admin";
  if (!ok) throw new Error("Missing authority: manage_portal_documents");

  const parsed = z
    .object({
      leadId: z.string().uuid(),
      docType: z.enum(PORTAL_DOC_TYPES),
      title: z.string().min(2),
      fileUrl: z.string().url(),
    })
    .parse(input);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("portal_documents")
    .insert({
      company_id: profile.company_id,
      lead_id: parsed.leadId,
      doc_type: parsed.docType,
      title: parsed.title,
      file_url: parsed.fileUrl,
      uploaded_by: profile.id,
      uploaded_by_customer: false,
      visible_to_customer: true,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  await logAuditEvent({
    companyId: profile.company_id,
    leadId: parsed.leadId,
    actorId: profile.id,
    eventType: "portal_document_uploaded",
    entityType: "portal_document",
    entityId: data.id,
    metadata: { title: parsed.title, docType: parsed.docType, via: "staff" },
  }).catch(() => undefined);

  revalidatePath("/liaison");
  revalidatePath("/customers");
  revalidatePath("/portal");
  return data;
}

const PORTAL_UPLOAD_MAX_BYTES = PROOF_UPLOAD_MAX_BYTES;

function requireAdminForPortalDocs() {
  if (!hasSupabaseServiceRoleKey()) {
    throw new Error(
      "Server is missing SUPABASE_SERVICE_ROLE_KEY. Add it in Vercel → Settings → Environment Variables, then redeploy."
    );
  }
  return createAdminClient();
}

async function canManageLeadDocs(profile: { id: string; role: string }) {
  return (
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    profile.role === "sales_executive" ||
    (await canLiaison(profile)) ||
    (await hasAuthority(profile.id, "manage_portal_documents")) ||
    (await hasAuthority(profile.id, "move_lead_stage")) ||
    (await hasAuthority(profile.id, "full_access"))
  );
}

export async function uploadLeadDocument(formData: FormData) {
  const profile = await requireAuth();
  if (!(await canManageLeadDocs(profile))) {
    throw new Error("Missing authority: manage_portal_documents");
  }

  const leadIdParsed = z.string().uuid().safeParse(String(formData.get("leadId") ?? ""));
  if (!leadIdParsed.success) throw new Error("Invalid lead");
  const leadId = leadIdParsed.data;
  const titleRaw = String(formData.get("title") ?? "").trim();
  const docTypeRaw = String(formData.get("docType") ?? "other");
  const docType =
    docTypeRaw === "customer_upload"
      ? "other"
      : (() => {
          const parsed = z.enum(PORTAL_DOC_TYPES).safeParse(docTypeRaw);
          if (!parsed.success) throw new Error("Invalid document type");
          return parsed.data;
        })();
  const { blob, name } = readFormDataFile(formData);
  assertProofFileSize(blob.size, PORTAL_UPLOAD_MAX_BYTES);
  if (!isAllowedProofUpload({ name, type: blob.type })) {
    throw new Error("Upload a PDF or image (JPG, PNG, WebP)");
  }
  const contentType = resolveProofContentType({ name, type: blob.type });

  const supabase = await createClient();
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, company_id")
    .eq("id", leadId)
    .eq("company_id", profile.company_id)
    .maybeSingle();
  if (leadError) throw new Error(leadError.message);
  if (!lead) throw new Error("Lead not found");

  const ext = fileExtension(name, contentType === "application/pdf" ? "pdf" : "bin");
  const path = `${lead.company_id}/portal-docs/${lead.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const buffer = Buffer.from(await blob.arrayBuffer());

  // Prefer authenticated upload (RLS); fall back to service role when needed.
  let uploadError = (
    await supabase.storage.from("proofs").upload(path, buffer, {
      contentType,
      upsert: false,
    })
  ).error;
  if (uploadError) {
    const admin = requireAdminForPortalDocs();
    uploadError = (
      await admin.storage.from("proofs").upload(path, buffer, {
        contentType,
        upsert: false,
      })
    ).error;
  }
  if (uploadError) throw new Error(uploadError.message);

  const { url } = getSupabaseEnv();
  const publicUrl = `${url.replace(/\/$/, "")}/storage/v1/object/public/proofs/${path}`;
  const title = titleRaw || name.replace(/\.[^.]+$/, "") || "Document";

  const row = {
    company_id: lead.company_id,
    lead_id: lead.id,
    doc_type: docType,
    title: title.slice(0, 200),
    file_url: publicUrl,
    uploaded_by: profile.id,
    uploaded_by_customer: false,
    visible_to_customer: true,
  };

  let data: { id: string } | null = null;
  const userInsert = await supabase.from("portal_documents").insert(row).select("id").single();
  if (userInsert.error) {
    const admin = requireAdminForPortalDocs();
    const adminInsert = await admin.from("portal_documents").insert(row).select("id").single();
    if (adminInsert.error) throw new Error(adminInsert.error.message);
    data = adminInsert.data;
  } else {
    data = userInsert.data;
  }

  await logAuditEvent({
    companyId: profile.company_id,
    leadId: lead.id,
    actorId: profile.id,
    eventType: "portal_document_uploaded",
    entityType: "portal_document",
    entityId: data?.id,
    metadata: { title, docType, via: "staff" },
  }).catch(() => undefined);

  revalidatePath("/liaison");
  revalidatePath("/customers");
  revalidatePath("/portal");
  return { ok: true };
}

export async function listLeadDocuments(leadId: string) {
  const profile = await requireAuth();
  const parsedId = z.string().uuid().parse(leadId);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("portal_documents")
    .select("id, doc_type, title, file_url, created_at, uploaded_by_customer, uploaded_by")
    .eq("lead_id", parsedId)
    .eq("company_id", profile.company_id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function portalUploadDocument(formData: FormData) {
  const portalCode = String(formData.get("portalCode") ?? "");
  const phone = String(formData.get("phone") ?? "");
  const titleRaw = String(formData.get("title") ?? "").trim();
  const { blob, name } = readFormDataFile(formData);
  assertProofFileSize(blob.size, PORTAL_UPLOAD_MAX_BYTES);
  if (!isAllowedProofUpload({ name, type: blob.type })) {
    throw new Error("Upload a PDF or image (JPG, PNG, WebP)");
  }
  const contentType = resolveProofContentType({ name, type: blob.type });

  const session = await openCustomerPortal({ portalCode, phone });
  const admin = requireAdminForPortalDocs();
  const ext = fileExtension(name, contentType === "application/pdf" ? "pdf" : "bin");
  const path = `${session.lead.company_id}/portal-docs/${session.lead.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const buffer = Buffer.from(await blob.arrayBuffer());
  const { error: uploadError } = await admin.storage.from("proofs").upload(path, buffer, {
    contentType,
    upsert: false,
  });
  if (uploadError) throw new Error(uploadError.message);

  const { url } = getSupabaseEnv();
  const publicUrl = `${url.replace(/\/$/, "")}/storage/v1/object/public/proofs/${path}`;
  const title = titleRaw || name.replace(/\.[^.]+$/, "") || "Customer document";

  const { error } = await admin.from("portal_documents").insert({
    company_id: session.lead.company_id,
    lead_id: session.lead.id,
    doc_type: "customer_upload",
    title: title.slice(0, 200),
    file_url: publicUrl,
    uploaded_by: null,
    uploaded_by_customer: true,
    visible_to_customer: true,
  });
  if (error) throw new Error(error.message);

  await admin.from("audit_events").insert({
    company_id: session.lead.company_id,
    lead_id: session.lead.id,
    actor_id: null,
    event_type: "portal_document_uploaded",
    entity_type: "portal_document",
    entity_id: session.lead.id,
    metadata: { title, via: "customer_portal" },
  });

  revalidatePath("/portal");
  revalidatePath("/customers");
  revalidatePath(`/portal/${session.lead.portal_code}`);
  return { ok: true };
}

/** Public portal: resolve by code + matching phone. */
export async function openCustomerPortal(input: {
  portalCode: string;
  phone: string;
}) {
  const admin = createAdminClient();
  const code = input.portalCode.trim().toUpperCase();
  const phone = normalizePhone(input.phone);
  if (code.length < 4) throw new Error("Invalid portal code");
  if (phone.length !== 10) {
    throw new Error("Enter the 10-digit registered mobile number");
  }

  const { data: lead, error } = await admin
    .from("leads")
    .select(
      "id, company_id, name, phone, city, address, sales_stage, portal_code, referrer_name, referrer_phone, meter_installed_at, subsidy_timer_due_at, subsidy_received_at, subsidy_verified_at, completion_certificate_url, installation_completed_at, accepted_quotation_id, cleaning_next_due_at, cleaning_last_sent_at"
    )
    .eq("portal_code", code)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!lead) throw new Error("Invalid portal code");
  if (normalizePhone(lead.phone) !== phone) {
    throw new Error("Phone number does not match this project");
  }

  const { data: documents } = await admin
    .from("portal_documents")
    .select("id, doc_type, title, file_url, created_at, uploaded_by_customer")
    .eq("lead_id", lead.id)
    .eq("visible_to_customer", true)
    .order("created_at", { ascending: false });

  const { data: quoteFromId } = lead.accepted_quotation_id
    ? await admin
        .from("quotations")
        .select("id, quotation_no, grand_total, template_kind, status")
        .eq("id", lead.accepted_quotation_id)
        .maybeSingle()
    : { data: null };

  const { data: quoteFallback } = quoteFromId
    ? { data: null }
    : await admin
        .from("quotations")
        .select("id, quotation_no, grand_total, template_kind, status")
        .eq("lead_id", lead.id)
        .eq("status", "accepted")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

  const quote = quoteFromId ?? quoteFallback ?? null;

  const { data: paymentRows } = await admin
    .from("payments")
    .select("milestone, amount, verification_status, paid_at")
    .eq("lead_id", lead.id)
    .eq("company_id", lead.company_id)
    .order("created_at", { ascending: true });

  const tickets = await loadPortalTicketsForLead(admin, {
    id: lead.id,
    company_id: lead.company_id,
  });

  const settlementDiscount = await loadSettlementDiscount(admin, lead.id);

  return {
    lead,
    documents: documents ?? [],
    quote,
    settlementDiscount,
    payments: (paymentRows ?? []).map((row) => ({
      milestone: row.milestone,
      amount: Number(row.amount ?? 0),
      verification_status: row.verification_status,
      paid_at: row.paid_at,
    })),
    tickets,
    overdue: isSubsidyTimerOverdue(lead),
  };
}

export async function portalMarkMeterInstalled(input: {
  portalCode: string;
  phone: string;
}) {
  const session = await openCustomerPortal(input);
  return markMeterInstalledInternal({
    leadId: session.lead.id,
    companyId: session.lead.company_id,
    actorId: null,
    via: "portal",
  });
}

export async function portalMarkSubsidyReceived(input: {
  portalCode: string;
  phone: string;
}) {
  const session = await openCustomerPortal(input);
  return markSubsidyReceivedInternal({
    leadId: session.lead.id,
    companyId: session.lead.company_id,
    actorId: null,
    via: "portal",
  });
}
