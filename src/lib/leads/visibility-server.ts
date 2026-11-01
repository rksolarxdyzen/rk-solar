import { getUserAuthorities } from "@/lib/auth";
import type { Profile } from "@/lib/domain/types";
import { isDealerRole } from "@/lib/domain/dealers";

/** Roles that work every Won-or-later customer file (not only assignees). */
const CUSTOMER_WIDE_ROLES = new Set(["accounts", "liaison", "feasibility"]);

/** Sales / field lanes never get company-wide customers via leftover auth keys. */
const ASSIGNED_ONLY_ROLES = new Set([
  "sales_manager",
  "sales_executive",
  "tele_caller",
  "surveyor",
  "dealer",
  "dealer_staff",
]);

/**
 * Authorities that unlock company-wide customer-stage visibility for ops lanes.
 * Never treat record_payment / view_payment_queues as company-wide — Sales has those.
 */
const CUSTOMER_WIDE_AUTHORITIES = [
  "verify_payment",
  "verify_subsidy",
  "manage_liaison",
  "mark_meter_installed",
  "mark_subsidy_received",
] as const;

/**
 * Accounts, Documentation / liaison, and Feasibility work every Won-or-later
 * customer file. Sales / tele / survey stay assigned / own-leads only.
 */
export async function canSeeAllCustomers(profile: Profile): Promise<boolean> {
  if (isDealerRole(profile)) return false;
  if (ASSIGNED_ONLY_ROLES.has(profile.role)) return false;
  if (profile.role === "admin" || CUSTOMER_WIDE_ROLES.has(profile.role)) return true;
  const auths = await getUserAuthorities(profile.id);
  if (auths.has("full_access") || auths.has("view_all_leads")) return true;
  if (CUSTOMER_WIDE_AUTHORITIES.some((key) => auths.has(key))) return true;
  // Docs-lane custom roles may carry this key; sales roles are blocked above.
  return auths.has("upload_feasibility_report");
}

/** Admin / full_access / explicit view_all_leads only. Assignment does not open the company list. */
export async function canSeeAllLeads(profile: Profile): Promise<boolean> {
  // Dealers never see the full company pipeline (revise Phase 6).
  if (isDealerRole(profile)) return false;
  if (profile.role === "admin") return true;
  const auths = await getUserAuthorities(profile.id);
  return auths.has("full_access") || auths.has("view_all_leads");
}

/**
 * Company-wide Quotes list. Separate from view_all_leads — sales with only
 * view_quotations stay on assigned leads + quotes they created.
 */
export async function canSeeAllQuotations(profile: Profile): Promise<boolean> {
  if (isDealerRole(profile)) return false;
  if (profile.role === "admin") return true;
  const auths = await getUserAuthorities(profile.id);
  return auths.has("full_access") || auths.has("view_all_quotations");
}

/** "View as" another user's pipeline: admin / full_access only. */
export async function canUsePipelinePov(profile: Profile): Promise<boolean> {
  if (isDealerRole(profile)) return false;
  if (profile.role === "admin") return true;
  const auths = await getUserAuthorities(profile.id);
  return auths.has("full_access");
}
