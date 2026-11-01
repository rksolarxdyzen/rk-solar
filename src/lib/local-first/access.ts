import type { AuthorityKey } from "@/lib/domain/authorities";
import type { Profile } from "@/lib/domain/types";

export function hasAuth(
  authorities: AuthorityKey[],
  key: AuthorityKey
): boolean {
  return authorities.includes("full_access") || authorities.includes(key);
}

export function roleIn(profile: Profile, roles: string[]): boolean {
  return roles.includes(profile.role);
}
