"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth, hasAuthority } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import {
  computeCleaningDueAt,
  isCleaningDue,
  SERVICE_OFFER_ENGINEER_LIMIT,
} from "@/lib/domain/maintenance";
import { openCustomerPortal } from "@/actions/liaison";
import { loadPortalTicketsForLead } from "@/lib/portal/portal-tickets";
import { hasSupabaseServiceRoleKey } from "@/lib/env";
import {
  assertProofFileSize,
  assertServiceTicketVideoDuration,
  fileExtension,
  readFormDataFile,
  isVideoContentType,
  resolveProofContentType,
} from "@/lib/uploads/proof-mime";
import {
  assertProfileInPool,
  listProfilesInPool,
} from "@/lib/assignment-pool-profiles";

async function canViewTickets(profile: { id: string; role: string }) {
  return (
    profile.role === "admin" ||
    profile.role === "service_engineer" ||
    profile.role === "service_supervisor" ||
    profile.role === "sales_manager" ||
    (await hasAuthority(profile.id, "view_service_tickets")) ||
    (await hasAuthority(profile.id, "full_access"))
  );
}

async function canAccept(profile: { id: string; role: string }) {
  return (
    profile.role === "admin" ||
    profile.role === "service_engineer" ||
    profile.role === "service_supervisor" ||
    (await hasAuthority(profile.id, "accept_service_ticket")) ||
    (await hasAuthority(profile.id, "full_access"))
  );
}

async function canResolve(profile: { id: string; role: string }) {
  return (
    profile.role === "admin" ||
    profile.role === "service_engineer" ||
    profile.role === "service_supervisor" ||
    (await hasAuthority(profile.id, "resolve_service_ticket")) ||
    (await hasAuthority(profile.id, "full_access"))
  );
}

async function canForceAssign(profile: { id: string; role: string }) {
  return (
    profile.role === "admin" ||
    profile.role === "service_supervisor" ||
    (await hasAuthority(profile.id, "force_assign_service_ticket")) ||
    (await hasAuthority(profile.id, "full_access"))
  );
}

async function pickEngineers(companyId: string, limit = SERVICE_OFFER_ENGINEER_LIMIT) {
  const admin = createAdminClient();
  const all = await listProfilesInPool(admin, companyId, "service_engineer");
  // Auto-offers: prefer profiles whose enum/role slug is service_engineer when possible
  const preferred = all.filter((e) => e.role === "service_engineer");
  const pool = preferred.length ? preferred : all;
  return pool.slice(0, limit).map((e) => ({ id: e.id, name: e.name }));
}

async function fanOutOffers(input: {
  companyId: string;
  ticketId: string;
  leadId: string;
  description: string;
}) {
  const engineers = await pickEngineers(input.companyId);
  const admin = createAdminClient();

  if (engineers.length === 0) {
    await admin.from("notification_outbox").insert({
      company_id: input.companyId,
      lead_id: input.leadId,
      event_type: "service_ticket_needs_supervisor",
      audience: "service_supervisor",
      payload: {
        ticketId: input.ticketId,
        reason: "no_engineers",
        description: input.description,
      },
      status: "pending",
    });
    return { offered: 0 };
  }

  await admin.from("service_ticket_offers").insert(
    engineers.map((e) => ({
      company_id: input.companyId,
      ticket_id: input.ticketId,
      engineer_id: e.id,
      status: "offered",
    }))
  );

  await admin.from("notification_outbox").insert(
    engineers.map((e) => ({
      company_id: input.companyId,
      lead_id: input.leadId,
      event_type: "service_ticket_raised",
      audience: "service_engineer",
      payload: {
        ticketId: input.ticketId,
        engineerId: e.id,
        description: input.description,
      },
      status: "pending",
    }))
  );

  return { offered: engineers.length };
}

