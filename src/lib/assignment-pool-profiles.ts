import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type AssignmentPoolKey,
  legacyRolesForPool,
  normalizeAssignmentPools,
} from "@/lib/domain/assignment-pools";

export type PoolProfile = {
  id: string;
  name: string;
  role: string;
  phone?: string | null;
  email?: string | null;
  is_active?: boolean;
  created_at?: string;
};

type ProfileRow = {
  id: string;
  name: string;
  role: string;
  phone?: string | null;
  email?: string | null;
  is_active?: boolean;
  created_at?: string;
  role_id?: string | null;
  team_role?:
    | { assignment_pools?: string[] | null; slug?: string | null }
    | { assignment_pools?: string[] | null; slug?: string | null }[]
    | null;
};

function roleRow(
  rel: ProfileRow["team_role"]
): { assignment_pools?: string[] | null; slug?: string | null } | null {
  if (!rel) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

function profileInPool(row: ProfileRow, pool: AssignmentPoolKey): boolean {
  const linked = roleRow(row.team_role);
  if (linked) {
    const pools = normalizeAssignmentPools(linked.assignment_pools);
    return pools.includes(pool);
  }
  // Legacy: no role_id join — use enum slug defaults
  return legacyRolesForPool(pool).includes(row.role);
}

/** Active company profiles whose Team role is in the given assignment pool. */
export async function listProfilesInPool(
  db: SupabaseClient,
  companyId: string,
  pool: AssignmentPoolKey,
  extraSelect = ""
): Promise<PoolProfile[]> {
  const select = [
    "id",
    "name",
    "role",
    "phone",
    "email",
    "is_active",
    "created_at",
    "role_id",
    "team_role:roles!profiles_role_id_fkey(assignment_pools, slug)",
    extraSelect,
  ]
    .filter(Boolean)
    .join(", ");

  const { data, error } = await db
    .from("profiles")
    .select(select)
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("name");

  if (error) {
    // Column or FK missing (063 not applied) — fall back to enum filter
    if (/assignment_pools|profiles_role_id|Could not find/i.test(error.message)) {
      const legacy = await db
        .from("profiles")
        .select("id, name, role, phone, email, is_active, created_at")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .in("role", legacyRolesForPool(pool))
        .order("name");
      if (legacy.error) throw new Error(legacy.error.message);
      return (legacy.data ?? []) as PoolProfile[];
    }
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as ProfileRow[])
    .filter((row) => profileInPool(row, pool))
    .map((row) => ({
      id: row.id,
      name: row.name,
      role: row.role,
      phone: row.phone ?? null,
      email: row.email ?? null,
      is_active: row.is_active,
      created_at: row.created_at,
    }));
}

export async function assertProfileInPool(
  db: SupabaseClient,
  companyId: string,
  profileId: string,
  pool: AssignmentPoolKey,
  notInPoolMessage: string
): Promise<PoolProfile> {
  const { data, error } = await db
    .from("profiles")
    .select(
      "id, name, role, phone, role_id, team_role:roles!profiles_role_id_fkey(assignment_pools, slug)"
    )
    .eq("id", profileId)
    .eq("company_id", companyId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    if (/assignment_pools|profiles_role_id|Could not find/i.test(error.message)) {
      const legacy = await db
        .from("profiles")
        .select("id, name, role, phone")
        .eq("id", profileId)
        .eq("company_id", companyId)
        .eq("is_active", true)
        .maybeSingle();
      if (legacy.error || !legacy.data) throw new Error("Selected team member was not found");
      if (!legacyRolesForPool(pool).includes(legacy.data.role)) {
        throw new Error(notInPoolMessage);
      }
      return legacy.data as PoolProfile;
    }
    throw new Error(error.message);
  }

  if (!data) throw new Error("Selected team member was not found");
  const row = data as unknown as ProfileRow;
  if (!profileInPool(row, pool)) throw new Error(notInPoolMessage);
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    phone: row.phone ?? null,
  };
}
