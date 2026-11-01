"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasAuthority, requireAuth } from "@/lib/auth";
import { AUTHORITIES, AUTHORITY_KEYS } from "@/lib/domain/authorities";
import {
  ASSIGNMENT_POOL_KEYS,
  normalizeAssignmentPools,
  type AssignmentPoolKey,
} from "@/lib/domain/assignment-pools";
import {
  baselineRoleFor,
  slugifyRoleName,
  type TeamAccessData,
  type TeamRole,
} from "@/lib/domain/team";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/audit";
import { teamPasswordSchema } from "@/lib/password-policy";
import { getStoragePublicUrl } from "@/lib/storage-url";

const PERMANENT_BAN_DURATION = "876000h";
const PROFILE_PICTURES_BUCKET = "avatars";
const MAX_PROFILE_PICTURE_BYTES = 5 * 1024 * 1024;

const idSchema = z.string().uuid();
const poolKeySchema = z.enum(ASSIGNMENT_POOL_KEYS as [AssignmentPoolKey, ...AssignmentPoolKey[]]);
const roleFormSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).nullable().optional(),
  assignment_pools: z.array(poolKeySchema).optional(),
});
const createUserSchema = z.object({
  name: z.string().trim().min(2).max(255),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().min(6).max(20),
  password: teamPasswordSchema,
  roleId: z.string().uuid(),
});

type AccessContext = {
  profile: Awaited<ReturnType<typeof requireAuth>>;
  canManageUsers: boolean;
  canManageRoles: boolean;
  isPrivileged: boolean;
};

async function getAccessContext(): Promise<AccessContext> {
  const profile = await requireAuth();
  const [manageUsers, manageRoles, fullAccess] = await Promise.all([
    hasAuthority(profile.id, "manage_users"),
    hasAuthority(profile.id, "manage_roles"),
    hasAuthority(profile.id, "full_access"),
  ]);
  return {
    profile,
    canManageUsers: manageUsers || fullAccess || profile.role === "admin",
    canManageRoles: manageRoles || fullAccess || profile.role === "admin",
    isPrivileged: fullAccess || profile.role === "admin",
  };
}

async function requireTeamAccess(kind?: "users" | "roles") {
  const access = await getAccessContext();
  const allowed =
    kind === "users"
      ? access.canManageUsers
      : kind === "roles"
        ? access.canManageRoles
        : access.canManageUsers || access.canManageRoles;
  if (!allowed) throw new Error("You do not have permission to manage Team & Access.");
  return access;
}

function revalidateTeam() {
  revalidatePath("/team");
}

async function writeTeamAudit(
  access: AccessContext,
  eventType: string,
  entityType: "profile" | "role",
  entityId: string,
  metadata: Record<string, unknown> = {}
) {
  await logAuditEvent({
    companyId: access.profile.company_id,
    actorId: access.profile.id,
    eventType,
    entityType,
    entityId,
    metadata,
  }).catch(() => undefined);
}

async function getCompanyRole(roleId: string, companyId: string): Promise<TeamRole> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("roles")
    .select("id, company_id, name, slug, description, is_system, created_at, assignment_pools")
    .eq("id", roleId)
    .eq("company_id", companyId)
    .single();
  if (error || !data) {
    if (error && /assignment_pools|column .* does not exist/i.test(error.message)) {
      const fallback = await admin
        .from("roles")
        .select("id, company_id, name, slug, description, is_system, created_at")
        .eq("id", roleId)
        .eq("company_id", companyId)
        .single();
      if (fallback.error || !fallback.data) throw new Error("Role not found in your company.");
      return {
        ...fallback.data,
        authority_keys: [],
        assignment_pools: [],
        user_count: 0,
      };
    }
    throw new Error("Role not found in your company.");
  }
  return {
    ...data,
    authority_keys: [],
    assignment_pools: normalizeAssignmentPools(data.assignment_pools),
    user_count: 0,
  };
}

