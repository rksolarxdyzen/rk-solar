"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, hasAuthority } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import {
  INSTALL_PHOTO_KINDS,
  expectedInstallPanelCount,
  installationCrewGate,
  isInstallSupervisorRole,
  type CrewJobBrief,
  type InstallationPhoto,
} from "@/lib/domain/installation";
import {
  SURVEY_PHOTO_DOC_TYPES,
  SURVEY_PHOTO_SLOTS,
  type SurveyPhotoKey,
} from "@/lib/domain/survey-photos";
import { issuePortalCode } from "@/lib/domain/issue-portal-code";
import {
  assertProfileInPool,
  listProfilesInPool,
} from "@/lib/assignment-pool-profiles";

function mapInstallDbError(error: { message: string }) {
  const m = error.message;
  if (
    /does not exist/i.test(m) &&
    /inverter_serial|install_geo|expected_serial|installation_panel_serials|storage_path/i.test(m)
  ) {
    return new Error(
      "Database is missing installation fields. Run supabase/migrations/046_installation_supervisor_proofs.sql in the SQL editor."
    );
  }
  return new Error(m);
}

async function canAssign(profile: { id: string; role: string }) {
  return (
    profile.role === "admin" ||
    profile.role === "ops_coordinator" ||
    (await hasAuthority(profile.id, "assign_installation_crew")) ||
    (await hasAuthority(profile.id, "full_access"))
  );
}

async function canUpload(profile: { id: string; role: string }) {
  return (
    profile.role === "admin" ||
    profile.role === "ops_coordinator" ||
    profile.role === "installation_crew" ||
    (await hasAuthority(profile.id, "upload_installation_proofs")) ||
    (await hasAuthority(profile.id, "upload_panel_barcodes")) ||
    (await hasAuthority(profile.id, "full_access"))
  );
}

async function canComplete(profile: { id: string; role: string }) {
  return (
    profile.role === "admin" ||
    profile.role === "ops_coordinator" ||
    profile.role === "installation_crew" ||
    (await hasAuthority(profile.id, "complete_installation")) ||
    (await hasAuthority(profile.id, "full_access"))
  );
}

export async function listCrewMembers() {
  const profile = await requireAuth();
  const supabase = await createClient();
  return listProfilesInPool(supabase, profile.company_id, "installation_crew");
}

export async function listInstallationPhotos(leadId: string) {
  await requireAuth();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("installation_photos")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true });
  if (error) throw mapInstallDbError(error);
  return (data ?? []) as InstallationPhoto[];
}

export async function listInstallationSerials(leadId: string) {
  await requireAuth();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("installation_panel_serials")
    .select("panel_index, serial_text, source")
    .eq("lead_id", leadId)
    .order("panel_index", { ascending: true });
  if (error) throw mapInstallDbError(error);
  return data ?? [];
}

export async function listInstallationQueue() {
  const profile = await requireAuth();
  const can =
    (await canAssign(profile)) ||
    (await canUpload(profile)) ||
    (await hasAuthority(profile.id, "view_installation_queue"));
  if (!can) throw new Error("Missing authority: view_installation_queue");

  const supabase = await createClient();
  const stages = [
    "pre_dispatch_verified",
    "installation_assigned",
    "installation_in_progress",
    "installation_completed",
  ];

  let q = supabase
    .from("leads")
    .select(
      "id, name, phone, city, sales_stage, assigned_crew_id, expected_panel_count, installation_assigned_at, installation_completed_at, crew:profiles!leads_assigned_crew_id_fkey(id, name)"
    )
    .eq("company_id", profile.company_id)
    .in("sales_stage", stages)
    .order("updated_at", { ascending: false });

  if (profile.role === "installation_crew") {
    q = q.eq("assigned_crew_id", profile.id);
  }

  const { data, error } = await q;
  if (error) throw mapInstallDbError(error);
  return data ?? [];
}

