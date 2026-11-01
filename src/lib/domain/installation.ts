export const INSTALL_PHOTO_KINDS = [
  "site",
  "panel_image",
  "panel_barcode",
  "inverter_serial",
  "completion_video",
  "other",
] as const;
export type InstallPhotoKind = (typeof INSTALL_PHOTO_KINDS)[number];

export const INSTALL_PHOTO_LABELS: Record<InstallPhotoKind, string> = {
  site: "Customer photo (with location)",
  panel_image: "Panel photo",
  panel_barcode: "Panel barcode / DCR",
  inverter_serial: "Inverter serial / nameplate",
  completion_video: "Site video",
  other: "Other (optional)",
};

export type InstallationPhoto = {
  id: string;
  company_id: string;
  lead_id: string;
  photo_kind: InstallPhotoKind;
  file_url: string;
  caption: string | null;
  panel_index: number | null;
  serial_hint: string | null;
  latitude: number | null;
  longitude: number | null;
  uploaded_by: string | null;
  created_at: string;
};

export type InstallationPanelSerial = {
  panel_index: number;
  serial_text: string;
  source?: "typed" | "ocr" | "barcode";
};

export function hasGeoTag(photo: {
  latitude?: number | null;
  longitude?: number | null;
}) {
  const lat = Number(photo.latitude);
  const lng = Number(photo.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

export function installationProofGate(input: {
  photos: Array<{
    photo_kind: string;
    latitude?: number | null;
    longitude?: number | null;
  }>;
  expectedPanelCount: number | null | undefined;
  serials?: Array<{ serial_text?: string | null }>;
  inverterSerialNumber?: string | null;
  leadHasGeo?: boolean;
}) {
  const needed = Math.max(1, Number(input.expectedPanelCount) || 1);
  const sitePhotos = input.photos.filter((p) => p.photo_kind === "site");
  const siteCount = sitePhotos.length;
  const siteWithGeo = sitePhotos.some(hasGeoTag) || Boolean(input.leadHasGeo);
  const panelImageCount = input.photos.filter((p) => p.photo_kind === "panel_image").length;
  const barcodeCount = input.photos.filter((p) => p.photo_kind === "panel_barcode").length;
  const inverterPhotoCount = input.photos.filter((p) => p.photo_kind === "inverter_serial").length;
  const typedSerials = (input.serials ?? []).filter((s) => String(s.serial_text ?? "").trim().length >= 3)
    .length;
  const serialCoverage = Math.max(barcodeCount, typedSerials);
  const inverterText = String(input.inverterSerialNumber ?? "").trim();

  const missing: string[] = [];
  if (siteCount < 1) missing.push("at least 1 site photo");
  if (siteCount >= 1 && !siteWithGeo) missing.push("geo-tag on a site photo (enable location on site)");
  if (panelImageCount < needed) {
    missing.push(`${needed} installed panel photo${needed === 1 ? "" : "s"} (have ${panelImageCount})`);
  }
  if (serialCoverage < needed) {
    missing.push(
      `${needed} panel serials (barcode photos or typed serials; have barcodes ${barcodeCount}, typed ${typedSerials})`
    );
  }
  if (inverterPhotoCount < 1 && inverterText.length < 3) {
    missing.push("inverter serial photo or typed inverter serial");
  }

  return {
    ok: missing.length === 0,
    siteCount,
    panelImageCount,
    barcodeCount,
    typedSerials,
    needed,
    videoCount: 0,
    inverterPhotoCount,
    missing,
  };
}

export function expectedInstallPanelCount(lead: {
  expected_panel_count?: number | null;
  won_panel_quantity?: number | null;
}) {
  const n = Number(lead.expected_panel_count || lead.won_panel_quantity || 0);
  return Math.max(1, Number.isFinite(n) ? Math.floor(n) : 1);
}

/** Crew finish rules: four required groups. `other` is optional. Serials are optional. */
export function installationCrewGate(input: {
  photos: Array<{
    photo_kind: string;
    panel_index?: number | null;
    latitude?: number | null;
    longitude?: number | null;
  }>;
  expectedPanelCount: number | null | undefined;
  inverterSerialNumber?: string | null;
  leadHasGeo?: boolean;
}) {
  const needed = Math.max(1, Number(input.expectedPanelCount) || 1);
  const sitePhotos = input.photos.filter((p) => p.photo_kind === "site");
  const customerGeo = sitePhotos.some(hasGeoTag) || Boolean(input.leadHasGeo);
  const panelPhotos = input.photos.filter((p) => p.photo_kind === "panel_image");
  const indexes = new Set(
    panelPhotos
      .map((p) => Number(p.panel_index))
      .filter((i) => Number.isInteger(i) && i >= 1)
  );
  let contiguous = 0;
  for (let i = 1; i <= needed; i += 1) {
    if (!indexes.has(i)) break;
    contiguous += 1;
  }
  const inverterText = String(input.inverterSerialNumber ?? "").trim();
  const otherCount = input.photos.filter((p) => p.photo_kind === "other").length;

  const missing: string[] = [];
  if (sitePhotos.length < 1) missing.push("customer photo with GPS");
  else if (!customerGeo) missing.push("GPS on the customer photo (enable location)");
  if (inverterText.length < 3) missing.push("inverter serial");
  if (contiguous < needed) {
    missing.push(`${needed} panel photos in order (have ${contiguous})`);
  }

  return {
    ok: missing.length === 0,
    needed,
    siteCount: sitePhotos.length,
    panelImageCount: contiguous,
    videoCount: 0,
    otherCount,
    inverterOk: inverterText.length >= 3,
    customerGeo,
    missing,
  };
}

export function isInstallSupervisorRole(role: string) {
  return role === "ops_coordinator" || role === "admin";
}

export type CrewWonSystem = {
  panelName: string | null;
  panelQuantity: number | null;
  inverterCompany: string | null;
  systemSizeKw: number | null;
  consumerNumber: string | null;
  companyBearsSubsidy: boolean | null;
};

export type CrewSurveyBrief = {
  latitude: number | null;
  longitude: number | null;
  totalTerraceSqft: number | null;
  shadowFreeSqft: number | null;
  capacityKw: number | null;
  feasibilityPass: boolean | null;
  notes: string | null;
};

export type CrewJobBrief = {
  id: string;
  company_id: string;
  name: string;
  phone: string;
  city: string | null;
  expected_panel_count: number | null;
  won_panel_quantity: number | null;
  inverter_serial_number: string | null;
  install_geo_lat: number | null;
  install_geo_lng: number | null;
  installation_completed_at: string | null;
  jobOpen: boolean;
  won: CrewWonSystem;
  survey: CrewSurveyBrief | null;
  surveyPhotos: Partial<Record<"gps" | "roof" | "shadow" | "access", string>>;
  surveyLoadError: string | null;
};

export function crewBriefFromLead(
  lead: {
    id: string;
    company_id: string;
    name: string;
    phone: string;
    city?: string | null;
    expected_panel_count?: number | null;
    won_panel_quantity?: number | null;
    won_panel_name?: string | null;
    won_inverter_company?: string | null;
    won_system_size_kw?: number | null;
    consumer_number?: string | null;
    company_bears_subsidy?: boolean | null;
    inverter_serial_number?: string | null;
    install_geo_lat?: number | null;
    install_geo_lng?: number | null;
    installation_completed_at?: string | null;
    sales_stage?: string;
    survey?: {
      latitude: number | null;
      longitude: number | null;
      total_terrace_sqft: number | null;
      shadow_free_sqft: number | null;
      capacity_kw: number | null;
      feasibility_pass: boolean | null;
      notes: string | null;
    } | null;
  },
  surveyPhotos: CrewJobBrief["surveyPhotos"] = {},
  surveyLoadError: string | null = null
): CrewJobBrief {
  const survey = lead.survey
    ? {
        latitude: lead.survey.latitude,
        longitude: lead.survey.longitude,
        totalTerraceSqft: lead.survey.total_terrace_sqft,
        shadowFreeSqft: lead.survey.shadow_free_sqft,
        capacityKw: lead.survey.capacity_kw,
        feasibilityPass: lead.survey.feasibility_pass,
        notes: lead.survey.notes,
      }
    : null;

  return {
    id: lead.id,
    company_id: lead.company_id,
    name: lead.name,
    phone: lead.phone,
    city: lead.city ?? null,
    expected_panel_count: lead.expected_panel_count ?? null,
    won_panel_quantity: lead.won_panel_quantity ?? null,
    inverter_serial_number: lead.inverter_serial_number ?? null,
    install_geo_lat: lead.install_geo_lat ?? null,
    install_geo_lng: lead.install_geo_lng ?? null,
    installation_completed_at: lead.installation_completed_at ?? null,
    jobOpen:
      !lead.installation_completed_at &&
      (lead.sales_stage === "installation_assigned" ||
        lead.sales_stage === "installation_in_progress"),
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
  };
}