async function roleHasFullAccess(roleId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("role_authorities")
    .select("role_id")
    .eq("role_id", roleId)
    .eq("authority_key", "full_access")
    .eq("granted", true)
    .maybeSingle();
  return Boolean(data);
}

async function getCompanyTarget(userId: string, companyId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select(
      "id, company_id, name, email, phone, avatar_url, avatar_storage_path, role, role_id, is_active"
    )
    .eq("id", userId)
    .eq("company_id", companyId)
    .single();
  if (error || !data) throw new Error("User not found in your company.");
  return data;
}

async function assertCanManageTarget(
  access: AccessContext,
  target: Awaited<ReturnType<typeof getCompanyTarget>>
) {
  const targetIsPrivileged =
    target.role === "admin" ||
    Boolean(target.role_id && (await roleHasFullAccess(target.role_id)));
  if (targetIsPrivileged && !access.isPrivileged) {
    throw new Error("Only an admin or full-access user can manage this account.");
  }
}

function readProfilePicture(formData: FormData) {
  const value = formData.get("profilePicture");
  if (!(value instanceof File) || value.size === 0) return null;
  if (!value.type.startsWith("image/")) {
    throw new Error("Profile picture must be an image.");
  }
  if (value.size > MAX_PROFILE_PICTURE_BYTES) {
    throw new Error("Profile picture must be under 5 MB.");
  }
  return value;
}

