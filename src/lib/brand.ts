/** RK Solar brand constants (tenant). Platform credit: Dyzen. */
export const BRAND = {
  name: "RK Solar",
  shortName: "RK Solar",
  tagline: "CRM & Field Operations",
  productLine: "Lead to maintenance — solar operations platform",
  /** Discreet platform credit — keep RK Solar as the primary customer-facing brand. */
  poweredBy: "Powered by Dyzen Solar Technologies",
  poweredByName: "Dyzen Solar Technologies",
} as const;

export const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  sales_manager: "Sales Manager",
  tele_caller: "Tele-caller",
  surveyor: "Field Surveyor",
  sales_executive: "Sales Executive",
  feasibility: "Feasibility",
  accounts: "Accounts",
  ops_coordinator: "Installation Supervisor",
  installation_crew: "Installation Crew",
  liaison: "Discom Liaison",
  service_engineer: "Service Engineer",
  service_supervisor: "Service Supervisor",
  dealer: "Dealer",
  customer: "Customer",
};
