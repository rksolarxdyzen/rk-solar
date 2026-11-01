import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/domain/types";
import type { AuthorityKey } from "@/lib/domain/authorities";
import { DEFAULT_ROLE_AUTHORITIES } from "@/lib/domain/authorities";
import { isDealerRole } from "@/lib/domain/dealers";

const PURCHASE_COST_KEYS: AuthorityKey[] = ["view_purchase_cost", "manage_purchase_cost"];

/** Never effective for dealers — Team UI / leftovers cannot open company CRM. */
const DEALER_BLOCKED_AUTHORITIES: AuthorityKey[] = [
  "view_all_leads",
  "view_all_quotations",
  "full_access",
  "manage_quotations",
];

export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return profile as Profile | null;
}

export async function getUserAuthorities(userId: string): Promise<Set<AuthorityKey>> {
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, role_id")
    .eq("id", userId)
    .single();

  const granted = new Set<AuthorityKey>();

  // Admin role always has full access (except purchase-cost keys — those use canView/ManagePurchaseCost)
  if (profile?.role === "admin") {
    granted.add("full_access");
    for (const k of DEFAULT_ROLE_AUTHORITIES.admin ?? []) {
      if (!PURCHASE_COST_KEYS.includes(k)) granted.add(k);
    }
  }

  // 1. Explicit user-level permissions (overrides / additions)
  const { data: userAuths } = await supabase
    .from("user_authorities")
    .select("authority_key, granted")
    .eq("user_id", userId);

  if (userAuths && userAuths.length > 0) {
    for (const a of userAuths) {
      if (a.granted) granted.add(a.authority_key as AuthorityKey);
    }
  }

  // 2. Role-based permissions via role_id
  if (profile?.role_id) {
    const { data: roleAuths } = await supabase
      .from("role_authorities")
      .select("authority_key, granted")
      .eq("role_id", profile.role_id);

    for (const a of roleAuths ?? []) {
      if (a.granted) granted.add(a.authority_key as AuthorityKey);
    }
  }

  // 3. Enum fallback when nothing resolved yet
  if (granted.size === 0 && profile?.role) {
    const defaults = DEFAULT_ROLE_AUTHORITIES[profile.role] ?? [];
    defaults.forEach((k) => granted.add(k));
  }

  // 4. Dealers: hard-strip company-wide CRM keys (app layer; RLS 068 mirrors this)
  if (profile && isDealerRole(profile)) {
    for (const key of DEALER_BLOCKED_AUTHORITIES) {
      granted.delete(key);
    }
  }

  return granted;
}

export async function hasAuthority(userId: string, key: string): Promise<boolean> {
  if (PURCHASE_COST_KEYS.includes(key as AuthorityKey)) {
    // Cost keys never ride on full_access; use canView/ManagePurchaseCost.
    const authorities = await getUserAuthorities(userId);
    return authorities.has(key as AuthorityKey);
  }
  const authorities = await getUserAuthorities(userId);
  if (authorities.has("full_access")) return true;
  return authorities.has(key as AuthorityKey);
}

/** Admin is the purchase-cost grantor on KT (no Owner role). */
export function isPurchaseCostGrantor(profile: { role: string } | null | undefined): boolean {
  return profile?.role === "admin";
}

/** Mirrors SQL can_view/can_manage_purchase_cost: Admin grantor, or cost key on the user's role. */
const getPurchaseCostAccess = cache(async (): Promise<{ view: boolean; manage: boolean }> => {
  const profile = await getCurrentUser();
  if (!profile || !profile.is_active) return { view: false, manage: false };
  if (isPurchaseCostGrantor(profile)) return { view: true, manage: true };
  if (!profile.role_id) return { view: false, manage: false };

  const supabase = await createClient();
  const { data } = await supabase
    .from("role_authorities")
    .select("authority_key")
    .eq("role_id", profile.role_id)
    .eq("granted", true)
    .in("authority_key", ["view_purchase_cost", "manage_purchase_cost"]);

  const keys = new Set((data ?? []).map((r) => r.authority_key as string));
  const manage = keys.has("manage_purchase_cost");
  return { view: manage || keys.has("view_purchase_cost"), manage };
});

export async function canViewPurchaseCost(): Promise<boolean> {
  return (await getPurchaseCostAccess()).view;
}

export async function canManagePurchaseCost(): Promise<boolean> {
  return (await getPurchaseCostAccess()).manage;
}

export const getSession = cache(async () => {
  const profile = await getCurrentUser();
  if (!profile || !profile.is_active) return null;
  const authorities = await getUserAuthorities(profile.id);
  return { profile, authorities };
});

export async function requireAuth() {
  const profile = await getCurrentUser();
  if (!profile || !profile.is_active) {
    throw new Error("Unauthorized");
  }
  return profile;
}

export async function requireAuthority(key: string) {
  const profile = await requireAuth();
  const allowed = await hasAuthority(profile.id, key);
  if (!allowed) throw new Error(`Missing authority: ${key}`);
  return profile;
}
