import type { LeadSource, LeadTemperature, SalesStage } from "./workflow";

/** Aligns with docs/workflow.md §1 and supabase user_role enum. */
export const USER_ROLES = [
  "admin",
  "sales_manager",
  "tele_caller",
  "surveyor",
  "sales_executive",
  "feasibility",
  "accounts",
  "ops_coordinator",
  "installation_crew",
  "liaison",
  "service_engineer",
  "service_supervisor",
  "dealer",
  "customer",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export type Profile = {
  id: string;
  company_id: string;
  name: string;
  email: string | null;
  phone: string;
  role: UserRole;
  role_id?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Company = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  phone: string | null;
  email: string | null;
};

export type Lead = {
  id: string;
  company_id: string;
  name: string;
  phone: string;
  alternate_phone: string | null;
  email: string | null;
  city: string | null;
  address: string | null;
  source: LeadSource;
  source_detail: string | null;
  temperature: LeadTemperature;
  requirement_notes: string | null;
  sales_stage: SalesStage;
  assigned_to: string | null;
  assigned_telecaller_id: string | null;
  assigned_surveyor_id: string | null;
  external_id?: string | null;
  referrer_name?: string | null;
  referrer_phone?: string | null;
  loss_reason: string | null;
  loss_notes: string | null;
  survey_date: string | null;
  visit_scheduled_at: string | null;
  visit_notes: string | null;
  last_call_at: string | null;
  last_call_notes: string | null;
  next_followup_at: string | null;
  next_followup_action: string | null;
  total_calls: number;
  roof_area_sqft: number | null;
  recommended_system_kw: number | null;
  token_verified?: boolean;
  feasibility_approved?: boolean;
  accepted_quotation_id?: string | null;
  assigned_crew_id?: string | null;
  installation_assigned_at?: string | null;
  installation_started_at?: string | null;
  installation_completed_at?: string | null;
  expected_panel_count?: number | null;
  inverter_serial_number?: string | null;
  install_geo_lat?: number | null;
  install_geo_lng?: number | null;
  install_geo_captured_at?: string | null;
  expected_serial_count?: number | null;
  portal_code?: string | null;
  meter_installed_at?: string | null;
  subsidy_timer_started_at?: string | null;
  subsidy_timer_due_at?: string | null;
  subsidy_followup_sent_at?: string | null;
  subsidy_received_at?: string | null;
  subsidy_verified_at?: string | null;
  subsidy_bank_reference?: string | null;
  completion_certificate_url?: string | null;
  liaison_notes?: string | null;
  cleaning_next_due_at?: string | null;
  cleaning_last_sent_at?: string | null;
  /** Phase 5a profile — required at Won */
  meter_type?: string | null;
  meter_ownership?: string | null;
  payment_plan?: string | null;
  /** Phase 6 — referring dealer profile */
  dealer_id?: string | null;
  won_panel_name?: string | null;
  won_panel_quantity?: number | null;
  won_inverter_company?: string | null;
  won_system_size_kw?: number | null;
  won_token_amount?: number | null;
  won_pre_dispatch_amount?: number | null;
  won_final_amount?: number | null;
  /** 058: Accounts settlement discount taken off the pending balance. */
  settlement_discount_amount?: number | null;
  settlement_discount_reason?: string | null;
  won_closed_at?: string | null;
  consumer_number?: string | null;
  company_bears_subsidy?: boolean | null;
  subsidy_amount_at_won?: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CallLog = {
  id: string;
  lead_id: string;
  company_id: string;
  user_id: string;
  outcome: string;
  notes: string | null;
  created_at: string;
  user?: { id: string; name: string } | null;
};

export type Reminder = {
  id: string;
  company_id: string;
  lead_id: string;
  reminder_type: string;
  message: string;
  due_at: string;
  resolved_at: string | null;
  created_at: string;
};

export type AuditEvent = {
  id: string;
  company_id: string;
  lead_id: string | null;
  actor_id: string | null;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actor?: { id: string; name: string; role?: string } | null;
};

export type LeadImportBatch = {
  id: string;
  company_id: string;
  file_name: string;
  imported_by: string | null;
  total_rows: number;
  success_rows: number;
  error_rows: number;
  created_at: string;
  importer?: { name: string } | null;
};

export type ProfileRef = { id: string; name: string; phone?: string | null; role?: string | null };

export type LeadWithRelations = Lead & {
  assigned_profile?: ProfileRef | null;
  telecaller_profile?: ProfileRef | null;
  surveyor_profile?: ProfileRef | null;
  survey?: Survey | null;
};

export type Survey = {
  id: string;
  company_id: string;
  lead_id: string;
  surveyed_by: string | null;
  latitude: number | null;
  longitude: number | null;
  total_terrace_sqft: number | null;
  shadow_free_sqft: number | null;
  capacity_kw: number | null;
  feasibility_pass: boolean | null;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};