export async function assignInstallationCrew(input: {
  leadId: string;
  crewId: string;
  expectedPanelCount?: number | null;
}) {
  const profile = await requireAuth();
  if (!(await canAssign(profile))) {
    throw new Error("Missing authority: assign_installation_crew");
  }

  const supabase = await createClient();
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, sales_stage, company_id, assigned_crew_id")
    .eq("id", input.leadId)
    .eq("company_id", profile.company_id)
    .single();

  if (leadError || !lead) throw new Error("Lead not found");

  const allowed = new Set([
    "pre_dispatch_verified",
    "installation_assigned",
    "installation_in_progress",
  ]);
  if (!allowed.has(lead.sales_stage)) {
    throw new Error("Crew can be assigned after pre-dispatch is verified");
  }

  await assertProfileInPool(
    supabase,
    profile.company_id,
    input.crewId,
    "installation_crew",
    "Selected user is not in the Installation crew assignment list"
  );

  const nextStage =
    lead.sales_stage === "pre_dispatch_verified"
      ? "installation_assigned"
      : lead.sales_stage;

  let update = supabase
    .from("leads")
    .update({
      assigned_crew_id: input.crewId,
      expected_panel_count:
        input.expectedPanelCount != null && input.expectedPanelCount > 0
          ? Math.floor(input.expectedPanelCount)
          : null,
      expected_serial_count:
        input.expectedPanelCount != null && input.expectedPanelCount > 0
          ? Math.floor(input.expectedPanelCount)
          : null,
      installation_assigned_at: new Date().toISOString(),
      sales_stage: nextStage,
    })
    .eq("id", lead.id);

  if (lead.sales_stage === "pre_dispatch_verified") {
    update = update.is("assigned_crew_id", null);
  }

  const { data: updated, error } = await update.select("id").maybeSingle();

  if (error) throw mapInstallDbError(error);
  if (!updated) {
    throw new Error("This job is already assigned. Refresh and pick another file, or reassign from Assigned.");
  }

  if (nextStage !== lead.sales_stage) {
    await logAuditEvent({
      companyId: profile.company_id,
      leadId: lead.id,
      actorId: profile.id,
      eventType: "stage_change",
      entityType: "lead",
      entityId: lead.id,
      metadata: {
        from: lead.sales_stage,
        to: nextStage,
        crewId: input.crewId,
      },
    });
  }

  await logAuditEvent({
    companyId: profile.company_id,
    leadId: lead.id,
    actorId: profile.id,
    eventType: "installation_crew_assigned",
    entityType: "lead",
    entityId: lead.id,
    metadata: { crewId: input.crewId },
  });

  revalidatePath("/installation");
  revalidatePath("/pipeline");
  revalidatePath("/customers");
  return { ok: true };
}

const photoSchema = z.object({
  leadId: z.string().uuid(),
  photoKind: z.enum(INSTALL_PHOTO_KINDS),
  fileUrl: z.string().min(8, "Photo URL missing — upload the file again"),
  caption: z.string().optional().nullable(),
  panelIndex: z.number().int().positive().optional().nullable(),
  serialHint: z.string().optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
});

