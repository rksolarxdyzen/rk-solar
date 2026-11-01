import { createAdminClient } from "@/lib/supabase/admin";
import type { LeadSource } from "@/lib/domain/workflow";

export type IngestLeadInput = {
  companyId: string;
  source: Extract<LeadSource, "referral" | "facebook_ads">;
  name: string;
  phone: string;
  email?: string | null;
  city?: string | null;
  address?: string | null;
  requirementNotes?: string | null;
  sourceDetail?: string | null;
  externalId?: string | null;
  referrerName?: string | null;
  referrerPhone?: string | null;
  payload?: Record<string, unknown>;
};

export type IngestResult =
  | { status: "created"; leadId: string; eventId: string }
  | { status: "duplicate"; leadId: string | null; eventId: string }
  | { status: "error"; message: string; eventId?: string };

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  return digits;
}

/** Create lead via service role with ingest event + idempotency on external_id. */
export async function ingestLead(input: IngestLeadInput): Promise<IngestResult> {
  const admin = createAdminClient();
  const phone = normalizePhone(input.phone);
  const name = input.name.trim();

  if (name.length < 2) {
    return { status: "error", message: "Customer name is required" };
  }
  if (phone.length < 10) {
    return { status: "error", message: "Valid phone number is required" };
  }

  const externalId = input.externalId?.trim() || null;
  const channel = input.source;

  // Idempotency: existing lead with same external_id
  if (externalId) {
    const { data: existingLead } = await admin
      .from("leads")
      .select("id")
      .eq("company_id", input.companyId)
      .eq("external_id", externalId)
      .maybeSingle();

    if (existingLead) {
      const { data: event } = await admin
        .from("lead_ingest_events")
        .insert({
          company_id: input.companyId,
          channel,
          external_id: externalId,
          payload: input.payload ?? {},
          lead_id: existingLead.id,
          status: "duplicate",
        })
        .select("id")
        .single();

      return {
        status: "duplicate",
        leadId: existingLead.id,
        eventId: event?.id ?? "",
      };
    }
  }

  const { data: event, error: eventError } = await admin
    .from("lead_ingest_events")
    .insert({
      company_id: input.companyId,
      channel,
      external_id: externalId,
      payload: input.payload ?? {},
      status: "received",
    })
    .select("id")
    .single();

  if (eventError) {
    // Unique violation on ingest event → treat as duplicate race
    if (eventError.code === "23505" && externalId) {
      const { data: existing } = await admin
        .from("leads")
        .select("id")
        .eq("company_id", input.companyId)
        .eq("external_id", externalId)
        .maybeSingle();
      return {
        status: "duplicate",
        leadId: existing?.id ?? null,
        eventId: "",
      };
    }
    return { status: "error", message: eventError.message };
  }

  const { data: lead, error: leadError } = await admin
    .from("leads")
    .insert({
      company_id: input.companyId,
      name,
      phone,
      email: input.email?.trim() || null,
      city: input.city?.trim() || null,
      address: input.address?.trim() || null,
      requirement_notes: input.requirementNotes?.trim() || null,
      source: channel,
      source_detail: input.sourceDetail?.trim() || null,
      external_id: externalId,
      referrer_name: input.referrerName?.trim() || null,
      referrer_phone: input.referrerPhone ? normalizePhone(input.referrerPhone) : null,
      temperature: "warm",
      sales_stage: "new_lead",
    })
    .select("id")
    .single();

  if (leadError) {
    await admin
      .from("lead_ingest_events")
      .update({ status: "error", error_message: leadError.message })
      .eq("id", event.id);

    if (leadError.code === "23505" && externalId) {
      const { data: existing } = await admin
        .from("leads")
        .select("id")
        .eq("company_id", input.companyId)
        .eq("external_id", externalId)
        .maybeSingle();
      return {
        status: "duplicate",
        leadId: existing?.id ?? null,
        eventId: event.id,
      };
    }
    return { status: "error", message: leadError.message, eventId: event.id };
  }

  await admin
    .from("lead_ingest_events")
    .update({ status: "created", lead_id: lead.id })
    .eq("id", event.id);

  await admin.from("audit_events").insert({
    company_id: input.companyId,
    lead_id: lead.id,
    actor_id: null,
    event_type: "lead_ingested",
    entity_type: "lead",
    entity_id: lead.id,
    metadata: { channel, externalId, eventId: event.id },
  });

  return { status: "created", leadId: lead.id, eventId: event.id };
}

export async function resolveCompanyBySlug(slug: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("companies")
    .select("id, name, slug")
    .eq("slug", slug)
    .maybeSingle();
  return data;
}

export async function resolveReferralLink(code: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("referral_links")
    .select("id, company_id, code, label, is_active, company:companies(id, name, slug)")
    .eq("code", code)
    .eq("is_active", true)
    .maybeSingle();
  return data;
}
