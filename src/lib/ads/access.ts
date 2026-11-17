import type { AuthorityKey } from "@/lib/domain/authorities";

const CRM_HOME_KEYS: AuthorityKey[] = [
  "view_all_leads",
  "add_edit_leads",
  "view_quotations",
  "view_inventory",
  "view_installation_queue",
  "view_payment_queues",
  "manage_users",
];

export function canViewAdSubmissions(authorities: Set<AuthorityKey>): boolean {
  return authorities.has("full_access") || authorities.has("view_ad_submissions");
}

/** Campaign-only staff: ads authority without CRM home keys. */
export function isAdsOnlyUser(authorities: Set<AuthorityKey>): boolean {
  if (!authorities.has("view_ad_submissions")) return false;
  if (authorities.has("full_access")) return false;
  return !CRM_HOME_KEYS.some((key) => authorities.has(key));
}