export async function addInstallationPhoto(input: z.infer<typeof photoSchema>) {
  const profile = await requireAuth();
  if (!(await canUpload(profile))) {
    throw new Error("Missing authority to upload installation proofs");
  }

  const parsedResult = photoSchema.safeParse(input);
  if (!parsedResult.success) {
    throw new Error(parsedResult.error.issues[0]?.message ?? "Invalid photo details");
  }
  const parsed = parsedResult.data;
  if (parsed.photoKind === "panel_image" && !parsed.panelIndex) {
    throw new Error("Panel number is required");
  }
  if (parsed.photoKind === "site" && (parsed.latitude == null || parsed.longitude == null)) {
    throw new Error("Enable location and retake the customer photo with GPS");
  }
  if (
    parsed.photoKind === "inverter_serial" &&
    (parsed.latitude == null || parsed.longitude == null)
  ) {
    throw new Error("Enable location and retake the inverter photo with GPS");
  }

  const supabase = await createClient();
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select(
      "id, sales_stage, company_id, assigned_crew_id, expected_panel_count, won_panel_quantity"
    )
    .eq("id", parsed.leadId)
    .eq("company_id", profile.company_id)
    .single();

  if (leadError || !lead) throw new Error("Lead not found");

  const installStages = new Set([
    "installation_assigned",
    "installation_in_progress",
  ]);
  if (!installStages.has(lead.sales_stage)) {
    throw new Error("Assign a crew before uploading installation proofs");
  }

  const isCrew = lead.assigned_crew_id === profile.id;
  const isOps = await canAssign(profile);
  if (!isCrew && !isOps && !(await hasAuthority(profile.id, "full_access"))) {
    throw new Error("Only the assigned crew (or Installation Supervisor) can upload proofs");
  }

  if (parsed.photoKind === "panel_image") {
    const needed = expectedInstallPanelCount(lead);
    const index = parsed.panelIndex!;
    if (index > needed) {
      throw new Error(`This job only needs ${needed} panel photo${needed === 1 ? "" : "s"}`);
    }
    const existing = await listInstallationPhotos(lead.id);
    if (existing.some((p) => p.photo_kind === "panel_image" && p.panel_index === index)) {
      throw new Error(`Panel ${index} photo is already uploaded. Remove it first to retake.`);
    }
    if (index > 1) {
      const prev = existing.some(
        (p) => p.photo_kind === "panel_image" && p.panel_index === index - 1
      );
      if (!prev) {
        throw new Error(`Upload Panel ${index - 1} photo first`);
      }
    }
  }

  const lat = parsed.latitude ?? null;
  const lng = parsed.longitude ?? null;

  const { data: photo, error } = await supabase
    .from("installation_photos")
    .insert({
      company_id: profile.company_id,
      lead_id: lead.id,
      photo_kind: parsed.photoKind,
      file_url: parsed.fileUrl,
      caption: parsed.caption ?? null,
      panel_index: parsed.panelIndex ?? null,
      serial_hint: parsed.serialHint ?? null,
      latitude: lat,
      longitude: lng,
      uploaded_by: profile.id,
    })
    .select("*")
    .single();

  if (error) throw mapInstallDbError(error);

  if (lat != null && lng != null) {
    await supabase
      .from("leads")
      .update({
        install_geo_lat: lat,
        install_geo_lng: lng,
        install_geo_captured_at: new Date().toISOString(),
      })
      .eq("id", lead.id)
      .is("install_geo_lat", null);
  }

  if (lead.sales_stage === "installation_assigned") {
    await supabase
      .from("leads")
      .update({
        sales_stage: "installation_in_progress",
        installation_started_at: new Date().toISOString(),
      })
      .eq("id", lead.id);

    await logAuditEvent({
      companyId: profile.company_id,
      leadId: lead.id,
      actorId: profile.id,
      eventType: "stage_change",
      entityType: "lead",
      entityId: lead.id,
      metadata: {
        from: "installation_assigned",
        to: "installation_in_progress",
      },
    });
  }

  await logAuditEvent({
    companyId: profile.company_id,
    leadId: lead.id,
    actorId: profile.id,
    eventType: "installation_photo_added",
    entityType: "installation_photo",
    entityId: photo.id,
    metadata: { photoKind: parsed.photoKind, panelIndex: parsed.panelIndex },
  });

  revalidatePath("/installation");
  revalidatePath("/pipeline");
  revalidatePath("/customers");

  if (parsed.photoKind === "panel_image" && parsed.serialHint && parsed.panelIndex) {
    await supabase.from("installation_panel_serials").upsert(
      {
        company_id: profile.company_id,
        lead_id: lead.id,
        panel_index: parsed.panelIndex,
        serial_text: parsed.serialHint.trim(),
        source: "barcode",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "lead_id,panel_index" }
    );
  }

  const auto = await tryAutoCompleteInstallation(lead.id);
  return { ...(photo as InstallationPhoto), completed: auto.completed };
}

export async function deleteInstallationPhoto(photoId: string) {
  const profile = await requireAuth();
  const supabase = await createClient();
  const { data: photo } = await supabase
    .from("installation_photos")
    .select("*")
    .eq("id", photoId)
    .eq("company_id", profile.company_id)
    .maybeSingle();

  if (!photo) throw new Error("Photo not found");

  const ok =
    (await canAssign(profile)) || (await hasAuthority(profile.id, "full_access"));
  if (!ok) throw new Error("Uploaded proofs are locked. Ask the Installation Supervisor to remove one.");

  const { error } = await supabase
    .from("installation_photos")
    .delete()
    .eq("id", photoId);
  if (error) throw mapInstallDbError(error);

  revalidatePath("/installation");
  revalidatePath("/customers");
  return { ok: true };
}

const serialsSchema = z.object({
  leadId: z.string().uuid(),
  serials: z.array(
    z.object({
      panelIndex: z.number().int().positive(),
      serialText: z.string().trim().min(3, "Serial must be at least 3 characters"),
    })
  ),
  expectedSerialCount: z.number().int().positive().optional().nullable(),
});