export async function listServiceTickets() {
  const profile = await requireAuth();
  if (!(await canViewTickets(profile))) {
    throw new Error("Missing authority: view_service_tickets");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_tickets")
    .select(
      `
      *,
      lead:leads(id, name, phone, city, portal_code, sales_stage),
      assignee:profiles!service_tickets_assigned_to_fkey(id, name),
      offers:service_ticket_offers(
        id, engineer_id, status, responded_at,
        engineer:profiles!service_ticket_offers_engineer_id_fkey(id, name)
      ),
      photos:service_ticket_photos(id, file_url, caption, created_at)
    `
    )
    .eq("company_id", profile.company_id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listServiceEngineers() {
  const profile = await requireAuth();
  if (!(await canForceAssign(profile))) {
    throw new Error("Missing authority: force_assign_service_ticket");
  }

  const supabase = await createClient();
  return listProfilesInPool(supabase, profile.company_id, "service_engineer");
}

export async function acceptServiceTicket(ticketId: string) {
  const profile = await requireAuth();
  if (!(await canAccept(profile))) {
    throw new Error("Missing authority: accept_service_ticket");
  }

  const supabase = await createClient();
  const { data: ticket, error } = await supabase
    .from("service_tickets")
    .select("id, company_id, lead_id, status, assigned_to")
    .eq("id", ticketId)
    .eq("company_id", profile.company_id)
    .single();

  if (error || !ticket) throw new Error("Ticket not found");
  if (ticket.status !== "raised" || ticket.assigned_to) {
    throw new Error("Ticket already claimed");
  }

  const { data: offer } = await supabase
    .from("service_ticket_offers")
    .select("id, status")
    .eq("ticket_id", ticketId)
    .eq("engineer_id", profile.id)
    .maybeSingle();

  const isSupervisor =
    profile.role === "admin" ||
    profile.role === "service_supervisor" ||
    (await hasAuthority(profile.id, "force_assign_service_ticket"));

  if (!offer && !isSupervisor) {
    throw new Error("You were not offered this ticket");
  }
  if (offer && offer.status === "rejected") {
    throw new Error("You already rejected this ticket");
  }

  const now = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from("service_tickets")
    .update({
      status: "accepted",
      assigned_to: profile.id,
      accepted_at: now,
      updated_at: now,
    })
    .eq("id", ticketId)
    .eq("status", "raised")
    .is("assigned_to", null)
    .select("id")
    .maybeSingle();

  if (claimError) throw new Error(claimError.message);
  if (!claimed) throw new Error("Another engineer already accepted this ticket");

  if (offer) {
    await supabase
      .from("service_ticket_offers")
      .update({ status: "accepted", responded_at: now })
      .eq("id", offer.id);
  } else {
  await supabase.from("service_ticket_offers").upsert(
    {
      company_id: profile.company_id,
      ticket_id: ticketId,
      engineer_id: profile.id,
      status: "accepted",
      responded_at: now,
    },
    { onConflict: "ticket_id,engineer_id" }
  );
  }

  await supabase
    .from("service_ticket_offers")
    .update({ status: "expired", responded_at: now })
    .eq("ticket_id", ticketId)
    .eq("status", "offered")
    .neq("engineer_id", profile.id);

  await logAuditEvent({
    companyId: profile.company_id,
    leadId: ticket.lead_id,
    actorId: profile.id,
    eventType: "service_ticket_accepted",
    entityType: "service_ticket",
    entityId: ticketId,
    metadata: {},
  });

  revalidatePath("/maintenance");
  revalidatePath("/portal");
  return { ok: true };
}

export async function rejectServiceTicket(ticketId: string) {
  const profile = await requireAuth();
  if (!(await canAccept(profile))) {
    throw new Error("Missing authority: accept_service_ticket");
  }

  const supabase = await createClient();
  const { data: offer, error } = await supabase
    .from("service_ticket_offers")
    .select("id, ticket_id, status")
    .eq("ticket_id", ticketId)
    .eq("engineer_id", profile.id)
    .single();

  if (error || !offer) throw new Error("Offer not found");
  if (offer.status !== "offered") throw new Error("Offer is no longer open");

  const now = new Date().toISOString();
  await supabase
    .from("service_ticket_offers")
    .update({ status: "rejected", responded_at: now })
    .eq("id", offer.id);

  const { data: remaining } = await supabase
    .from("service_ticket_offers")
    .select("id, status")
    .eq("ticket_id", ticketId);

  const stillOpen = (remaining ?? []).some((o) => o.status === "offered");
  const allRejected =
    (remaining ?? []).length > 0 &&
    (remaining ?? []).every((o) => o.status === "rejected" || o.status === "expired");

  if (!stillOpen || allRejected) {
    const { data: ticket } = await supabase
      .from("service_tickets")
      .select("id, lead_id, company_id, description, assigned_to, status")
      .eq("id", ticketId)
      .single();

    if (ticket && ticket.status === "raised" && !ticket.assigned_to) {
      await supabase.from("notification_outbox").insert({
        company_id: ticket.company_id,
        lead_id: ticket.lead_id,
        event_type: "service_ticket_needs_supervisor",
        audience: "service_supervisor",
        payload: {
          ticketId,
          reason: "all_rejected",
          description: ticket.description,
        },
        status: "pending",
      });
    }
  }

  revalidatePath("/maintenance");
  return { ok: true };
}

export async function forceAssignServiceTicket(input: {
  ticketId: string;
  engineerId: string;
}) {
  const profile = await requireAuth();
  if (!(await canForceAssign(profile))) {
    throw new Error("Missing authority: force_assign_service_ticket");
  }

  const supabase = await createClient();
  const { data: ticket, error } = await supabase
    .from("service_tickets")
    .select("id, company_id, lead_id, status, assigned_to")
    .eq("id", input.ticketId)
    .eq("company_id", profile.company_id)
    .single();

  if (error || !ticket) throw new Error("Ticket not found");
  if (ticket.status === "closed") throw new Error("Ticket is closed");
  if (ticket.assigned_to && ticket.status !== "raised") {
    throw new Error("Ticket already assigned");
  }

  const eng = await assertProfileInPool(
    supabase,
    profile.company_id,
    input.engineerId,
    "service_engineer",
    "Assignee must be in the Service engineer assignment list"
  );

  const now = new Date().toISOString();
  const { error: updError } = await supabase
    .from("service_tickets")
    .update({
      status: "accepted",
      assigned_to: eng.id,
      accepted_at: now,
      updated_at: now,
    })
    .eq("id", ticket.id);

  if (updError) throw new Error(updError.message);

  await supabase.from("service_ticket_offers").upsert(
    {
      company_id: profile.company_id,
      ticket_id: ticket.id,
      engineer_id: eng.id,
      status: "accepted",
      responded_at: now,
    },
    { onConflict: "ticket_id,engineer_id" }
  );

  await supabase
    .from("service_ticket_offers")
    .update({ status: "expired", responded_at: now })
    .eq("ticket_id", ticket.id)
    .eq("status", "offered")
    .neq("engineer_id", eng.id);

  await supabase.from("notification_outbox").insert({
    company_id: profile.company_id,
    lead_id: ticket.lead_id,
    event_type: "service_ticket_force_assigned",
    audience: "service_engineer",
    payload: { ticketId: ticket.id, engineerId: eng.id },
    status: "pending",
  });

  await logAuditEvent({
    companyId: profile.company_id,
    leadId: ticket.lead_id,
    actorId: profile.id,
    eventType: "service_ticket_force_assigned",
    entityType: "service_ticket",
    entityId: ticket.id,
    metadata: { engineerId: eng.id },
  });

  revalidatePath("/maintenance");
  return { ok: true };
}

export async function startServiceTicket(ticketId: string) {
  const profile = await requireAuth();
  if (!(await canResolve(profile))) {
    throw new Error("Missing authority: resolve_service_ticket");
  }

  const supabase = await createClient();
  const { data: ticket, error } = await supabase
    .from("service_tickets")
    .select("id, lead_id, status, assigned_to")
    .eq("id", ticketId)
    .eq("company_id", profile.company_id)
    .single();

  if (error || !ticket) throw new Error("Ticket not found");
  if (ticket.assigned_to !== profile.id && profile.role !== "admin") {
    throw new Error("Only the assigned engineer can start work");
  }
  if (ticket.status !== "accepted" && ticket.status !== "in_progress") {
    throw new Error("Ticket must be accepted first");
  }

  const now = new Date().toISOString();
  const { error: updError } = await supabase
    .from("service_tickets")
    .update({
      status: "in_progress",
      started_at: now,
      updated_at: now,
    })
    .eq("id", ticketId);

  if (updError) throw new Error(updError.message);

  revalidatePath("/maintenance");
  return { ok: true };
}

export async function closeServiceTicket(input: {
  ticketId: string;
  resolutionNotes?: string | null;
  proofUrls: string[];
}) {
  const profile = await requireAuth();
  if (!(await canResolve(profile))) {
    throw new Error("Missing authority: resolve_service_ticket");
  }

  const urls = input.proofUrls.map((u) => u.trim()).filter(Boolean);
  if (urls.length < 1) throw new Error("Add at least one proof photo or video URL");

  const supabase = await createClient();
  const { data: ticket, error } = await supabase
    .from("service_tickets")
    .select("id, lead_id, status, assigned_to, company_id")
    .eq("id", input.ticketId)
    .eq("company_id", profile.company_id)
    .single();

  if (error || !ticket) throw new Error("Ticket not found");
  if (ticket.status === "closed") throw new Error("Already closed");
  if (
    ticket.assigned_to !== profile.id &&
    profile.role !== "admin" &&
    profile.role !== "service_supervisor"
  ) {
    throw new Error("Only the assigned engineer (or supervisor) can close");
  }

  const now = new Date().toISOString();
  await supabase.from("service_ticket_photos").insert(
    urls.map((file_url) => ({
      company_id: profile.company_id,
      ticket_id: ticket.id,
      file_url,
      uploaded_by: profile.id,
    }))
  );

  const { error: updError } = await supabase
    .from("service_tickets")
    .update({
      status: "closed",
      closed_at: now,
      resolution_notes: input.resolutionNotes?.trim() || null,
      updated_at: now,
    })
    .eq("id", ticket.id);

  if (updError) throw new Error(updError.message);

  await logAuditEvent({
    companyId: profile.company_id,
    leadId: ticket.lead_id,
    actorId: profile.id,
    eventType: "service_ticket_closed",
    entityType: "service_ticket",
    entityId: ticket.id,
    metadata: { proofCount: urls.length },
  });

  revalidatePath("/maintenance");
  revalidatePath("/portal");
  return { ok: true };
}

export async function enqueueCleaningReminders() {
  const profile = await requireAuth();
  const ok =
    profile.role === "admin" ||
    profile.role === "service_supervisor" ||
    (await hasAuthority(profile.id, "enqueue_cleaning_reminders")) ||
    (await hasAuthority(profile.id, "full_access"));
  if (!ok) throw new Error("Missing authority: enqueue_cleaning_reminders");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select(
      "id, name, company_id, portal_code, cleaning_next_due_at, sales_stage"
    )
    .eq("company_id", profile.company_id)
    .eq("sales_stage", "completed")
    .not("cleaning_next_due_at", "is", null);

  if (error) throw new Error(error.message);

  let enqueued = 0;
  for (const lead of data ?? []) {
    if (!isCleaningDue(lead)) continue;

    await supabase.from("notification_outbox").insert({
      company_id: lead.company_id,
      lead_id: lead.id,
      event_type: "cleaning_reminder",
      audience: "customer",
      payload: {
        leadName: lead.name,
        portalCode: lead.portal_code,
        referralHint: true,
        message:
          "Please clean your solar panels for optimal yield. Know someone going solar? Share your referral link.",
      },
      status: "pending",
    });

    const next = computeCleaningDueAt(new Date());
    await supabase
      .from("leads")
      .update({
        cleaning_last_sent_at: new Date().toISOString(),
        cleaning_next_due_at: next.toISOString(),
      })
      .eq("id", lead.id);

    enqueued += 1;
  }

  revalidatePath("/maintenance");
  revalidatePath("/portal");
  return { enqueued };
}

/** Portal: raise ticket after phone+code auth. Requires ≥1 photo or video. */
export async function portalRaiseServiceTicket(input: {
  portalCode: string;
  phone: string;
  description: string;
  photoUrls: string[];
}) {
  const description = input.description.trim();
  if (description.length < 5) throw new Error("Describe the issue (min 5 characters)");

  const urls = (input.photoUrls ?? []).map((u) => u.trim()).filter(Boolean);
  if (urls.length < 1) throw new Error("Add at least one photo or video of the issue");

  const session = await openCustomerPortal({
    portalCode: input.portalCode,
    phone: input.phone,
  });

  const admin = createAdminClient();
  const { data: ticket, error } = await admin
    .from("service_tickets")
    .insert({
      company_id: session.lead.company_id,
      lead_id: session.lead.id,
      status: "raised",
      description,
      raised_via: "portal",
    })
    .select("id")
    .single();

  if (error || !ticket) throw new Error(error?.message ?? "Failed to raise ticket");

  const { error: photoError } = await admin.from("service_ticket_photos").insert(
    urls.map((file_url) => ({
      company_id: session.lead.company_id,
      ticket_id: ticket.id,
      file_url,
      caption: "issue",
      uploaded_by: null,
    }))
  );
  if (photoError) throw new Error(photoError.message);

  await fanOutOffers({
    companyId: session.lead.company_id,
    ticketId: ticket.id,
    leadId: session.lead.id,
    description,
  });

  await admin.from("audit_events").insert({
    company_id: session.lead.company_id,
    lead_id: session.lead.id,
    actor_id: null,
    event_type: "service_ticket_raised",
    entity_type: "service_ticket",
    entity_id: ticket.id,
    metadata: { via: "portal", description, photoCount: urls.length },
  });

  revalidatePath("/maintenance");
  revalidatePath("/portal");
  return { ok: true, ticketId: ticket.id };
}

/** Portal: upload an issue photo before raising a ticket. */
export async function portalUploadTicketPhoto(formData: FormData) {
  const portalCode = String(formData.get("portalCode") ?? "");
  const phone = String(formData.get("phone") ?? "");
  const { blob, name } = readFormDataFile(formData);
  assertProofFileSize(blob.size);
  let contentType: string;
  try {
    contentType = resolveProofContentType({ name, type: blob.type });
  } catch {
    throw new Error("Upload a photo (JPG, PNG, WebP)");
  }
  if (contentType === "application/pdf") {
    throw new Error("Upload a photo (JPG, PNG, WebP)");
  }
  if (isVideoContentType(contentType)) {
    assertServiceTicketVideoDuration(Number(formData.get("durationSeconds")));
  }

  const session = await openCustomerPortal({ portalCode, phone });
  if (!hasSupabaseServiceRoleKey()) {
    throw new Error(
      "Server is missing SUPABASE_SERVICE_ROLE_KEY. Add it in Vercel → Settings → Environment Variables, then redeploy."
    );
  }
  const admin = createAdminClient();
  const ext = fileExtension(name, "jpg");
  const path = `${session.lead.company_id}/tickets/raise/${session.lead.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const buffer = Buffer.from(await blob.arrayBuffer());
  const { error: uploadError } = await admin.storage.from("proofs").upload(path, buffer, {
    contentType,
    upsert: false,
  });
  if (uploadError) throw new Error(uploadError.message);

  const { getSupabaseEnv } = await import("@/lib/env");
  const { url } = getSupabaseEnv();
  const publicUrl = `${url.replace(/\/$/, "")}/storage/v1/object/public/proofs/${path}`;
  return { publicUrl };
}

export async function listPortalTickets(input: {
  portalCode: string;
  phone: string;
}) {
  const session = await openCustomerPortal(input);
  const admin = createAdminClient();
  return loadPortalTicketsForLead(admin, {
    id: session.lead.id,
    company_id: session.lead.company_id,
  });
}

/** Staff assist raise — requires ≥1 photo (Phase 5b). */
export async function staffRaiseServiceTicket(input: {
  leadId: string;
  description: string;
  photoUrls: string[];
}) {
  const profile = await requireAuth();
  if (!(await canForceAssign(profile)) && !(await canViewTickets(profile))) {
    throw new Error("Missing authority to raise tickets");
  }

  const parsed = z
    .object({
      leadId: z.string().uuid(),
      description: z.string().min(5),
      photoUrls: z.array(z.string()).min(1, "Add at least one photo of the issue"),
    })
    .parse(input);

  const urls = parsed.photoUrls.map((u) => u.trim()).filter(Boolean);
  if (urls.length < 1) throw new Error("Add at least one photo of the issue");

  const supabase = await createClient();
  const { data: lead, error } = await supabase
    .from("leads")
    .select("id, company_id, name")
    .eq("id", parsed.leadId)
    .eq("company_id", profile.company_id)
    .single();

  if (error || !lead) throw new Error("Lead not found");

  const { data: ticket, error: insError } = await supabase
    .from("service_tickets")
    .insert({
      company_id: profile.company_id,
      lead_id: lead.id,
      status: "raised",
      description: parsed.description,
      raised_via: "staff",
    })
    .select("id")
    .single();

  if (insError || !ticket) throw new Error(insError?.message ?? "Failed");

  // Admin insert bypasses resolve-only RLS on photos (create-time issue photos)
  const admin = createAdminClient();
  const { error: photoError } = await admin.from("service_ticket_photos").insert(
    urls.map((file_url) => ({
      company_id: profile.company_id,
      ticket_id: ticket.id,
      file_url,
      caption: "issue",
      uploaded_by: profile.id,
    }))
  );
  if (photoError) throw new Error(photoError.message);

  await fanOutOffers({
    companyId: profile.company_id,
    ticketId: ticket.id,
    leadId: lead.id,
    description: parsed.description,
  });

  await logAuditEvent({
    companyId: profile.company_id,
    leadId: lead.id,
    actorId: profile.id,
    eventType: "service_ticket_raised",
    entityType: "service_ticket",
    entityId: ticket.id,
    metadata: { via: "staff", photoCount: urls.length },
  });

  revalidatePath("/maintenance");
  return { ok: true, ticketId: ticket.id };
}
