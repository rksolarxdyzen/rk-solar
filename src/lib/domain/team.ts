import type { AssignmentPoolKey } from "@/lib/domain/assignment-pools";
import { USER_ROLES, type UserRole } from "@/lib/domain/types";

export type TeamRole = {
  id: string;
  company_id: string;
  name: string;
  slug: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
  authority_keys: string[];
  assignment_pools: AssignmentPoolKey[];
  user_count: number;
};

export type TeamUser = {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  avatar_url: string | null;
  avatar_storage_path: string | null;
  role: UserRole;
  role_id: string | null;
  is_active: boolean;
  created_at: string;
  role_name: string | null;
  role_slug: string | null;
  /** Extra grants on top of the role (`user_authorities`). Additive only. */
  extra_authority_keys: string[];
};

export type TeamAccessData = {
  users: TeamUser[];
  roles: TeamRole[];
  authorities: Array<{
    key: string;
    label: string;
    authority_group: string;
    description?: string;
  }>;
  current_user_id: string;
  can_manage_users: boolean;
  can_manage_roles: boolean;
  is_privileged: boolean;
};

export function baselineRoleFor(role: Pick<TeamRole, "is_system" | "slug">): UserRole {
  return role.is_system && (USER_ROLES as readonly string[]).includes(role.slug)
    ? (role.slug as UserRole)
    : "customer";
}

export function slugifyRoleName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}