export async function saveInstallationSerials(input: z.infer<typeof serialsSchema>) {
  const profile = await requireAuth();
  if (!(await canUpload(profile))) {
    throw new Error("Missing authority to save panel serials");
  }
  const parsed = serialsSchema.parse(input);
  const supabase = await createClient();
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, assigned_crew_id, company_id, sales_stage")
    .eq("id", parsed.leadId)
    .eq("company_id", profile.company_id)
    .single();
  if (leadError || !lead) throw new Error("Lead not found");

  const isCrew = lead.assigned_crew_id === profile.id;
  const isOps = await canAssign(profile);
  if (!isCrew && !isOps && !(await hasAuthority(profile.id, "full_access"))) {
    throw new Error("Only the assigned crew (or Installation Supervisor) can save serials");
  }

  const rows = parsed.serials.map((s) => ({
    company_id: profile.company_id,
    lead_id: lead.id,
    panel_index: s.panelIndex,
    serial_text: s.serialText.trim(),
    source: "typed" as const,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from("installation_panel_serials").upsert(rows, {
    onConflict: "lead_id,panel_index",
  });
  if (error) throw mapInstallDbError(error);

  if (parsed.expectedSerialCount && parsed.expectedSerialCount > 0) {
    await supabase
      .from("leads")
      .update({ expected_serial_count: parsed.expectedSerialCount })
      .eq("id", lead.id);
  }

  await logAuditEvent({
    companyId: profile.company_id,
    leadId: lead.id,
    actorId: profile.id,
    eventType: "installation_serials_saved",
    entityType: "lead",
    entityId: lead.id,
    metadata: { count: rows.length },
  });

  revalidatePath("/installation");
  revalidatePath("/customers");
  return { ok: true };
}

export async function saveInverterSerial(input: {
  leadId: string;
  serial: string;
}) {
  const profile = await requireAuth();
  if (!(await canUpload(profile))) {
    throw new Error("Missing authority to save inverter serial");
  }
  const serial = input.serial.trim();
  if (serial.length < 3) throw new Error("Inverter serial must be at least 3 characters");

  const supabase = await createClient();
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, assigned_crew_id, company_id, sales_stage")
    .eq("id", input.leadId)
    .eq("company_id", profile.company_id)
    .single();
  if (leadError || !lead) throw new Error("Lead not found");

  const isCrew = lead.assigned_crew_id === profile.id;
  const isOps = await canAssign(profile);
  if (!isCrew && !isOps && !(await hasAuthority(profile.id, "full_access"))) {
    throw new Error("Only the assigned crew (or Installation Supervisor) can save inverter serial");
  }

  const { error } = await supabase
    .from("leads")
    .update({ inverter_serial_number: serial })
    .eq("id", lead.id);
  if (error) throw mapInstallDbError(error);

  if (lead.sales_stage === "installation_assigned") {
    await supabase
      .from("leads")
      .update({
        sales_stage: "installation_in_progress",
        installation_started_at: new Date().toISOString(),
      })
      .eq("id", lead.id);
  }

  await logAuditEvent({
    companyId: profile.company_id,
    leadId: lead.id,
    actorId: profile.id,
    eventType: "inverter_serial_saved",
    entityType: "lead",
    entityId: lead.id,
    metadata: { serial },
  });

  revalidatePath("/installation");
  revalidatePath("/customers");
  const auto = await tryAutoCompleteInstallation(lead.id);
  return { ok: true, completed: auto.completed };
}

async function tryAutoCompleteInstallation(leadId: string): Promise<{ completed: boolean }> {
  try {
    await completeInstallation(leadId);
    return { completed: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.startsWith("Missing proofs") || msg.includes("not in progress")) {
      return { completed: false };
    }
    throw err;
  }
}

export async function completeInstallation(leadId: string) {
  const profile = await requireAuth();
  if (!(await canComplete(profile))) {
    throw new Error("Missing authority: complete_installation");
  }

  const supabase = await createClient();
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select(
      "id, name, sales_stage, company_id, assigned_crew_id, expected_panel_count, won_panel_quantity, inverter_serial_number, install_geo_lat, install_geo_lng, portal_code, installation_completed_at"
    )
    .eq("id", leadId)
    .eq("company_id", profile.company_id)
    .single();

  if (leadError) throw mapInstallDbError(leadError);
  if (!lead) throw new Error("Lead not found");

  if (
    lead.sales_stage === "liaison_in_progress" ||
    lead.sales_stage === "installation_completed" ||
    Boolean(lead.installation_completed_at)
  ) {
    return { ok: true, already: true, notified: [] as const, portalCode: lead.portal_code };
  }

  if (
    lead.sales_stage !== "installation_in_progress" &&
    lead.sales_stage !== "installation_assigned"
  ) {
    throw new Error("Installation is not in progress");
  }

  const isCrew = lead.assigned_crew_id === profile.id;
  const isOps = await canAssign(profile);
  if (!isCrew && !isOps && !(await hasAuthority(profile.id, "full_access"))) {
    throw new Error("Only the assigned crew (or Installation Supervisor) can complete installation");
  }

  const photos = await listInstallationPhotos(leadId);
  const gate = installationCrewGate({
    photos,
    expectedPanelCount: expectedInstallPanelCount(lead),
    inverterSerialNumber: lead.inverter_serial_number,
    leadHasGeo: lead.install_geo_lat != null && lead.install_geo_lng != null,
  });
  if (!gate.ok) {
    throw new Error(`Missing proofs: ${gate.missing.join("; ")}`);
  }

  const portalCode = lead.portal_code || (await issuePortalCode(supabase));

  const { error } = await supabase
    .from("leads")
    .update({
      sales_stage: "liaison_in_progress",
      installation_completed_at: new Date().toISOString(),
      ...(lead.portal_code ? {} : { portal_code: portalCode }),
    })
    .eq("id", lead.id);

  if (error) throw new Error(error.message);

  const audiences = ["accounts", "sales", "liaison"] as const;
  await supabase.from("notification_outbox").insert(
    audiences.map((audience) => ({
      company_id: profile.company_id,
      lead_id: lead.id,
      event_type: "installation_completed",
      audience,
      payload: {
        leadName: lead.name,
        photoCount: photos.length,
        panelCount: gate.panelImageCount,
        portalCode,
      },
      status: "pending",
    }))
  );

  await logAuditEvent({
    companyId: profile.company_id,
    leadId: lead.id,
    actorId: profile.id,
    eventType: "stage_change",
    entityType: "lead",
    entityId: lead.id,
    metadata: {
      from: lead.sales_stage,
      to: "installation_completed",
    },
  });

  await logAuditEvent({
    companyId: profile.company_id,
    leadId: lead.id,
    actorId: profile.id,
    eventType: "stage_change",
    entityType: "lead",
    entityId: lead.id,
    metadata: {
      from: "installation_completed",
      to: "liaison_in_progress",
      portalCode,
    },
  });

  await logAuditEvent({
    companyId: profile.company_id,
    leadId: lead.id,
    actorId: profile.id,
    eventType: "installation_completed",
    entityType: "lead",
    entityId: lead.id,
    metadata: { notified: audiences, portalCode },
  });

  revalidatePath("/installation");
  revalidatePath("/liaison");
  revalidatePath("/payments");
  revalidatePath("/pipeline");
  revalidatePath("/customers");
  return { ok: true, notified: audiences, portalCode };
}

export type CrewJobBriefResult =
  | { ok: true; brief: CrewJobBrief }
  | { ok: false; error: string };

export async function getCrewJobBrief(leadId: string): Promise<CrewJobBriefResult> {
  const profile = await requireAuth();
  if (!(await canUpload(profile))) {
    return { ok: false, error: "Cannot load this job" };
  }

  const supabase = await createClient();
  type BriefLeadRow = {
    id: string;
    name: string;
    phone: string;
    city: string | null;
    company_id: string;
    assigned_crew_id: string | null;
    sales_stage: string;
    expected_panel_count: number | null;
    won_panel_quantity: number | null;
    won_panel_name: string | null;
    won_inverter_company: string | null;
    won_system_size_kw: number | null;
    consumer_number?: string | null;
    company_bears_subsidy?: boolean | null;
    inverter_serial_number: string | null;
    install_geo_lat: number | null;
    install_geo_lng: number | null;
    installation_completed_at: string | null;
  };

  const fullSelect =
    "id, name, phone, city, company_id, assigned_crew_id, sales_stage, expected_panel_count, won_panel_quantity, won_panel_name, won_inverter_company, won_system_size_kw, consumer_number, company_bears_subsidy, inverter_serial_number, install_geo_lat, install_geo_lng, installation_completed_at";
  const slimSelect =
    "id, name, phone, city, company_id, assigned_crew_id, sales_stage, expected_panel_count, won_panel_quantity, won_panel_name, won_inverter_company, won_system_size_kw, inverter_serial_number, install_geo_lat, install_geo_lng, installation_completed_at";

  const first = await supabase
    .from("leads")
    .select(fullSelect)
    .eq("id", leadId)
    .eq("company_id", profile.company_id)
    .maybeSingle();

  let lead: BriefLeadRow | null = (first.data as BriefLeadRow | null) ?? null;
  let error = first.error;

  if (error && /consumer_number|company_bears_subsidy|column .* does not exist/i.test(error.message)) {
    const retry = await supabase
      .from("leads")
      .select(slimSelect)
      .eq("id", leadId)
      .eq("company_id", profile.company_id)
      .maybeSingle();
    lead = (retry.data as BriefLeadRow | null) ?? null;
    error = retry.error;
  }

  if (error || !lead) {
    return { ok: false, error: "Cannot load this job" };
  }

  const supervisor =
    isInstallSupervisorRole(profile.role) || (await canAssign(profile));
  if (!supervisor && lead.assigned_crew_id !== profile.id) {
    return { ok: false, error: "This job is not assigned to you." };
  }

  const jobOpen =
    !lead.installation_completed_at &&
    (lead.sales_stage === "installation_assigned" ||
      lead.sales_stage === "installation_in_progress");

  let survey: CrewJobBrief["survey"] = null;
  let surveyLoadError: string | null = null;
  const { data: surveyRow, error: surveyError } = await supabase
    .from("surveys")
    .select(
      "latitude, longitude, total_terrace_sqft, shadow_free_sqft, capacity_kw, feasibility_pass, notes"
    )
    .eq("lead_id", leadId)
    .eq("company_id", profile.company_id)
    .maybeSingle();

  if (surveyError) {
    surveyLoadError = "Survey could not be loaded.";
  } else if (surveyRow) {
    survey = {
      latitude: surveyRow.latitude,
      longitude: surveyRow.longitude,
      totalTerraceSqft: surveyRow.total_terrace_sqft,
      shadowFreeSqft: surveyRow.shadow_free_sqft,
      capacityKw: surveyRow.capacity_kw,
      feasibilityPass: surveyRow.feasibility_pass,
      notes: surveyRow.notes,
    };
  }

  const surveyPhotos: Partial<Record<SurveyPhotoKey, string>> = {};
  const { data: docs, error: docsError } = await supabase
    .from("portal_documents")
    .select("doc_type, file_url, created_at")
    .eq("lead_id", leadId)
    .eq("company_id", profile.company_id)
    .in("doc_type", [...SURVEY_PHOTO_DOC_TYPES])
    .order("created_at", { ascending: false });

  if (docsError && !surveyLoadError) {
    surveyLoadError = "Survey photos could not be loaded.";
  } else {
    for (const slot of SURVEY_PHOTO_SLOTS) {
      const row = (docs ?? []).find((d) => d.doc_type === slot.docType);
      if (row?.file_url) surveyPhotos[slot.key] = row.file_url;
    }
  }

  return {
    ok: true,
    brief: {
      id: lead.id,
      company_id: lead.company_id,
      name: lead.name,
      phone: lead.phone,
      city: lead.city,
      expected_panel_count: lead.expected_panel_count,
      won_panel_quantity: lead.won_panel_quantity,
      inverter_serial_number: lead.inverter_serial_number,
      install_geo_lat: lead.install_geo_lat,
      install_geo_lng: lead.install_geo_lng,
      installation_completed_at: lead.installation_completed_at,
      jobOpen,
      won: {
        panelName: lead.won_panel_name ?? null,
        panelQuantity: lead.won_panel_quantity ?? null,
        inverterCompany: lead.won_inverter_company ?? null,
        systemSizeKw:
          lead.won_system_size_kw != null ? Number(lead.won_system_size_kw) : null,
        consumerNumber: lead.consumer_number ?? null,
        companyBearsSubsidy:
          lead.company_bears_subsidy == null ? null : Boolean(lead.company_bears_subsidy),
      },
      survey,
      surveyPhotos,
      surveyLoadError,
    },
  };
}
