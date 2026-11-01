"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  assignTeamUserRole,
  createTeamUser,
  deleteTeamRole,
  resetTeamUserPassword,
  setTeamUserActive,
  setTeamUserProfilePicture,
  updateTeamRoleAssignmentPoolsBatch,
  updateTeamRoleAuthorities,
  updateTeamUser,
  updateTeamUserAuthorities,
  upsertTeamRole,
} from "@/actions/team";
import { PasswordRequirementsChecklist } from "@/components/admin/password-requirements-checklist";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/layout/page-header";
import { ROLE_LABELS } from "@/lib/brand";
import {
  AUTHORITY_KEYS,
  getAuthorityUiSections,
  type AuthorityUiItem,
  type AuthorityUiSection,
} from "@/lib/domain/authorities";
import {
  ASSIGNMENT_POOLS,
  poolLabel,
  type AssignmentPoolKey,
} from "@/lib/domain/assignment-pools";
import { passwordMeetsPolicy } from "@/lib/password-policy";
import type { TeamAccessData, TeamRole, TeamUser } from "@/lib/domain/team";

type Feedback = { kind: "success" | "error"; message: string } | null;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function roleLabel(user: TeamUser) {
  return user.role_name ?? ROLE_LABELS[user.role] ?? user.role_slug ?? user.role;
}

