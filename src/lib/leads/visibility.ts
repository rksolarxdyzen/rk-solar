import type { Profile, Lead } from "@/lib/domain/types";
import { isDealerRole } from "@/lib/domain/dealers";
import { CUSTOMER_SALES_STAGES } from "@/lib/domain/workflow";

/** `.or()` filter: own leads plus every customer-stage file. */
export function ownLeadOrCustomerFilter(profileId: string): string {
  return `${ownLeadOrFilter(profileId)},sales_stage.in.(${CUSTOMER_SALES_STAGES.join(",")})`;
}

export type PipelineQueue = "all" | "tele_call" | "site_visits";

export type PipelinePovRole = "any" | "tele_call" | "survey" | "assigned";

export type PipelinePov =
  | { kind: "user"; userId: string; role: PipelinePovRole }
  | { kind: "unassigned" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parse `?as=<uuid>|unassigned` and `?as_role=` from the URL. */
export function parsePipelinePov(
  as: string | undefined,
  asRole: string | undefined
): PipelinePov | null {
  if (!as) return null;
  if (as === "unassigned") return { kind: "unassigned" };
  if (!UUID_RE.test(as)) return null;
  const role: PipelinePovRole =
    asRole === "tele_call" || asRole === "survey" || asRole === "assigned"
      ? asRole
      : "any";
  return { kind: "user", userId: as, role };
}

export function povSubtitle(
  pov: PipelinePov | null,
  users: Array<{ id: string; name: string }>
): string | null {
  if (!pov) return null;
  if (pov.kind === "unassigned") return "Viewing unassigned leads";
  const user = users.find((u) => u.id === pov.userId);
  if (!user) return null;
  const scope =
    pov.role === "tele_call"
      ? "as tele-caller"
      : pov.role === "survey"
        ? "as surveyor"
        : pov.role === "assigned"
          ? "as assignee"
          : "tele-caller + surveyor + assigned";
  return `Viewing as ${user.name} (${scope})`;
}

export function ownsLead(
  profile: Profile,
  lead: {
    assigned_to?: string | null;
    assigned_telecaller_id?: string | null;
    assigned_surveyor_id?: string | null;
    assigned_crew_id?: string | null;
    created_by?: string | null;
    dealer_id?: string | null;
  }
): boolean {
  return (
    lead.assigned_telecaller_id === profile.id ||
    lead.assigned_surveyor_id === profile.id ||
    lead.assigned_to === profile.id ||
    lead.assigned_crew_id === profile.id ||
    lead.created_by === profile.id ||
    lead.dealer_id === profile.id
  );
}

/** Supabase `.or()` filter for scoped lead lists. */
export function ownLeadOrFilter(profileId: string): string {
  return [
    `assigned_telecaller_id.eq.${profileId}`,
    `assigned_surveyor_id.eq.${profileId}`,
    `assigned_to.eq.${profileId}`,
    `assigned_crew_id.eq.${profileId}`,
    `created_by.eq.${profileId}`,
    `dealer_id.eq.${profileId}`,
  ].join(",");
}

/**
 * Dealer CRM lists: only files they created or that are linked as dealer_id.
 * (Not telecaller/surveyor/crew lanes.)
 */
export function dealerOwnLeadOrFilter(profileId: string): string {
  return [`created_by.eq.${profileId}`, `dealer_id.eq.${profileId}`].join(",");
}

/** Lead list filter for the current profile (dealers get a stricter OR). */
export function leadVisibilityOrFilter(profile: Profile): string {
  if (isDealerRole(profile)) return dealerOwnLeadOrFilter(profile.id);
  return ownLeadOrFilter(profile.id);
}

/** Default pipeline queue for a role when no URL filter is set. */
export function defaultPipelineQueue(profile: Profile): PipelineQueue {
  if (profile.role === "surveyor") return "site_visits";
  if (profile.role === "tele_caller") return "tele_call";
  if (profile.role === "dealer") return "all";
  return "all";
}

/** Whether this profile may act as tele-caller on the lead (schedule, call). */
export function isLeadTelecaller(
  profile: Profile,
  lead: Pick<Lead, "assigned_telecaller_id" | "assigned_to">
): boolean {
  return (
    lead.assigned_telecaller_id === profile.id ||
    (!lead.assigned_telecaller_id && lead.assigned_to === profile.id)
  );
}

export function isLeadSurveyor(
  profile: Profile,
  lead: Pick<Lead, "assigned_surveyor_id">
): boolean {
  return lead.assigned_surveyor_id === profile.id;
}
