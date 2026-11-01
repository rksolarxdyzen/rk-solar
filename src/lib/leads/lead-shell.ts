import type { LeadWithRelations } from "@/lib/domain/types";
import type { LeadSource, LeadTemperature, SalesStage } from "@/lib/domain/workflow";

/** Minimal fields available on pipeline / customer list cards for instant modal paint. */
export type LeadListShell = {
  id: string;
  name: string;
  phone: string;
  sales_stage: SalesStage;
  temperature?: LeadTemperature;
  city?: string | null;
  address?: string | null;
  requirement_notes?: string | null;
  source?: string | null;
  created_at?: string | null;
  next_followup_at?: string | null;
  loss_reason?: string | null;
  telecaller_name?: string | null;
  surveyor_name?: string | null;
  assigned_profile?: { name: string } | null;
  /** Installation queue cards */
  expected_panel_count?: number | null;
};

/** Build a typed placeholder so the modal can paint before getLead returns. */
export function leadShellToPlaceholder(
  shell: LeadListShell,
  companyId: string
): LeadWithRelations {
  const now = shell.created_at ?? new Date().toISOString();
  return {
    id: shell.id,
    company_id: companyId,
    name: shell.name,
    phone: shell.phone,
    alternate_phone: null,
    email: null,
    city: shell.city ?? null,
    address: shell.address ?? null,
    source: (shell.source as LeadSource) || "other",
    source_detail: null,
    temperature: shell.temperature ?? "warm",
    requirement_notes: shell.requirement_notes ?? null,
    sales_stage: shell.sales_stage,
    assigned_to: null,
    assigned_telecaller_id: null,
    assigned_surveyor_id: null,
    loss_reason: shell.loss_reason ?? null,
    loss_notes: null,
    survey_date: null,
    visit_scheduled_at: null,
    visit_notes: null,
    last_call_at: null,
    last_call_notes: null,
    next_followup_at: shell.next_followup_at ?? null,
    next_followup_action: null,
    total_calls: 0,
    roof_area_sqft: null,
    recommended_system_kw: null,
    created_by: null,
    created_at: now,
    updated_at: now,
    assigned_profile: shell.assigned_profile
      ? { id: "", name: shell.assigned_profile.name }
      : null,
    telecaller_profile: shell.telecaller_name
      ? { id: "", name: shell.telecaller_name }
      : null,
    surveyor_profile: shell.surveyor_name
      ? { id: "", name: shell.surveyor_name }
      : null,
    survey: null,
    expected_panel_count: shell.expected_panel_count ?? null,
  };
}