function ProfileAvatar({ user }: { user: Pick<TeamUser, "name" | "avatar_url"> }) {
  return user.avatar_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={user.avatar_url}
      alt={`${user.name}'s profile`}
      className="h-10 w-10 shrink-0 rounded-full border border-[var(--border)] object-cover"
    />
  ) : (
    <span
      aria-hidden="true"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--primary-faint)] text-sm font-semibold text-[var(--primary)]"
    >
      {user.name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

function isPrivilegedRole(role: TeamRole) {
  return role.slug === "admin" || role.authority_keys.includes("full_access");
}

export function TeamAccessManager({ data }: { data: TeamAccessData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<"users" | "roles">(
    data.can_manage_users ? "users" : "roles"
  );
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [passwordUser, setPasswordUser] = useState<TeamUser | null>(null);
  const [profilePictureUser, setProfilePictureUser] = useState<TeamUser | null>(null);
  const [editUser, setEditUser] = useState<TeamUser | null>(null);
  const [permissionsUser, setPermissionsUser] = useState<TeamUser | null>(null);
  const [roleEditor, setRoleEditor] = useState<TeamRole | "new" | null>(null);
  const [authorityRole, setAuthorityRole] = useState<TeamRole | null>(null);
  const [poolsMatrixOpen, setPoolsMatrixOpen] = useState(false);

  function run(action: () => Promise<unknown>, success: string, after?: () => void) {
    setFeedback(null);
    startTransition(async () => {
      try {
        await action();
        setFeedback({ kind: "success", message: success });
        after?.();
        router.refresh();
      } catch (error) {
        setFeedback({ kind: "error", message: errorMessage(error) });
      }
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Team & Access"
        subtitle="Manage company users, roles, and authority grants."
        className="mb-0"
      />

      <div className="flex gap-1 border-b border-[var(--border)]">
        {data.can_manage_users && (
          <TabButton active={tab === "users"} onClick={() => setTab("users")}>
            Users
          </TabButton>
        )}
        {data.can_manage_roles && (
          <TabButton active={tab === "roles"} onClick={() => setTab("roles")}>
            Roles
          </TabButton>
        )}
      </div>

      {feedback && (
        <div
          role="status"
          className={`rounded-lg border px-3 py-2 text-sm ${
            feedback.kind === "error"
              ? "border-red-200 bg-[var(--error-light)] text-[var(--error)]"
              : "border-emerald-200 bg-[var(--success-light)] text-[var(--success)]"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {tab === "users" && data.can_manage_users && (
        <UsersTab
          data={data}
          pending={pending}
          onCreate={() => setCreateUserOpen(true)}
          onResetPassword={setPasswordUser}
          onEditProfilePicture={setProfilePictureUser}
          onEdit={setEditUser}
          onPermissions={setPermissionsUser}
          canEditPermissions={data.can_manage_roles || data.is_privileged}
          run={run}
        />
      )}
      {tab === "roles" && data.can_manage_roles && (
        <RolesTab
          data={data}
          pending={pending}
          onEdit={setRoleEditor}
          onAuthorities={setAuthorityRole}
          onOpenPoolsMatrix={() => setPoolsMatrixOpen(true)}
          run={run}
        />
      )}

      <CreateUserModal
        open={createUserOpen}
        roles={data.roles}
        isPrivileged={data.is_privileged}
        pending={pending}
        onClose={() => setCreateUserOpen(false)}
        run={run}
      />
      <PasswordModal
        user={passwordUser}
        pending={pending}
        onClose={() => setPasswordUser(null)}
        run={run}
      />
      <EditUserModal
        key={editUser?.id ?? "edit-user-empty"}
        user={editUser}
        pending={pending}
        onClose={() => setEditUser(null)}
        run={run}
      />
      <UserPermissionsModal
        key={
          permissionsUser
            ? `${permissionsUser.id}:${permissionsUser.extra_authority_keys.join(",")}`
            : "user-permissions-empty"
        }
        user={permissionsUser}
        data={data}
        pending={pending}
        onClose={() => setPermissionsUser(null)}
        run={run}
      />
      <ProfilePictureModal
        key={profilePictureUser?.id ?? "profile-picture-empty"}
        user={profilePictureUser}
        pending={pending}
        onClose={() => setProfilePictureUser(null)}
        run={run}
      />
      <RoleEditorModal
        role={roleEditor}
        pending={pending}
        onClose={() => setRoleEditor(null)}
        run={run}
      />
      <AuthorityEditorModal
        role={authorityRole}
        data={data}
        pending={pending}
        onClose={() => setAuthorityRole(null)}
        run={run}
      />
      <AssignmentPoolsMatrixModal
        open={poolsMatrixOpen}
        roles={data.roles}
        isPrivileged={data.is_privileged}
        currentUserRoleId={
          data.users.find((u) => u.id === data.current_user_id)?.role_id ?? null
        }
        pending={pending}
        onClose={() => setPoolsMatrixOpen(false)}
        run={run}
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-b-2 px-4 py-2 text-sm font-medium ${
        active
          ? "border-[var(--primary)] text-[var(--primary)]"
          : "border-transparent text-[var(--text-muted)]"
      }`}
    >
      {children}
    </button>
  );
}

function UsersTab({
  data,
  pending,
  onCreate,
  onResetPassword,
  onEditProfilePicture,
  onEdit,
  onPermissions,
  canEditPermissions,
  run,
}: {
  data: TeamAccessData;
  pending: boolean;
  onCreate: () => void;
  onResetPassword: (user: TeamUser) => void;
  onEditProfilePicture: (user: TeamUser) => void;
  onEdit: (user: TeamUser) => void;
  onPermissions: (user: TeamUser) => void;
  canEditPermissions: boolean;
  run: (action: () => Promise<unknown>, success: string, after?: () => void) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>("active");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  const activeCount = data.users.filter((u) => u.is_active).length;
  const inactiveCount = data.users.length - activeCount;

  const visibleUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = query.replace(/\D/g, "");
    return data.users.filter((user) => {
      if (statusFilter === "active" && !user.is_active) return false;
      if (statusFilter === "inactive" && user.is_active) return false;
      if (roleFilter !== "all" && user.role_id !== roleFilter) return false;
      if (!q) return true;
      return (
        user.name.toLowerCase().includes(q) ||
        (user.email?.toLowerCase().includes(q) ?? false) ||
        (user.phone?.toLowerCase().includes(q) ?? false) ||
        (digits.length >= 3 && (user.phone ?? "").replace(/\D/g, "").includes(digits))
      );
    });
  }, [data.users, statusFilter, roleFilter, query]);

  const statusOptions: Array<[UserStatusFilter, string, number]> = [
    ["all", "All", data.users.length],
    ["active", "Active", activeCount],
    ["inactive", "Inactive", inactiveCount],
  ];

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-dark)]">Company users</h2>
          <p className="text-xs text-[var(--text-muted)]">
            {activeCount} active · {inactiveCount} inactive
            {canEditPermissions
              ? " · Use Permissions to grant 2–3 extras without changing the role"
              : ""}
          </p>
        </div>
        <Button type="button" size="sm" onClick={onCreate}>
          Add user
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-[var(--border)] bg-white p-0.5">
          {statusOptions.map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatusFilter(value)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                statusFilter === value
                  ? value === "inactive"
                    ? "bg-[var(--error)] text-white"
                    : "bg-[var(--primary)] text-white"
                  : "text-[var(--text-muted)] hover:text-[var(--text-dark)]"
              }`}
            >
              {label} ({count})
            </button>
          ))}
        </div>
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, email, phone…"
          className="max-w-xs"
        />
        <Select
          value={roleFilter}
          onChange={(event) => setRoleFilter(event.target.value)}
          className="w-auto"
          aria-label="Filter by role"
        >
          <option value="all">All roles</option>
          {data.roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--bg)] text-xs uppercase tracking-wider text-[var(--text-muted)]">
            <tr>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleUsers.map((user) => {
              const currentRole = data.roles.find((role) => role.id === user.role_id);
              const targetPrivileged =
                user.role === "admin" || Boolean(currentRole && isPrivilegedRole(currentRole));
              const protectedTarget = targetPrivileged && !data.is_privileged;
              const isSelf = user.id === data.current_user_id;
              return (
                <tr
                  key={user.id}
                  className={`border-b border-[var(--border-light)] align-top ${
                    user.is_active ? "" : "bg-[var(--bg)]/60 text-[var(--text-muted)]"
                  }`}
                >
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2.5">
                      <ProfileAvatar user={user} />
                      <div>
                        <span className="block font-medium text-[var(--text-dark)]">{user.name}</span>
                        <span className="block text-xs text-[var(--text-muted)]">
                          {user.email ?? "No email"}
                        </span>
                        {isSelf && <span className="text-xs text-[var(--primary)]">You</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-[var(--text-muted)]">{user.phone || "—"}</td>
                  <td className="min-w-48 px-3 py-3">
                    <Select
                      aria-label={`Role for ${user.name}`}
                      value={user.role_id ?? ""}
                      disabled={pending || isSelf || protectedTarget}
                      onChange={(event) =>
                        run(
                          () => assignTeamUserRole(user.id, event.target.value),
                          `${user.name}'s role was updated.`
                        )
                      }
                    >
                      {!user.role_id && <option value="">{roleLabel(user)}</option>}
                      {data.roles.map((role) => (
                        <option
                          key={role.id}
                          value={role.id}
                          disabled={!data.is_privileged && isPrivilegedRole(role)}
                        >
                          {role.name}
                        </option>
                      ))}
                    </Select>
                    {(user.extra_authority_keys?.length ?? 0) > 0 && (
                      <p className="mt-1 text-xs font-medium text-[var(--primary)]">
                        +{user.extra_authority_keys.length} extra permission
                        {user.extra_authority_keys.length === 1 ? "" : "s"}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <Badge variant={user.is_active ? "survey_completed" : "lost"}>
                      {user.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex min-w-52 flex-wrap gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={pending || protectedTarget}
                        onClick={() => onEdit(user)}
                      >
                        Edit
                      </Button>
                      {canEditPermissions && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={pending || protectedTarget}
                          onClick={() => onPermissions(user)}
                        >
                          Permissions
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={pending || protectedTarget}
                        onClick={() => onResetPassword(user)}
                      >
                        Change password
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={pending || protectedTarget}
                        onClick={() => onEditProfilePicture(user)}
                      >
                        {user.avatar_url ? "Edit picture" : "Add picture"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={user.is_active ? "danger" : "secondary"}
                        disabled={pending || protectedTarget || (isSelf && user.is_active)}
                        onClick={() => {
                          const nextActive = !user.is_active;
                          if (
                            window.confirm(
                              `${nextActive ? "Reactivate" : "Deactivate"} ${user.name}?`
                            )
                          ) {
                            run(
                              () => setTeamUserActive(user.id, nextActive),
                              `${user.name} was ${nextActive ? "reactivated" : "deactivated"}.`
                            );
                          }
                        }}
                      >
                        {user.is_active ? "Deactivate" : "Reactivate"}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {visibleUsers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-[var(--text-muted)]">
                  {statusFilter === "inactive" && !query && roleFilter === "all"
                    ? "No inactive users."
                    : "No users match these filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type UserStatusFilter = "all" | "active" | "inactive";

function EditUserModal({
  user,
  pending,
  onClose,
  run,
}: {
  user: TeamUser | null;
  pending: boolean;
  onClose: () => void;
  run: (action: () => Promise<unknown>, success: string, after?: () => void) => void;
}) {
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  return (
    <Modal
      open={Boolean(user)}
      onClose={onClose}
      title="Edit user"
      subtitle={user ? `Update ${user.name}'s details.` : undefined}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!user) return;
          run(
            async () => {
              const result = await updateTeamUser(user.id, { name, phone });
              if (!result.ok) throw new Error(result.error);
            },
            `${name.trim()}'s details were updated.`,
            onClose
          );
        }}
      >
        <div>
          <Label>Name</Label>
          <Input
            required
            minLength={2}
            maxLength={255}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div>
          <Label>Phone</Label>
          <Input
            type="tel"
            maxLength={20}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </div>
        <div>
          <Label>Login email</Label>
          <Input value={user?.email ?? ""} disabled readOnly />
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Login email can&apos;t be changed here.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || name.trim().length < 2}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function RolesTab({
  data,
  pending,
  onEdit,
  onAuthorities,
  onOpenPoolsMatrix,
  run,
}: {
  data: TeamAccessData;
  pending: boolean;
  onEdit: (role: TeamRole | "new") => void;
  onAuthorities: (role: TeamRole) => void;
  onOpenPoolsMatrix: () => void;
  run: (action: () => Promise<unknown>, success: string, after?: () => void) => void;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-dark)]">Company roles</h2>
          <p className="text-xs text-[var(--text-muted)]">
            Role Permissions apply to everyone on that role. For 2–3 extras on one person, use
            Users → Permissions. Assignment pools control Surveyor / Crew / Dealer pickers.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={onOpenPoolsMatrix}>
            Assignment pools
          </Button>
          <Button type="button" size="sm" onClick={() => onEdit("new")}>
            Add role
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {data.roles.map((role) => {
          const protectedRole =
            !data.is_privileged &&
            (isPrivilegedRole(role) || role.id === data.users.find((u) => u.id === data.current_user_id)?.role_id);
          const pools = role.assignment_pools ?? [];
          return (
            <article
              key={role.id}
              className="rounded-xl border border-[var(--border)] bg-white p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-[var(--text-dark)]">{role.name}</h3>
                    {role.is_system && <Badge>System</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {role.description || "No description"}
                  </p>
                  <p className="mt-2 text-xs text-[var(--text-muted)]">
                    {role.user_count} users · {role.authority_keys.length} permissions · {role.slug}
                  </p>
                  {pools.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {pools.map((pool) => (
                        <span
                          key={pool}
                          className="rounded-md bg-[var(--primary-faint)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--primary)]"
                        >
                          {poolLabel(pool)}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-[10px] text-[var(--text-muted)]">
                      Not shown in assignment pickers
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={pending || protectedRole}
                  onClick={() => onEdit(role)}
                >
                  Edit details
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={pending || protectedRole}
                  onClick={() => onAuthorities(role)}
                >
                  Permissions
                </Button>
                {!role.is_system && (
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    disabled={pending || role.user_count > 0 || protectedRole}
                    onClick={() => {
                      if (window.confirm(`Delete the ${role.name} role?`)) {
                        run(() => deleteTeamRole(role.id), `${role.name} was deleted.`);
                      }
                    }}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function CreateUserModal({
  open,
  roles,
  isPrivileged,
  pending,
  onClose,
  run,
}: {
  open: boolean;
  roles: TeamRole[];
  isPrivileged: boolean;
  pending: boolean;
  onClose: () => void;
  run: (action: () => Promise<unknown>, success: string, after?: () => void) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const pictureInputRef = useRef<HTMLInputElement>(null);
  const availableRoles = roles.filter((role) => isPrivileged || !isPrivilegedRole(role));
  const [roleId, setRoleId] = useState(availableRoles[0]?.id ?? "");

  function resetAndClose() {
    setName("");
    setEmail("");
    setPhone("");
    setPassword("");
    setRoleId(availableRoles[0]?.id ?? "");
    if (pictureInputRef.current) pictureInputRef.current.value = "";
    onClose();
  }

  return (
    <Modal open={open} onClose={resetAndClose} title="Add team user">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          run(
            () => createTeamUser(formData),
            `${name} was added to the team.`,
            resetAndClose
          );
        }}
      >
        <div>
          <Label>Name</Label>
          <Input
            name="name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div>
          <Label>Email</Label>
          <Input
            name="email"
            required
            type="email"
            autoComplete="off"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div>
          <Label>Phone</Label>
          <Input
            name="phone"
            required
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </div>
        <div>
          <Label>Password</Label>
          <Input
            name="password"
            required
            type="password"
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <PasswordRequirementsChecklist password={password} />
        </div>
        <div>
          <Label>Role</Label>
          <Select
            name="roleId"
            required
            value={roleId}
            onChange={(event) => setRoleId(event.target.value)}
          >
            {availableRoles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Profile picture</Label>
          <Input
            ref={pictureInputRef}
            name="profilePicture"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/heic"
          />
          <p className="mt-1 text-xs text-[var(--text-muted)]">Optional · JPG, PNG, WEBP, GIF, or HEIC · max 5 MB.</p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={resetAndClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || !roleId || !passwordMeetsPolicy(password)}>
            {pending ? "Creating…" : "Create user"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function PasswordModal({
  user,
  pending,
  onClose,
  run,
}: {
  user: TeamUser | null;
  pending: boolean;
  onClose: () => void;
  run: (action: () => Promise<unknown>, success: string, after?: () => void) => void;
}) {
  const [password, setPassword] = useState("");
  function closeAndClear() {
    setPassword("");
    onClose();
  }
  return (
    <Modal
      open={Boolean(user)}
      onClose={closeAndClear}
      title="Change password"
      subtitle={user ? `Set a new password for ${user.name}.` : undefined}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!user) return;
          run(
            () => resetTeamUserPassword(user.id, password),
            `${user.name}'s password was changed.`,
            closeAndClear
          );
        }}
      >
        <div>
          <Label>New password</Label>
          <Input
            required
            type="password"
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <PasswordRequirementsChecklist password={password} />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={closeAndClear} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || !passwordMeetsPolicy(password)}>
            {pending ? "Saving…" : "Change password"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ProfilePictureModal({
  user,
  pending,
  onClose,
  run,
}: {
  user: TeamUser | null;
  pending: boolean;
  onClose: () => void;
  run: (action: () => Promise<unknown>, success: string, after?: () => void) => void;
}) {
  return (
    <Modal
      open={Boolean(user)}
      onClose={onClose}
      title={user?.avatar_url ? "Edit profile picture" : "Add profile picture"}
      subtitle={user ? `Update the picture shown for ${user.name}.` : undefined}
    >
      {user && (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            run(
              () => setTeamUserProfilePicture(user.id, formData),
              `${user.name}'s profile picture was updated.`,
              onClose
            );
          }}
        >
          <div className="flex items-center gap-3 rounded-lg border border-[var(--border-light)] bg-[var(--bg)] p-3">
            <ProfileAvatar user={user} />
            <p className="text-xs text-[var(--text-muted)]">
              Choose a clear square image for the team directory.
            </p>
          </div>
          <div>
            <Label>New profile picture</Label>
            <Input
              name="profilePicture"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/heic"
              required={!user.avatar_url}
            />
            <p className="mt-1 text-xs text-[var(--text-muted)]">Max 5 MB.</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {user.avatar_url && (
              <Button
                type="button"
                variant="danger"
                disabled={pending}
                onClick={() => {
                  const formData = new FormData();
                  formData.set("remove", "true");
                  run(
                    () => setTeamUserProfilePicture(user.id, formData),
                    `${user.name}'s profile picture was removed.`,
                    onClose
                  );
                }}
              >
                Remove picture
              </Button>
            )}
            <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save picture"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function RoleEditorModal({
  role,
  pending,
  onClose,
  run,
}: {
  role: TeamRole | "new" | null;
  pending: boolean;
  onClose: () => void;
  run: (action: () => Promise<unknown>, success: string, after?: () => void) => void;
}) {
  if (!role) {
    return (
      <Modal open={false} onClose={onClose} title="Role">
        <span />
      </Modal>
    );
  }

  return (
    <RoleEditorContent
      key={role === "new" ? "new" : `${role.id}:${(role.assignment_pools ?? []).join(",")}`}
      role={role}
      pending={pending}
      onClose={onClose}
      run={run}
    />
  );
}

function RoleEditorContent({
  role,
  pending,
  onClose,
  run,
}: {
  role: TeamRole | "new";
  pending: boolean;
  onClose: () => void;
  run: (action: () => Promise<unknown>, success: string, after?: () => void) => void;
}) {
  const current = role !== "new" ? role : null;
  const [pools, setPools] = useState<AssignmentPoolKey[]>(() => current?.assignment_pools ?? []);

  function togglePool(key: AssignmentPoolKey, checked: boolean) {
    setPools((prev) => {
      if (checked) return prev.includes(key) ? prev : [...prev, key];
      return prev.filter((p) => p !== key);
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={current ? "Edit role" : "Create role"}
      subtitle={current?.is_system ? `System slug: ${current.slug}` : undefined}
      size="lg"
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          const effectiveName = String(formData.get("name") ?? "");
          const effectiveDescription = String(formData.get("description") ?? "");
          run(
            () =>
              upsertTeamRole({
                id: current?.id,
                name: effectiveName,
                description: effectiveDescription || null,
                assignment_pools: pools,
              }),
            current ? `${effectiveName} was updated.` : `${effectiveName} was created.`,
            onClose
          );
        }}
      >
        <div>
          <Label>Name</Label>
          <Input name="name" required defaultValue={current?.name ?? ""} />
        </div>
        <div>
          <Label>Description</Label>
          <Textarea
            name="description"
            maxLength={500}
            defaultValue={current?.description ?? ""}
          />
        </div>
        <fieldset className="space-y-2 rounded-xl border border-[var(--border)] p-3">
          <legend className="px-1 text-sm font-semibold text-[var(--text-dark)]">
            Shows in assignment lists
          </legend>
          <p className="text-xs text-[var(--text-muted)]">
            Users on this role appear in the selected pickers (Schedule visit surveyor, Installation
            crew, etc.).
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {ASSIGNMENT_POOLS.map((pool) => (
              <label
                key={pool.key}
                className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--border)] p-2.5"
              >
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={pools.includes(pool.key)}
                  onChange={(event) => togglePool(pool.key, event.target.checked)}
                />
                <span>
                  <span className="block text-sm font-medium text-[var(--text-dark)]">
                    {pool.label}
                  </span>
                  <span className="block text-xs text-[var(--text-muted)]">{pool.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save role"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function AssignmentPoolsMatrixModal({
  open,
  roles,
  isPrivileged,
  currentUserRoleId,
  pending,
  onClose,
  run,
}: {
  open: boolean;
  roles: TeamRole[];
  isPrivileged: boolean;
  currentUserRoleId: string | null;
  pending: boolean;
  onClose: () => void;
  run: (action: () => Promise<unknown>, success: string, after?: () => void) => void;
}) {
  const [draft, setDraft] = useState<Record<string, AssignmentPoolKey[]>>({});

  useEffect(() => {
    if (!open) return;
    const next: Record<string, AssignmentPoolKey[]> = {};
    for (const role of roles) {
      next[role.id] = [...(role.assignment_pools ?? [])];
    }
    setDraft(next);
  }, [open, roles]);

  function toggle(roleId: string, pool: AssignmentPoolKey, checked: boolean) {
    setDraft((prev) => {
      const current = prev[roleId] ?? [];
      const next = checked
        ? current.includes(pool)
          ? current
          : [...current, pool]
        : current.filter((p) => p !== pool);
      return { ...prev, [roleId]: next };
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Assignment pools"
      subtitle="Choose which roles appear in each staff assignment picker."
      size="xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={() => {
              const updates = roles.map((role) => ({
                roleId: role.id,
                pools: draft[role.id] ?? [],
              }));
              run(
                () => updateTeamRoleAssignmentPoolsBatch(updates),
                "Assignment pools were updated.",
                onClose
              );
            }}
          >
            {pending ? "Saving…" : "Save pools"}
          </Button>
        </div>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-xs text-[var(--text-muted)]">
              <th className="sticky left-0 bg-white py-2 pr-3 font-medium">Role</th>
              {ASSIGNMENT_POOLS.map((pool) => (
                <th key={pool.key} className="px-2 py-2 font-medium" title={pool.hint}>
                  {pool.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => {
              const locked =
                !isPrivileged &&
                (isPrivilegedRole(role) || role.id === currentUserRoleId);
              const pools = draft[role.id] ?? [];
              return (
                <tr key={role.id} className="border-b border-[var(--border)]">
                  <td className="sticky left-0 bg-white py-2.5 pr-3 font-medium text-[var(--text-dark)]">
                    {role.name}
                    {role.is_system ? (
                      <span className="ml-1 text-[10px] font-normal text-[var(--text-muted)]">
                        system
                      </span>
                    ) : null}
                  </td>
                  {ASSIGNMENT_POOLS.map((pool) => (
                    <td key={pool.key} className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        disabled={pending || locked}
                        checked={pools.includes(pool.key)}
                        onChange={(event) => toggle(role.id, pool.key, event.target.checked)}
                        aria-label={`${role.name} in ${pool.label}`}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

function UserPermissionsModal({
  user,
  data,
  pending,
  onClose,
  run,
}: {
  user: TeamUser | null;
  data: TeamAccessData;
  pending: boolean;
  onClose: () => void;
  run: (action: () => Promise<unknown>, success: string, after?: () => void) => void;
}) {
  return user ? (
    <UserPermissionsContent
      user={user}
      data={data}
      pending={pending}
      onClose={onClose}
      run={run}
    />
  ) : (
    <Modal open={false} onClose={onClose} title="User permissions">
      <span />
    </Modal>
  );
}

function UserPermissionsContent({
  user,
  data,
  pending,
  onClose,
  run,
}: {
  user: TeamUser;
  data: TeamAccessData;
  pending: boolean;
  onClose: () => void;
  run: (action: () => Promise<unknown>, success: string, after?: () => void) => void;
}) {
  const role = data.roles.find((r) => r.id === user.role_id) ?? null;
  const roleKeys = useMemo(() => new Set(role?.authority_keys ?? []), [role]);
  const [selected, setSelected] = useState(
    () => new Set((user.extra_authority_keys ?? []).filter((key) => !roleKeys.has(key)))
  );
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const formId = `user-permissions-${user.id}`;

  const sections = useMemo(
    () => getAuthorityUiSections(data.authorities),
    [data.authorities]
  );

  const normalizedQuery = query.trim().toLowerCase();
  const filtering = normalizedQuery.length > 0;
  const dealerBlocked = useMemo(() => {
    if (user.role !== "dealer") return new Set<string>();
    return new Set([
      "view_all_leads",
      "view_all_quotations",
      "full_access",
      "manage_quotations",
    ]);
  }, [user.role]);

  const visibleSections = useMemo(() => {
    if (!filtering) return sections;
    return sections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => matchesAuthoritySearch(item, normalizedQuery)),
      }))
      .filter((section) => section.items.length > 0);
  }, [sections, filtering, normalizedQuery]);

  const extraCount = selected.size;
  const hasFullAccessExtra = selected.has("full_access");
  const roleHasFullAccess = roleKeys.has("full_access");

  function toggleKey(key: string, checked: boolean) {
    if (roleKeys.has(key) || dealerBlocked.has(key)) return;
    if (key === "full_access" && checked && !data.is_privileged) return;
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function isSectionOpen(sectionId: string) {
    if (filtering) return true;
    return !collapsed[sectionId];
  }

  function toggleSection(sectionId: string) {
    if (filtering) return;
    setCollapsed((current) => ({ ...current, [sectionId]: !current[sectionId] }));
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Extra permissions — ${user.name}`}
      subtitle={`Role: ${role?.name ?? roleLabel(user)}. Check only the extras for this person — the role stays unchanged for everyone else.`}
      size="xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[var(--text-muted)]">
            {extraCount} extra{extraCount === 1 ? "" : "s"} · {roleKeys.size} from role
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" form={formId} disabled={pending}>
              {pending ? "Saving…" : "Save extras"}
            </Button>
          </div>
        </div>
      }
    >
      <form
        id={formId}
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          run(
            () => updateTeamUserAuthorities(user.id, [...selected]),
            `Extra permissions saved for ${user.name}.`,
            onClose
          );
        }}
      >
        <div className="sticky top-0 z-10 -mx-1 space-y-3 bg-white px-1 pb-3">
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search permissions…"
            aria-label="Search permissions"
          />
          <p className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--text-muted)]">
            Grey rows with “From role” are already included by{" "}
            <span className="font-medium text-[var(--text-dark)]">
              {role?.name ?? "their role"}
            </span>
            . Tick additional boxes for this user only.
          </p>
          {(hasFullAccessExtra || roleHasFullAccess) && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Full Access bypasses every other permission at runtime.
            </p>
          )}
          {user.role === "dealer" && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Dealers cannot receive company-wide lead/quote keys (view all / full access).
            </p>
          )}
        </div>

        {visibleSections.length === 0 ? (
          <p className="rounded-lg border border-[var(--border)] px-3 py-6 text-center text-sm text-[var(--text-muted)]">
            No permissions match “{query.trim()}”.
          </p>
        ) : (
          <div className="space-y-3">
            {visibleSections.map((section) => {
              const open = isSectionOpen(section.id);
              const sectionExtras = section.items.filter((item) => selected.has(item.key)).length;
              return (
                <section
                  key={section.id}
                  className="overflow-hidden rounded-xl border border-[var(--border)]"
                >
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-left"
                    onClick={() => toggleSection(section.id)}
                    aria-expanded={open}
                  >
                    <span>
                      <span className="block text-sm font-semibold text-[var(--text-dark)]">
                        {section.title}
                        <span className="ml-2 font-normal text-[var(--text-muted)]">
                          {sectionExtras} extra
                          {sectionExtras === 1 ? "" : "s"}
                        </span>
                      </span>
                      <span className="block text-xs text-[var(--text-muted)]">{section.hint}</span>
                    </span>
                  </button>
                  {open && (
                    <div className="grid gap-2 p-3 sm:grid-cols-2">
                      {section.items.map((item) => {
                        const fromRole = roleKeys.has(item.key);
                        const blocked = dealerBlocked.has(item.key);
                        const locked =
                          fromRole ||
                          blocked ||
                          (item.key === "full_access" && !data.is_privileged && !selected.has(item.key));
                        const checked = fromRole || selected.has(item.key);
                        return (
                          <label
                            key={item.key}
                            className={`flex items-start gap-2 rounded-lg border p-3 transition ${
                              fromRole
                                ? "cursor-default border-[var(--border)] bg-[var(--bg)] opacity-80"
                                : blocked
                                  ? "cursor-not-allowed border-[var(--border)] opacity-50"
                                  : "cursor-pointer border-[var(--border)]"
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              checked={checked}
                              disabled={locked || pending}
                              onChange={(event) => toggleKey(item.key, event.target.checked)}
                            />
                            <span>
                              <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-[var(--text-dark)]">
                                {item.label}
                                {fromRole && (
                                  <span className="rounded bg-[var(--border)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                                    From role
                                  </span>
                                )}
                                {!fromRole && selected.has(item.key) && (
                                  <span className="rounded bg-[var(--primary-faint)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--primary)]">
                                    Extra
                                  </span>
                                )}
                              </span>
                              {item.description && (
                                <span className="block text-xs text-[var(--text-muted)]">
                                  {item.description}
                                </span>
                              )}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </form>
    </Modal>
  );
}

function AuthorityEditorModal({
  role,
  data,
  pending,
  onClose,
  run,
}: {
  role: TeamRole | null;
  data: TeamAccessData;
  pending: boolean;
  onClose: () => void;
  run: (action: () => Promise<unknown>, success: string, after?: () => void) => void;
}) {
  return role ? (
    <AuthorityEditorContent
      key={`${role.id}:${role.authority_keys.join(",")}`}
      role={role}
      data={data}
      pending={pending}
      onClose={onClose}
      run={run}
    />
  ) : (
    <Modal open={false} onClose={onClose} title="Authorities">
      <span />
    </Modal>
  );
}

function AuthorityEditorContent({
  role,
  data,
  pending,
  onClose,
  run,
}: {
  role: TeamRole;
  data: TeamAccessData;
  pending: boolean;
  onClose: () => void;
  run: (action: () => Promise<unknown>, success: string, after?: () => void) => void;
}) {
  const [selected, setSelected] = useState(() => new Set(role.authority_keys));
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const formId = `role-permissions-${role.id}`;

  const sections = useMemo(
    () => getAuthorityUiSections(data.authorities),
    [data.authorities]
  );

  const normalizedQuery = query.trim().toLowerCase();
  const filtering = normalizedQuery.length > 0;

  const visibleSections = useMemo(() => {
    if (!filtering) return sections;
    return sections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => matchesAuthoritySearch(item, normalizedQuery)),
      }))
      .filter((section) => section.items.length > 0);
  }, [sections, filtering, normalizedQuery]);

  const catalogCount = AUTHORITY_KEYS.length;
  const selectedCount = selected.size;
  const hasFullAccess = selected.has("full_access");

  function toggleKey(key: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function setSectionKeys(section: AuthorityUiSection, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const item of section.items) {
        if (checked) next.add(item.key);
        else next.delete(item.key);
      }
      return next;
    });
  }

  function clearAll() {
    if (
      !window.confirm(
        `Clear all ${selectedCount} permission${selectedCount === 1 ? "" : "s"} for ${role.name}?`
      )
    ) {
      return;
    }
    setSelected(new Set());
  }

  function isSectionOpen(sectionId: string) {
    if (filtering) return true;
    return !collapsed[sectionId];
  }

  function toggleSection(sectionId: string) {
    if (filtering) return;
    setCollapsed((current) => ({ ...current, [sectionId]: !current[sectionId] }));
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${role.name} permissions`}
      subtitle="Grouped by page and action. These grants apply to every user on this role. For 2–3 extras on one person, use Users → Permissions instead."
      size="xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[var(--text-muted)]">
            {selectedCount} of {catalogCount} selected
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" form={formId} disabled={pending}>
              {pending ? "Saving…" : "Save permissions"}
            </Button>
          </div>
        </div>
      }
    >
      <form
        id={formId}
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          run(
            () => updateTeamRoleAuthorities(role.id, [...selected]),
            `${role.name} permissions were updated.`,
            onClose
          );
        }}
      >
        <div className="sticky top-0 z-10 -mx-1 space-y-3 bg-white px-1 pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search permissions (delete, meter, quote…)"
              aria-label="Search permissions"
              className="sm:flex-1"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={pending || selectedCount === 0}
              onClick={clearAll}
            >
              Clear all
            </Button>
          </div>
          {hasFullAccess && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Full Access is on — this role bypasses every other permission at runtime. Other
              checkboxes are still saved for when Full Access is turned off.
            </p>
          )}
        </div>

        {visibleSections.length === 0 ? (
          <p className="rounded-lg border border-[var(--border)] px-3 py-6 text-center text-sm text-[var(--text-muted)]">
            No permissions match “{query.trim()}”.
          </p>
        ) : (
          <div className="space-y-3">
            {visibleSections.map((section) => {
              const open = isSectionOpen(section.id);
              const sectionSelected = section.items.filter((item) => selected.has(item.key)).length;
              const allSelected =
                section.items.length > 0 && sectionSelected === section.items.length;
              const isGeneral = section.id === "general";

              return (
                <section
                  key={section.id}
                  className="overflow-hidden rounded-xl border border-[var(--border)]"
                >
                  <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--bg)] px-3 py-2.5">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => toggleSection(section.id)}
                      aria-expanded={open}
                    >
                      <span className="block text-sm font-semibold text-[var(--text-dark)]">
                        {section.title}
                        <span className="ml-2 font-normal text-[var(--text-muted)]">
                          {sectionSelected}/{section.items.length}
                        </span>
                      </span>
                      <span className="block text-xs text-[var(--text-muted)]">{section.hint}</span>
                    </button>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={pending || allSelected}
                        onClick={() => setSectionKeys(section, true)}
                      >
                        Select all
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={pending || sectionSelected === 0}
                        onClick={() => setSectionKeys(section, false)}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                  {open && (
                    <div className="space-y-2 p-3">
                      {section.note && (
                        <p className="text-xs text-[var(--text-muted)]">{section.note}</p>
                      )}
                      <div className="grid gap-2 sm:grid-cols-2">
                        {section.items.map((item) => {
                          const isFullAccessItem = item.key === "full_access";
                          const dimmed = hasFullAccess && !isFullAccessItem;
                          return (
                            <label
                              key={item.key}
                              className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 transition ${
                                isFullAccessItem
                                  ? "border-amber-200 bg-amber-50/60"
                                  : "border-[var(--border)]"
                              } ${dimmed ? "opacity-55" : ""}`}
                            >
                              <input
                                type="checkbox"
                                className="mt-0.5"
                                checked={selected.has(item.key)}
                                onChange={(event) => toggleKey(item.key, event.target.checked)}
                              />
                              <span>
                                <span className="block text-sm font-medium text-[var(--text-dark)]">
                                  {item.label}
                                </span>
                                {item.description && (
                                  <span className="block text-xs text-[var(--text-muted)]">
                                    {item.description}
                                  </span>
                                )}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      {isGeneral && !filtering && (
                        <p className="text-xs text-[var(--text-muted)]">
                          Pipeline and Customers pages stay available to signed-in staff; use
                          “View all leads & customers” for company-wide lists.
                        </p>
                      )}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </form>
    </Modal>
  );
}

function matchesAuthoritySearch(item: AuthorityUiItem, query: string) {
  return (
    item.key.toLowerCase().includes(query) ||
    item.label.toLowerCase().includes(query) ||
    item.description.toLowerCase().includes(query)
  );
}