async function saveProfilePicture(
  companyId: string,
  userId: string,
  file: File,
  previousPath?: string | null
) {
  const admin = createAdminClient();
  const extension =
    (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${companyId}/team/${userId}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${extension}`;
  const { error: uploadError } = await admin.storage
    .from(PROFILE_PICTURES_BUCKET)
    .upload(path, await file.arrayBuffer(), {
      contentType: file.type,
      upsert: false,
    });
  if (uploadError) throw new Error(`Could not upload profile picture: ${uploadError.message}`);

  const avatarUrl = getStoragePublicUrl(path, PROFILE_PICTURES_BUCKET);
  const { error: updateError } = await admin
    .from("profiles")
    .update({
      avatar_url: avatarUrl,
      avatar_storage_path: path,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .eq("company_id", companyId);
  if (updateError) {
    await admin.storage.from(PROFILE_PICTURES_BUCKET).remove([path]).catch(() => undefined);
    throw new Error(`Could not save profile picture: ${updateError.message}`);
  }

  if (previousPath && previousPath !== path) {
    await admin.storage.from(PROFILE_PICTURES_BUCKET).remove([previousPath]).catch(() => undefined);
  }
  return { avatarUrl, path };
}

async function removeProfilePicture(companyId: string, userId: string, previousPath?: string | null) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({
      avatar_url: null,
      avatar_storage_path: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);
  if (previousPath) {
    await admin.storage.from(PROFILE_PICTURES_BUCKET).remove([previousPath]).catch(() => undefined);
  }
}

export async function listTeamAccess(): Promise<TeamAccessData> {
  const access = await requireTeamAccess();
  const admin = createAdminClient();
  const [profilesResult, rolesResult, authoritiesResult] = await Promise.all([
    admin
      .from("profiles")
      .select(
        "id, name, email, phone, avatar_url, avatar_storage_path, role, role_id, is_active, created_at"
      )
      .eq("company_id", access.profile.company_id)
      .order("name"),
    admin
      .from("roles")
      .select("id, company_id, name, slug, description, is_system, created_at, assignment_pools")
      .eq("company_id", access.profile.company_id)
      .order("is_system", { ascending: false })
      .order("name"),
    admin.from("authorities").select("key, label, authority_group").order("authority_group").order("label"),
  ]);
  if (profilesResult.error) throw new Error(profilesResult.error.message);
  let rolesResultData = rolesResult.data;
  if (rolesResult.error) {
    if (/assignment_pools|column .* does not exist/i.test(rolesResult.error.message)) {
      const fallback = await admin
        .from("roles")
        .select("id, company_id, name, slug, description, is_system, created_at")
        .eq("company_id", access.profile.company_id)
        .order("is_system", { ascending: false })
        .order("name");
      if (fallback.error) throw new Error(fallback.error.message);
      rolesResultData = (fallback.data ?? []).map((role) => ({
        ...role,
        assignment_pools: [] as string[],
      }));
    } else {
      throw new Error(rolesResult.error.message);
    }
  }
  if (authoritiesResult.error) throw new Error(authoritiesResult.error.message);

  const roles = rolesResultData ?? [];
  const roleIds = roles.map((role) => role.id);
  const grantsResult = roleIds.length
    ? await admin
        .from("role_authorities")
        .select("role_id, authority_key, granted")
        .in("role_id", roleIds)
        .eq("granted", true)
    : { data: [], error: null };
  if (grantsResult.error) throw new Error(grantsResult.error.message);

  const grantsByRole = new Map<string, string[]>();
  for (const grant of grantsResult.data ?? []) {
    const current = grantsByRole.get(grant.role_id) ?? [];
    current.push(grant.authority_key);
    grantsByRole.set(grant.role_id, current);
  }

  const profileIds = (profilesResult.data ?? []).map((profile) => profile.id);
  const userGrantsResult = profileIds.length
    ? await admin
        .from("user_authorities")
        .select("user_id, authority_key, granted")
        .in("user_id", profileIds)
        .eq("granted", true)
    : { data: [], error: null };
  if (userGrantsResult.error) throw new Error(userGrantsResult.error.message);
  const extrasByUser = new Map<string, string[]>();
  for (const grant of userGrantsResult.data ?? []) {
    const current = extrasByUser.get(grant.user_id) ?? [];
    current.push(grant.authority_key);
    extrasByUser.set(grant.user_id, current);
  }

  const roleById = new Map(roles.map((role) => [role.id, role]));
  const counts = new Map<string, number>();
  for (const profile of profilesResult.data ?? []) {
    if (profile.role_id) counts.set(profile.role_id, (counts.get(profile.role_id) ?? 0) + 1);
  }
  const catalogByKey = new Map(AUTHORITIES.map((authority) => [authority.key, authority]));

  return {
    users: (profilesResult.data ?? []).map((profile) => {
      const role = profile.role_id ? roleById.get(profile.role_id) : null;
      return {
        ...profile,
        role_name: role?.name ?? null,
        role_slug: role?.slug ?? null,
        extra_authority_keys: extrasByUser.get(profile.id) ?? [],
      };
    }),
    roles: roles.map((role) => ({
      ...role,
      authority_keys: grantsByRole.get(role.id) ?? [],
      assignment_pools: normalizeAssignmentPools(
        (role as { assignment_pools?: unknown }).assignment_pools
      ),
      user_count: counts.get(role.id) ?? 0,
    })),
    authorities: (authoritiesResult.data ?? []).map((authority) => {
      const catalog = catalogByKey.get(authority.key as (typeof AUTHORITIES)[number]["key"]);
      return {
        ...authority,
        label: catalog?.label ?? authority.label,
        description: catalog?.description,
      };
    }),
    current_user_id: access.profile.id,
    can_manage_users: access.canManageUsers,
    can_manage_roles: access.canManageRoles,
    is_privileged: access.isPrivileged,
  } as TeamAccessData;
}

export async function createTeamUser(formData: FormData) {
  const access = await requireTeamAccess("users");
  const parsed = createUserSchema.parse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    password: formData.get("password"),
    roleId: formData.get("roleId"),
  });
  const profilePicture = readProfilePicture(formData);
  const role = await getCompanyRole(parsed.roleId, access.profile.company_id);
  if ((role.slug === "admin" || (await roleHasFullAccess(role.id))) && !access.isPrivileged) {
    throw new Error("Only an admin or full-access user can assign this role.");
  }

  const admin = createAdminClient();
  const baselineRole = baselineRoleFor(role);
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: parsed.email.toLowerCase(),
    password: parsed.password,
    email_confirm: true,
    user_metadata: {
      company_id: access.profile.company_id,
      name: parsed.name,
      phone: parsed.phone,
      role: baselineRole,
      role_id: role.id,
    },
  });
  if (createError || !created.user) {
    throw new Error(createError?.message ?? "Could not create user.");
  }

  const { error: profileError } = await admin.from("profiles").upsert({
    id: created.user.id,
    company_id: access.profile.company_id,
    name: parsed.name,
    email: parsed.email.toLowerCase(),
    phone: parsed.phone,
    role: baselineRole,
    role_id: role.id,
    is_active: true,
    updated_at: new Date().toISOString(),
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
    throw new Error(`User profile setup failed: ${profileError.message}`);
  }

  if (profilePicture) {
    try {
      await saveProfilePicture(access.profile.company_id, created.user.id, profilePicture);
    } catch (error) {
      await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
      throw error;
    }
  }

  await writeTeamAudit(access, "team_user_created", "profile", created.user.id, {
    roleId: role.id,
    roleSlug: role.slug,
    hasProfilePicture: Boolean(profilePicture),
  });
  revalidateTeam();
  return { ok: true };
}

export async function setTeamUserProfilePicture(userId: string, formData: FormData) {
  const access = await requireTeamAccess("users");
  const target = await getCompanyTarget(idSchema.parse(userId), access.profile.company_id);
  await assertCanManageTarget(access, target);

  if (formData.get("remove") === "true") {
    await removeProfilePicture(
      access.profile.company_id,
      target.id,
      target.avatar_storage_path
    );
  } else {
    const file = readProfilePicture(formData);
    if (!file) throw new Error("Choose a profile picture first.");
    await saveProfilePicture(
      access.profile.company_id,
      target.id,
      file,
      target.avatar_storage_path
    );
  }

  await writeTeamAudit(access, "team_user_profile_picture_updated", "profile", target.id, {
    removed: formData.get("remove") === "true",
  });
  revalidateTeam();
  return { ok: true };
}

export async function assignTeamUserRole(userId: string, roleId: string) {
  const access = await requireTeamAccess("users");
  const targetId = idSchema.parse(userId);
  const selectedRoleId = idSchema.parse(roleId);
  if (targetId === access.profile.id) throw new Error("You cannot change your own role.");

  const [target, role] = await Promise.all([
    getCompanyTarget(targetId, access.profile.company_id),
    getCompanyRole(selectedRoleId, access.profile.company_id),
  ]);
  await assertCanManageTarget(access, target);
  if ((role.slug === "admin" || (await roleHasFullAccess(role.id))) && !access.isPrivileged) {
    throw new Error("Only an admin or full-access user can assign this role.");
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({
      role: baselineRoleFor(role),
      role_id: role.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", target.id)
    .eq("company_id", access.profile.company_id);
  if (error) throw new Error(error.message);

  await writeTeamAudit(access, "team_user_role_changed", "profile", target.id, {
    previousRoleId: target.role_id,
    roleId: role.id,
    roleSlug: role.slug,
  });
  revalidateTeam();
  return { ok: true };
}

export async function resetTeamUserPassword(userId: string, password: string) {
  const access = await requireTeamAccess("users");
  const target = await getCompanyTarget(idSchema.parse(userId), access.profile.company_id);
  await assertCanManageTarget(access, target);
  const parsedPassword = teamPasswordSchema.parse(password);

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(target.id, {
    password: parsedPassword,
  });
  if (error) throw new Error(error.message);

  await writeTeamAudit(access, "team_user_password_reset", "profile", target.id);
  return { ok: true };
}

export async function setTeamUserActive(userId: string, isActive: boolean) {
  const access = await requireTeamAccess("users");
  const target = await getCompanyTarget(idSchema.parse(userId), access.profile.company_id);
  if (!isActive && target.id === access.profile.id) {
    throw new Error("You cannot deactivate your own account.");
  }
  await assertCanManageTarget(access, target);
  if (target.is_active === isActive) return { ok: true };

  const admin = createAdminClient();
  if (!isActive) {
    const { error: profileError } = await admin
      .from("profiles")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", target.id)
      .eq("company_id", access.profile.company_id);
    if (profileError) throw new Error(profileError.message);

    const { error: banError } = await admin.auth.admin.updateUserById(target.id, {
      ban_duration: PERMANENT_BAN_DURATION,
    });
    if (banError) {
      await admin
        .from("profiles")
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq("id", target.id)
        .eq("company_id", access.profile.company_id);
      throw new Error(`Could not ban auth account: ${banError.message}`);
    }
  } else {
    const { error: unbanError } = await admin.auth.admin.updateUserById(target.id, {
      ban_duration: "none",
    });
    if (unbanError) throw new Error(`Could not unban auth account: ${unbanError.message}`);

    const { error: profileError } = await admin
      .from("profiles")
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq("id", target.id)
      .eq("company_id", access.profile.company_id);
    if (profileError) {
      await admin.auth.admin
        .updateUserById(target.id, { ban_duration: PERMANENT_BAN_DURATION })
        .catch(() => undefined);
      throw new Error(`Could not reactivate profile: ${profileError.message}`);
    }
  }

  await writeTeamAudit(
    access,
    isActive ? "team_user_reactivated" : "team_user_deactivated",
    "profile",
    target.id
  );
  revalidateTeam();
  return { ok: true };
}

const updateUserSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(255),
  phone: z
    .string()
    .trim()
    .max(20, "Phone must be 20 characters or fewer")
    .refine((v) => v === "" || v.length >= 6, "Phone must be at least 6 characters"),
});

/** Edit a team member's name and phone. Login email is intentionally not editable. */
export async function updateTeamUser(
  userId: string,
  input: z.input<typeof updateUserSchema>
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const access = await requireTeamAccess("users");
    const target = await getCompanyTarget(idSchema.parse(userId), access.profile.company_id);
    await assertCanManageTarget(access, target);
    const parsed = updateUserSchema.safeParse({ name: input.name, phone: input.phone });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid details" };
    }
    const name = parsed.data.name;
    const phone = parsed.data.phone || null;

    const changed: string[] = [];
    if (name !== target.name) changed.push("name");
    if ((phone ?? "") !== (target.phone ?? "")) changed.push("phone");
    if (changed.length === 0) return { ok: true };

    const admin = createAdminClient();
    const { error: profileError } = await admin
      .from("profiles")
      .update({ name, phone, updated_at: new Date().toISOString() })
      .eq("id", target.id)
      .eq("company_id", access.profile.company_id);
    if (profileError) return { ok: false, error: profileError.message };

    const { data: authUser } = await admin.auth.admin.getUserById(target.id);
    await admin.auth.admin
      .updateUserById(target.id, {
        user_metadata: { ...(authUser?.user?.user_metadata ?? {}), name, phone },
      })
      .catch(() => undefined);

    await writeTeamAudit(access, "team_user_updated", "profile", target.id, { fields: changed });
    revalidateTeam();
    revalidatePath("/pipeline");
    revalidatePath("/customers");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not update user.",
    };
  }
}

export async function upsertTeamRole(input: z.input<typeof roleFormSchema>) {
  const access = await requireTeamAccess("roles");
  const parsed = roleFormSchema.parse(input);
  const admin = createAdminClient();

  if (parsed.id) {
    const role = await getCompanyRole(parsed.id, access.profile.company_id);
    const roleIsPrivileged = role.slug === "admin" || (await roleHasFullAccess(role.id));
    if (roleIsPrivileged && !access.isPrivileged) {
      throw new Error("Only an admin or full-access user can edit this role.");
    }
    if (access.profile.role_id === role.id && !access.isPrivileged) {
      throw new Error("You cannot edit the role assigned to your own account.");
    }
    const updatePayload: Record<string, unknown> = {
      name: parsed.name,
      description: parsed.description || null,
    };
    if (parsed.assignment_pools) {
      updatePayload.assignment_pools = normalizeAssignmentPools(parsed.assignment_pools);
    }
    const { error } = await admin
      .from("roles")
      .update(updatePayload)
      .eq("id", role.id)
      .eq("company_id", access.profile.company_id);
    if (error) {
      if (
        parsed.assignment_pools &&
        /assignment_pools|column .* does not exist/i.test(error.message)
      ) {
        throw new Error(
          "Database is missing assignment pools. Run supabase/migrations/063_role_assignment_pools.sql."
        );
      }
      throw new Error(error.message);
    }
    await writeTeamAudit(access, "team_role_updated", "role", role.id);
  } else {
    const baseSlug = slugifyRoleName(parsed.name);
    if (!baseSlug) throw new Error("Role name must contain letters or numbers.");
    let slug = baseSlug;
    let suffix = 2;
    while (true) {
      const { data } = await admin
        .from("roles")
        .select("id")
        .eq("company_id", access.profile.company_id)
        .eq("slug", slug)
        .maybeSingle();
      if (!data) break;
      slug = `${baseSlug.slice(0, 72)}_${suffix++}`;
    }
    const insertPayload: Record<string, unknown> = {
      company_id: access.profile.company_id,
      name: parsed.name,
      slug,
      description: parsed.description || null,
      is_system: false,
      assignment_pools: normalizeAssignmentPools(parsed.assignment_pools ?? []),
    };
    const { data, error } = await admin
      .from("roles")
      .insert(insertPayload)
      .select("id")
      .single();
    if (error || !data) {
      if (error && /assignment_pools|column .* does not exist/i.test(error.message)) {
        const retry = await admin
          .from("roles")
          .insert({
            company_id: access.profile.company_id,
            name: parsed.name,
            slug,
            description: parsed.description || null,
            is_system: false,
          })
          .select("id")
          .single();
        if (retry.error || !retry.data) {
          throw new Error(retry.error?.message ?? "Could not create role.");
        }
        await writeTeamAudit(access, "team_role_created", "role", retry.data.id, { slug });
        revalidateTeam();
        return { ok: true };
      }
      throw new Error(error?.message ?? "Could not create role.");
    }
    await writeTeamAudit(access, "team_role_created", "role", data.id, { slug });
  }

  revalidateTeam();
  return { ok: true };
}

export async function updateTeamRoleAssignmentPools(
  roleId: string,
  pools: AssignmentPoolKey[]
) {
  const access = await requireTeamAccess("roles");
  const role = await getCompanyRole(idSchema.parse(roleId), access.profile.company_id);
  const roleIsPrivileged = role.slug === "admin" || (await roleHasFullAccess(role.id));
  if (roleIsPrivileged && !access.isPrivileged) {
    throw new Error("Only an admin or full-access user can edit this role.");
  }
  if (access.profile.role_id === role.id && !access.isPrivileged) {
    throw new Error("You cannot edit the role assigned to your own account.");
  }

  const normalized = normalizeAssignmentPools(z.array(poolKeySchema).parse(pools));
  const admin = createAdminClient();
  const { error } = await admin
    .from("roles")
    .update({ assignment_pools: normalized })
    .eq("id", role.id)
    .eq("company_id", access.profile.company_id);
  if (error) {
    if (/assignment_pools|column .* does not exist/i.test(error.message)) {
      throw new Error(
        "Database is missing assignment pools. Run supabase/migrations/063_role_assignment_pools.sql."
      );
    }
    throw new Error(error.message);
  }

  await writeTeamAudit(access, "team_role_assignment_pools_updated", "role", role.id, {
    assignmentPools: normalized,
  });
  revalidateTeam();
  return { ok: true };
}

/** Bulk-save assignment pools for many roles (matrix editor). */
export async function updateTeamRoleAssignmentPoolsBatch(
  updates: Array<{ roleId: string; pools: AssignmentPoolKey[] }>
) {
  const access = await requireTeamAccess("roles");
  const parsed = z
    .array(
      z.object({
        roleId: idSchema,
        pools: z.array(poolKeySchema),
      })
    )
    .parse(updates);

  const admin = createAdminClient();
  for (const row of parsed) {
    const role = await getCompanyRole(row.roleId, access.profile.company_id);
    const roleIsPrivileged = role.slug === "admin" || (await roleHasFullAccess(role.id));
    if (roleIsPrivileged && !access.isPrivileged) {
      throw new Error(`Only an admin or full-access user can edit ${role.name}.`);
    }
    if (access.profile.role_id === role.id && !access.isPrivileged) {
      throw new Error("You cannot edit the role assigned to your own account.");
    }
    const normalized = normalizeAssignmentPools(row.pools);
    const { error } = await admin
      .from("roles")
      .update({ assignment_pools: normalized })
      .eq("id", role.id)
      .eq("company_id", access.profile.company_id);
    if (error) {
      if (/assignment_pools|column .* does not exist/i.test(error.message)) {
        throw new Error(
          "Database is missing assignment pools. Run supabase/migrations/063_role_assignment_pools.sql."
        );
      }
      throw new Error(error.message);
    }
  }

  await writeTeamAudit(access, "team_role_assignment_pools_batch", "role", parsed[0]?.roleId ?? access.profile.id, {
    roleCount: parsed.length,
  });
  revalidateTeam();
  return { ok: true };
}

/**
 * Replace a user's additive authority overrides (`user_authorities`).
 * Does not change their role. Keys already on the role are ignored.
 */
export async function updateTeamUserAuthorities(userId: string, authorityKeys: string[]) {
  const access = await requireTeamAccess();
  if (!access.canManageRoles && !access.isPrivileged) {
    // Extra permissions are a roles/permissions concern; require manage_roles or admin.
    throw new Error("You need Manage Roles & Permissions to edit user overrides.");
  }
  if (!access.canManageUsers && !access.isPrivileged) {
    throw new Error("You need Manage Team to edit user overrides.");
  }
  const target = await getCompanyTarget(idSchema.parse(userId), access.profile.company_id);
  await assertCanManageTarget(access, target);

  const parsedKeys = z.array(z.enum(AUTHORITY_KEYS as [string, ...string[]])).parse(authorityKeys);
  let uniqueKeys = [...new Set(parsedKeys)];

  if (uniqueKeys.includes("full_access") && !access.isPrivileged) {
    throw new Error("Only an admin or full-access user can grant Full Access.");
  }

  // Dealers cannot receive company-wide CRM keys (mirrors RLS 068 + getUserAuthorities).
  if (target.role === "dealer") {
    const blocked = new Set([
      "view_all_leads",
      "view_all_quotations",
      "full_access",
      "manage_quotations",
    ]);
    uniqueKeys = uniqueKeys.filter((key) => !blocked.has(key));
  }

  const roleKeys = new Set<string>();
  if (target.role_id) {
    const adminForRole = createAdminClient();
    const { data: roleGrants, error: roleErr } = await adminForRole
      .from("role_authorities")
      .select("authority_key")
      .eq("role_id", target.role_id)
      .eq("granted", true);
    if (roleErr) throw new Error(roleErr.message);
    for (const row of roleGrants ?? []) roleKeys.add(row.authority_key);
  }
  // Persist only true extras (not already on the role).
  uniqueKeys = uniqueKeys.filter((key) => !roleKeys.has(key));

  const admin = createAdminClient();
  const { data: catalog, error: catalogError } = await admin
    .from("authorities")
    .select("key")
    .in("key", uniqueKeys.length ? uniqueKeys : ["__none__"]);
  if (catalogError) throw new Error(catalogError.message);
  if ((catalog ?? []).length !== uniqueKeys.length) {
    throw new Error("One or more authority keys are not in the authority catalog.");
  }

  const { data: previousGrants, error: previousError } = await admin
    .from("user_authorities")
    .select("authority_key, granted")
    .eq("user_id", target.id);
  if (previousError) throw new Error(previousError.message);

  const { error: deleteError } = await admin
    .from("user_authorities")
    .delete()
    .eq("user_id", target.id);
  if (deleteError) throw new Error(deleteError.message);

  if (uniqueKeys.length) {
    const { error: insertError } = await admin.from("user_authorities").insert(
      uniqueKeys.map((authorityKey) => ({
        user_id: target.id,
        authority_key: authorityKey,
        granted: true,
      }))
    );
    if (insertError) {
      if (previousGrants?.length) {
        await admin.from("user_authorities").insert(
          previousGrants.map((grant) => ({
            user_id: target.id,
            authority_key: grant.authority_key,
            granted: grant.granted,
          }))
        );
      }
      throw new Error(insertError.message);
    }
  }

  await writeTeamAudit(access, "team_user_authorities_updated", "profile", target.id, {
    authorityKeys: uniqueKeys,
  });
  revalidateTeam();
  return { ok: true, authorityKeys: uniqueKeys };
}

export async function updateTeamRoleAuthorities(roleId: string, authorityKeys: string[]) {
  const access = await requireTeamAccess("roles");
  const role = await getCompanyRole(idSchema.parse(roleId), access.profile.company_id);
  const parsedKeys = z.array(z.enum(AUTHORITY_KEYS as [string, ...string[]])).parse(authorityKeys);
  const uniqueKeys = [...new Set(parsedKeys)];
  const currentHasFullAccess = await roleHasFullAccess(role.id);
  if (
    !access.isPrivileged &&
    (role.slug === "admin" ||
      currentHasFullAccess ||
      uniqueKeys.includes("full_access") ||
      access.profile.role_id === role.id)
  ) {
    throw new Error("Only an admin or full-access user can change these authorities.");
  }

  const admin = createAdminClient();
  const { data: previousGrants, error: previousError } = await admin
    .from("role_authorities")
    .select("authority_key, granted")
    .eq("role_id", role.id);
  if (previousError) throw new Error(previousError.message);
  const { data: catalog, error: catalogError } = await admin
    .from("authorities")
    .select("key")
    .in("key", uniqueKeys.length ? uniqueKeys : ["__none__"]);
  if (catalogError) throw new Error(catalogError.message);
  if ((catalog ?? []).length !== uniqueKeys.length) {
    throw new Error("One or more authority keys are not in the authority catalog.");
  }

  const { error: deleteError } = await admin
    .from("role_authorities")
    .delete()
    .eq("role_id", role.id);
  if (deleteError) throw new Error(deleteError.message);
  if (uniqueKeys.length) {
    const { error: insertError } = await admin.from("role_authorities").insert(
      uniqueKeys.map((authorityKey) => ({
        role_id: role.id,
        authority_key: authorityKey,
        granted: true,
      }))
    );
    if (insertError) {
      if (previousGrants?.length) {
        await admin.from("role_authorities").insert(
          previousGrants.map((grant) => ({
            role_id: role.id,
            authority_key: grant.authority_key,
            granted: grant.granted,
          }))
        );
      }
      throw new Error(insertError.message);
    }
  }

  await writeTeamAudit(access, "team_role_authorities_updated", "role", role.id, {
    authorityKeys: uniqueKeys,
  });
  revalidateTeam();
  return { ok: true };
}

export async function deleteTeamRole(roleId: string) {
  const access = await requireTeamAccess("roles");
  const role = await getCompanyRole(idSchema.parse(roleId), access.profile.company_id);
  if (role.is_system) throw new Error("System roles cannot be deleted.");
  if ((await roleHasFullAccess(role.id)) && !access.isPrivileged) {
    throw new Error("Only an admin or full-access user can delete this role.");
  }

  const admin = createAdminClient();
  const { count, error: countError } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("company_id", access.profile.company_id)
    .eq("role_id", role.id);
  if (countError) throw new Error(countError.message);
  if ((count ?? 0) > 0) throw new Error("Move all users off this role before deleting it.");

  const { error } = await admin
    .from("roles")
    .delete()
    .eq("id", role.id)
    .eq("company_id", access.profile.company_id)
    .eq("is_system", false);
  if (error) throw new Error(error.message);

  await writeTeamAudit(access, "team_role_deleted", "role", role.id, { slug: role.slug });
  revalidateTeam();
  return { ok: true };
}
