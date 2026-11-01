"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth, hasAuthority } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { ownsLead } from "@/lib/leads/visibility";
import { canSeeAllLeads } from "@/lib/leads/visibility-server";
import {
  SURVEY_PHOTO_DOC_TYPES,
  SURVEY_PHOTO_SLOTS,
  type SurveyPhotoKey,
} from "@/lib/domain/survey-photos";
import { hasSupabaseServiceRoleKey } from "@/lib/env";
import type { Survey } from "@/lib/domain/types";

/** Accept any non-empty uploaded URL (public storage URLs vary by project). */
const optionalPhotoUrl = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined))
  .pipe(z.string().min(8).optional());

const surveyFormSchema = z.object({
  leadId: z.string().uuid(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  totalTerraceSqft: z.number().positive("Terrace area must be greater than 0"),
  shadowFreeSqft: z.number().min(0, "Shadow-free area cannot be negative"),
  capacityKw: z.number().positive("Capacity (kW) must be greater than 0"),
  feasibilityPass: z.boolean(),
  temperature: z.enum(["hot", "warm", "cold"]).optional(),
  notes: z.string().optional(),
  photos: z
    .object({
      gps: optionalPhotoUrl,
      roof: optionalPhotoUrl,
      shadow: optionalPhotoUrl,
      access: optionalPhotoUrl,
    })
    .optional(),
});

export type SurveyFormInput = z.infer<typeof surveyFormSchema>;

async function assertCanSurveyLead(leadId: string) {
  const profile = await requireAuth();
  const supabase = await createClient();
  const isManager = profile.role === "admin" || profile.role === "sales_manager";
  const hasSurveyAuth =
    isManager ||
    (await hasAuthority(profile.id, "conduct_survey")) ||
    (await hasAuthority(profile.id, "full_access"));

  const { data: lead, error } = await supabase
    .from("leads")
    .select(
      "id, company_id, sales_stage, name, assigned_surveyor_id, assigned_telecaller_id, assigned_to, assigned_crew_id, created_by, dealer_id"
    )
    .eq("id", leadId)
    .eq("company_id", profile.company_id)
    .single();

  if (error || !lead) throw new Error("Lead not found");

  // Anyone who can see / is assigned the lead may capture the digital form
  // (not only conduct_survey / assigned surveyor).
  const canAccess =
    hasSurveyAuth ||
    ownsLead(profile, lead) ||
    (await canSeeAllLeads(profile));
  if (!canAccess) {
    throw new Error("You do not have access to survey this lead");
  }

  if (lead.sales_stage === "lost") {
    throw new Error("Cannot survey a lost lead");
  }

  // Allow walk-in / general capture beside Schedule visit (new_lead / contacted),
  // not only after a visit is booked.
  if (
    lead.sales_stage !== "new_lead" &&
    lead.sales_stage !== "contacted" &&
    lead.sales_stage !== "visit_scheduled" &&
    lead.sales_stage !== "survey_in_progress" &&
    lead.sales_stage !== "survey_completed"
  ) {
    throw new Error("Cannot capture survey data in this stage");
  }

  return { profile, supabase, lead, isManager };
}

export async function getSurveyForLead(leadId: string): Promise<Survey | null> {
  const profile = await requireAuth();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("surveys")
    .select("*")
    .eq("lead_id", leadId)
    .eq("company_id", profile.company_id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as Survey | null;
}

/** Existing survey site photos for the form / Docs tab. */
export async function getSurveySitePhotos(
  leadId: string
): Promise<Partial<Record<SurveyPhotoKey, string>>> {
  const profile = await requireAuth();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("portal_documents")
    .select("doc_type, file_url, created_at")
    .eq("lead_id", leadId)
    .eq("company_id", profile.company_id)
    .in("doc_type", [...SURVEY_PHOTO_DOC_TYPES])
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const out: Partial<Record<SurveyPhotoKey, string>> = {};
  for (const slot of SURVEY_PHOTO_SLOTS) {
    const row = (data ?? []).find((d) => d.doc_type === slot.docType);
    if (row?.file_url) out[slot.key] = row.file_url;
  }
  return out;
}

/** Mark survey in progress (optional step before form submit). */
export async function startSurvey(leadId: string) {
  const { profile, supabase, lead } = await assertCanSurveyLead(leadId);

  if (lead.sales_stage === "survey_completed") {
    return { sales_stage: lead.sales_stage };
  }

  if (lead.sales_stage === "survey_in_progress") {
    return { sales_stage: lead.sales_stage };
  }

  const { data, error } = await supabase
    .from("leads")
    .update({ sales_stage: "survey_in_progress" })
    .eq("id", leadId)
    .eq("company_id", profile.company_id)
    .select("id, sales_stage")
    .single();

  if (error) throw new Error(error.message);

  await logAuditEvent({
    companyId: profile.company_id,
    leadId,
    actorId: profile.id,
    eventType: "stage_change",
    entityType: "lead",
    entityId: leadId,
    metadata: { from: lead.sales_stage, to: "survey_in_progress" },
  });

  revalidatePath("/pipeline");
  revalidatePath(`/leads/${leadId}`);
  return data;
}

async function upsertSurveySiteDocuments(input: {
  companyId: string;
  leadId: string;
  uploadedBy: string;
  photos: NonNullable<SurveyFormInput["photos"]>;
}) {
  const rows = SURVEY_PHOTO_SLOTS.filter((slot) => Boolean(input.photos[slot.key])).map(
    (slot) => ({
      company_id: input.companyId,
      lead_id: input.leadId,
      doc_type: slot.docType,
      title: slot.title,
      file_url: input.photos[slot.key] as string,
      uploaded_by: input.uploadedBy,
      uploaded_by_customer: false,
      visible_to_customer: true,
    })
  );

  if (rows.length === 0) return;

  const supabase = await createClient();

  await supabase
    .from("portal_documents")
    .delete()
    .eq("lead_id", input.leadId)
    .eq("company_id", input.companyId)
    .in("doc_type", [...SURVEY_PHOTO_DOC_TYPES]);

  const userInsert = await supabase.from("portal_documents").insert(rows);
  if (!userInsert.error) return;

  if (!hasSupabaseServiceRoleKey()) {
    throw new Error(
      userInsert.error.message ||
        "Could not save site photos. Apply migration 029_proofs_upload_hardening.sql, or set SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  const admin = createAdminClient();
  await admin
    .from("portal_documents")
    .delete()
    .eq("lead_id", input.leadId)
    .eq("company_id", input.companyId)
    .in("doc_type", [...SURVEY_PHOTO_DOC_TYPES]);

  const { error } = await admin.from("portal_documents").insert(rows);
  if (error) throw new Error(error.message);
}

/** Save + complete digital survey → survey_completed. */
export async function completeSurvey(input: SurveyFormInput) {
  const parsedResult = surveyFormSchema.safeParse(input);
  if (!parsedResult.success) {
    throw new Error(parsedResult.error.issues[0]?.message ?? "Invalid survey details");
  }
  const parsed = parsedResult.data;
  if (parsed.shadowFreeSqft > parsed.totalTerraceSqft) {
    throw new Error("Shadow-free area cannot exceed total terrace area");
  }

  const { profile, supabase, lead } = await assertCanSurveyLead(parsed.leadId);

  const surveyPayload = {
    company_id: profile.company_id,
    lead_id: parsed.leadId,
    surveyed_by: profile.id,
    latitude: parsed.latitude,
    longitude: parsed.longitude,
    total_terrace_sqft: parsed.totalTerraceSqft,
    shadow_free_sqft: parsed.shadowFreeSqft,
    capacity_kw: parsed.capacityKw,
    feasibility_pass: parsed.feasibilityPass,
    notes: parsed.notes?.trim() || null,
    completed_at: new Date().toISOString(),
  };

  const { data: existing } = await supabase
    .from("surveys")
    .select("id")
    .eq("lead_id", parsed.leadId)
    .eq("company_id", profile.company_id)
    .maybeSingle();

  let survey: Survey;
  if (existing?.id) {
    const { data, error } = await supabase
      .from("surveys")
      .update(surveyPayload)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    survey = data as Survey;
  } else {
    const { data, error } = await supabase
      .from("surveys")
      .insert(surveyPayload)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    survey = data as Survey;
  }

  if (parsed.photos) {
    await upsertSurveySiteDocuments({
      companyId: profile.company_id,
      leadId: parsed.leadId,
      uploadedBy: profile.id,
      photos: parsed.photos,
    });
  }

  const { data: updatedLead, error: leadError } = await supabase
    .from("leads")
    .update({
      sales_stage: "survey_completed",
      roof_area_sqft: parsed.totalTerraceSqft,
      recommended_system_kw: parsed.capacityKw,
      ...(parsed.temperature ? { temperature: parsed.temperature } : {}),
    })
    .eq("id", parsed.leadId)
    .eq("company_id", profile.company_id)
    .select("id, sales_stage")
    .single();

  if (leadError) throw new Error(leadError.message);

  await supabase
    .from("reminders")
    .update({ resolved_at: new Date().toISOString() })
    .eq("lead_id", parsed.leadId)
    .eq("company_id", profile.company_id)
    .eq("reminder_type", "survey_scheduled")
    .is("resolved_at", null);

  if (lead.sales_stage !== "survey_completed") {
    await logAuditEvent({
      companyId: profile.company_id,
      leadId: parsed.leadId,
      actorId: profile.id,
      eventType: "stage_change",
      entityType: "lead",
      entityId: parsed.leadId,
      metadata: { from: lead.sales_stage, to: "survey_completed" },
    });
  }

  await logAuditEvent({
    companyId: profile.company_id,
    leadId: parsed.leadId,
    actorId: profile.id,
    eventType: "survey_completed",
    entityType: "survey",
    entityId: survey.id,
    metadata: {
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      totalTerraceSqft: parsed.totalTerraceSqft,
      shadowFreeSqft: parsed.shadowFreeSqft,
      capacityKw: parsed.capacityKw,
      feasibilityPass: parsed.feasibilityPass,
      temperature: parsed.temperature,
      photos: parsed.photos
        ? Object.entries(parsed.photos)
            .filter(([, url]) => Boolean(url))
            .map(([key]) => key)
        : [],
    },
  });

  revalidatePath("/pipeline");
  revalidatePath("/alerts");
  revalidatePath("/reminders");
  revalidatePath("/customers");
  revalidatePath(`/leads/${parsed.leadId}`);
  return { survey, lead: updatedLead };
}

/** Managers / sales may see quote CTA; surveyors too for handoff visibility. */
export async function canShowQuotePlaceholder(leadId: string): Promise<boolean> {
  const profile = await requireAuth();
  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("sales_stage")
    .eq("id", leadId)
    .eq("company_id", profile.company_id)
    .maybeSingle();

  if (!lead || lead.sales_stage !== "survey_completed") return false;

  if (profile.role === "admin" || profile.role === "sales_manager" || profile.role === "sales_executive") {
    return true;
  }
  return (
    (await hasAuthority(profile.id, "view_all_leads")) ||
    (await hasAuthority(profile.id, "full_access")) ||
    (await hasAuthority(profile.id, "conduct_survey"))
  );
}
