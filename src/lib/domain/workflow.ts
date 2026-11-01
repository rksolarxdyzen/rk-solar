/** RK Solar — LMS sales workflow constants */

export const SALES_STAGES = [
  "new_lead",
  "contacted",
  "visit_scheduled",
  "survey_in_progress",
  "survey_completed",
  "quoted",
  "quote_accepted",
  "token_pending_verification",
  "token_verified_and_feasibility_ok",
  "pre_dispatch_pending_verification",
  "pre_dispatch_verified",
  "installation_assigned",
  "installation_in_progress",
  "installation_completed",
  "final_pending_verification",
  "final_verified",
  "liaison_in_progress",
  "meter_installed",
  "subsidy_pending",
  "subsidy_received_pending_accounts",
  "completed",
  "lost",
] as const;
export type SalesStage = (typeof SALES_STAGES)[number];

/**
 * Lead kanban columns. `survey_in_progress` is folded into Visit Scheduled.
 * Quoted stays on Leads; Won (quote_accepted) onwards → Customers.
 */
export const PIPELINE_SALES_STAGES: SalesStage[] = [
  "new_lead",
  "contacted",
  "visit_scheduled",
  "survey_completed",
  "quoted",
];

export const PIPELINE_STAGE_GROUPS: { id: string; label: string; stages: SalesStage[] }[] = [
  { id: "new_lead", label: "New Lead", stages: ["new_lead"] },
  { id: "contacted", label: "Contacted", stages: ["contacted"] },
  {
    id: "visit_scheduled",
    label: "Visit Scheduled",
    stages: ["visit_scheduled", "survey_in_progress"],
  },
  { id: "survey_done", label: "Survey Done", stages: ["survey_completed"] },
  { id: "quoted", label: "Quoted", stages: ["quoted"] },
];

/** Won onwards shown in Customers (Quoted stays on Leads — D4 / Phase 3b). */
export const CUSTOMER_SALES_STAGES: SalesStage[] = [
  "quote_accepted",
  "token_pending_verification",
  "token_verified_and_feasibility_ok",
  "pre_dispatch_pending_verification",
  "pre_dispatch_verified",
  "installation_assigned",
  "installation_in_progress",
  "installation_completed",
  "final_pending_verification",
  "final_verified",
  "liaison_in_progress",
  "meter_installed",
  "subsidy_pending",
  "subsidy_received_pending_accounts",
  "completed",
];

export function isPipelineSalesStage(
  stage: string | null | undefined
): stage is SalesStage {
  return (
    PIPELINE_SALES_STAGES.includes(stage as SalesStage) ||
    stage === "survey_in_progress"
  );
}

export function isCustomerSalesStage(
  stage: string | null | undefined
): stage is SalesStage {
  return CUSTOMER_SALES_STAGES.includes(stage as SalesStage);
}

export function isWonOrLaterStage(stage: string | null | undefined): boolean {
  if (!stage || stage === "lost") return false;
  const i = SALES_STAGES.indexOf(stage as SalesStage);
  const won = SALES_STAGES.indexOf("quote_accepted");
  return i >= won && won >= 0;
}

/** High-level buckets on the Customers page (not pipeline columns). No Quoted — D4. */
export const CUSTOMER_PHASES = [
  {
    id: "payments",
    label: "Payments",
    stages: [
      "quote_accepted",
      "token_pending_verification",
      "token_verified_and_feasibility_ok",
      "pre_dispatch_pending_verification",
      "pre_dispatch_verified",
      "final_pending_verification",
      "final_verified",
    ] as SalesStage[],
  },
  {
    id: "installation",
    label: "Installation",
    stages: [
      "installation_assigned",
      "installation_in_progress",
      "installation_completed",
    ] as SalesStage[],
  },
  {
    id: "liaison",
    label: "Documentation",
    stages: [
      "liaison_in_progress",
      "meter_installed",
      "subsidy_pending",
      "subsidy_received_pending_accounts",
    ] as SalesStage[],
  },
  { id: "completed", label: "Completed", stages: ["completed"] as SalesStage[] },
] as const;

export type CustomerPhaseId = (typeof CUSTOMER_PHASES)[number]["id"];

export const INSTALLATION_CUSTOMER_STAGES: SalesStage[] = [
  "installation_assigned",
  "installation_in_progress",
  "installation_completed",
];

export function isInstallationCustomerStage(
  stage: string | null | undefined
): stage is SalesStage {
  return INSTALLATION_CUSTOMER_STAGES.includes(stage as SalesStage);
}

