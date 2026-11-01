/** Assignment picker pools — which Team roles appear in which staff dropdowns. */

export const ASSIGNMENT_POOLS = [
  {
    key: "telecaller",
    label: "Tele-caller",
    hint: "New lead Assign to · Import · Reassign tele-caller",
  },
  {
    key: "surveyor",
    label: "Field surveyor",
    hint: "Schedule visit · Reassign surveyor",
  },
  {
    key: "installation_crew",
    label: "Installation crew",
    hint: "Installation assign / reassign",
  },
  {
    key: "dealer",
    label: "Dealer",
    hint: "Dealer on customer file · Dealers directory",
  },
  {
    key: "service_engineer",
    label: "Service engineer",
    hint: "Force-assign ticket · auto offers",
  },
] as const;

export type AssignmentPoolKey = (typeof ASSIGNMENT_POOLS)[number]["key"];

export const ASSIGNMENT_POOL_KEYS = ASSIGNMENT_POOLS.map((p) => p.key) as AssignmentPoolKey[];

/** Defaults for system role slugs (mirrors migration 063 seed). */
export const DEFAULT_POOLS_BY_SLUG: Record<string, readonly AssignmentPoolKey[]> = {
  admin: ["telecaller", "surveyor", "service_engineer"],
  sales_manager: ["telecaller", "surveyor"],
  sales_executive: ["telecaller"],
  tele_caller: ["telecaller"],
  surveyor: ["surveyor"],
  installation_crew: ["installation_crew"],
  dealer: ["dealer"],
  service_engineer: ["service_engineer"],
  service_supervisor: ["service_engineer"],
};

/** Legacy profiles.role values that count for a pool when role_id is null. */
export function legacyRolesForPool(pool: AssignmentPoolKey): string[] {
  return Object.entries(DEFAULT_POOLS_BY_SLUG)
    .filter(([, pools]) => pools.includes(pool))
    .map(([slug]) => slug);
}

export function normalizeAssignmentPools(raw: unknown): AssignmentPoolKey[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<string>(ASSIGNMENT_POOL_KEYS);
  const out: AssignmentPoolKey[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    if (!allowed.has(item)) continue;
    if (!out.includes(item as AssignmentPoolKey)) out.push(item as AssignmentPoolKey);
  }
  return out;
}

export function poolLabel(key: AssignmentPoolKey): string {
  return ASSIGNMENT_POOLS.find((p) => p.key === key)?.label ?? key;
}