/** Forward-order stages for stepper / advance checks (excludes lost). */
export const SALES_STAGE_ORDER: SalesStage[] = [
  "new_lead",
  "contacted",
  "visit_scheduled",
  "survey_in_progress",
  "survey_completed",
  "quoted",
  "quote_accepted",
  "token_pending_verification",
  "token_verified_and_feasibility_ok",
  "pre_dispatch_pending_verification",
  "pre_dispatch_verified",
  "installation_assigned",
  "installation_in_progress",
  "installation_completed",
  "final_pending_verification",
  "final_verified",
  "liaison_in_progress",
  "meter_installed",
  "subsidy_pending",
  "subsidy_received_pending_accounts",
  "completed",
];

export const LEAD_SOURCES = [
  "manual",
  "excel_import",
  "referral",
  "dealer",
  "facebook_ads",
  "call",
  "walk_in",
  "website",
  "demo",
  "other",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const TEMPERATURES = ["hot", "warm", "cold"] as const;
export type LeadTemperature = (typeof TEMPERATURES)[number];

/** Alias used by some UI imports */
export const LEAD_TEMPERATURES = TEMPERATURES;

export const TEMPERATURE_LABELS: Record<LeadTemperature, string> = {
  hot: "Hot",
  warm: "Warm",
  cold: "Cold",
};

export const SALES_STAGE_LABELS: Record<SalesStage, string> = {
  new_lead: "New Lead",
  contacted: "Contacted",
  visit_scheduled: "Visit Scheduled",
  survey_in_progress: "Survey In Progress",
  survey_completed: "Survey Done",
  quoted: "Quoted",
  quote_accepted: "Won",
  token_pending_verification: "Token Pending",
  token_verified_and_feasibility_ok: "Token + Feasibility OK",
  pre_dispatch_pending_verification: "Pre-Dispatch Pending",
  pre_dispatch_verified: "Pre-Dispatch Verified",
  installation_assigned: "Install Assigned",
  installation_in_progress: "Install In Progress",
  installation_completed: "Install Completed",
  final_pending_verification: "Final Pending",
  final_verified: "Final Verified",
  liaison_in_progress: "Liaison In Progress",
  meter_installed: "Meter Installed",
  subsidy_pending: "Subsidy Pending",
  subsidy_received_pending_accounts: "Subsidy Awaiting Accounts",
  completed: "Completed",
  lost: "Lost",
};

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  manual: "Manual",
  excel_import: "Excel Import",
  referral: "Referral",
  dealer: "Dealer",
  facebook_ads: "Facebook Ads",
  call: "Phone Call",
  walk_in: "Walk-in",
  website: "Website",
  demo: "Demo / test",
  other: "Other",
};

/** Tailwind bg classes for stage dots / headers */
export const STAGE_COLORS: Record<SalesStage, string> = {
  new_lead: "bg-[var(--stage-new)]",
  contacted: "bg-[var(--primary)]",
  visit_scheduled: "bg-[var(--accent)]",
  survey_in_progress: "bg-[var(--info)]",
  survey_completed: "bg-[var(--success)]",
  quoted: "bg-[var(--primary)]",
  quote_accepted: "bg-[var(--accent)]",
  token_pending_verification: "bg-[var(--warn)]",
  token_verified_and_feasibility_ok: "bg-[var(--success)]",
  pre_dispatch_pending_verification: "bg-[var(--warn)]",
  pre_dispatch_verified: "bg-[var(--success)]",
  installation_assigned: "bg-[var(--info)]",
  installation_in_progress: "bg-[var(--accent)]",
  installation_completed: "bg-[var(--success)]",
  final_pending_verification: "bg-[var(--warn)]",
  final_verified: "bg-[var(--success)]",
  liaison_in_progress: "bg-[var(--info)]",
  meter_installed: "bg-[var(--accent)]",
  subsidy_pending: "bg-[var(--warn)]",
  subsidy_received_pending_accounts: "bg-[var(--warn)]",
  completed: "bg-[var(--success)]",
  lost: "bg-[var(--error)]",
};

export const SCREEN_ROUTES = {
  dashboard: "/",
  pipeline: "/pipeline",
  customers: "/customers",
  quotations: "/quotations",
  catalog: "/catalog",
  payments: "/payments",
  feasibility: "/liaison?tab=pre-install",
  installation: "/installation",
  liaison: "/liaison",
  maintenance: "/maintenance",
  portal: "/portal",
  leadImport: "/lead-import",
  reminders: "/alerts",
  login: "/login",
} as const;

/** Days after meter install before liaison follow-up if subsidy not marked. */
export const SUBSIDY_TIMER_DAYS = 15;
