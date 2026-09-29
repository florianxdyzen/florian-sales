"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  assignTeamUserRole,
  createTeamUser,
  deleteTeamRole,
  resetTeamUserPassword,
  setTeamUserActive,
  setTeamUserProfilePicture,
  updateTeamRoleAuthorities,
  upsertTeamRole,
} from "@/actions/team";
import { PasswordRequirementsChecklist } from "@/components/admin/password-requirements-checklist";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/layout/page-header";
import { ROLE_LABELS } from "@/lib/brand";
import { passwordMeetsPolicy } from "@/lib/password-policy";
import type { TeamAccessData, TeamRole, TeamUser } from "@/lib/domain/team";
import { AUTHORITY_GROUPS } from "@/lib/domain/authorities";

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
  const [roleEditor, setRoleEditor] = useState<TeamRole | "new" | null>(null);
  const [authorityRole, setAuthorityRole] = useState<TeamRole | null>(null);

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
          run={run}
        />
      )}
      {tab === "roles" && data.can_manage_roles && (
        <RolesTab
          data={data}
          pending={pending}
          onEdit={setRoleEditor}
          onAuthorities={setAuthorityRole}
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
  run,
}: {
  data: TeamAccessData;
  pending: boolean;
  onCreate: () => void;
  onResetPassword: (user: TeamUser) => void;
  onEditProfilePicture: (user: TeamUser) => void;
  run: (action: () => Promise<unknown>, success: string, after?: () => void) => void;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-dark)]">Company users</h2>
          <p className="text-xs text-[var(--text-muted)]">{data.users.length} accounts</p>
        </div>
        <Button type="button" size="sm" onClick={onCreate}>
          Add user
        </Button>
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
            {data.users.map((user) => {
              const currentRole = data.roles.find((role) => role.id === user.role_id);
              const targetPrivileged =
                user.role === "admin" || Boolean(currentRole && isPrivilegedRole(currentRole));
              const protectedTarget = targetPrivileged && !data.is_privileged;
              const isSelf = user.id === data.current_user_id;
              return (
                <tr key={user.id} className="border-b border-[var(--border-light)] align-top">
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
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RolesTab({
  data,
  pending,
  onEdit,
  onAuthorities,
  run,
}: {
  data: TeamAccessData;
  pending: boolean;
  onEdit: (role: TeamRole | "new") => void;
  onAuthorities: (role: TeamRole) => void;
  run: (action: () => Promise<unknown>, success: string, after?: () => void) => void;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-dark)]">Company roles</h2>
          <p className="text-xs text-[var(--text-muted)]">
            System role slugs are fixed; their authorities remain configurable.
          </p>
        </div>
        <Button type="button" size="sm" onClick={() => onEdit("new")}>
          Add role
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {data.roles.map((role) => {
          const protectedRole =
            !data.is_privileged &&
            (isPrivilegedRole(role) || role.id === data.users.find((u) => u.id === data.current_user_id)?.role_id);
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
                    {role.user_count} users · {role.authority_keys.length} authorities · {role.slug}
                  </p>
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
                  Authorities
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
  const current = role && role !== "new" ? role : null;

  return (
    <Modal
      open={Boolean(role)}
      onClose={onClose}
      title={current ? "Edit role" : "Create role"}
      subtitle={current?.is_system ? `System slug: ${current.slug}` : undefined}
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
              }),
            current ? `${effectiveName} was updated.` : `${effectiveName} was created.`,
            onClose
          );
        }}
      >
        <div>
          <Label>Name</Label>
          <Input
            name="name"
            required
            defaultValue={current?.name ?? ""}
          />
        </div>
        <div>
          <Label>Description</Label>
          <Textarea
            name="description"
            maxLength={500}
            defaultValue={current?.description ?? ""}
          />
        </div>
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
  const groups = useMemo(() => {
    const grouped = new Map<string, typeof data.authorities>();
    for (const authority of data.authorities) {
      const list = grouped.get(authority.authority_group) ?? [];
      list.push(authority);
      grouped.set(authority.authority_group, list);
    }
    const order = [
      "general",
      "sales",
      "accounts",
      "documentation",
      "installation",
    ];
    return [...grouped.entries()].sort(([a], [b]) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });
  }, [data]);

  return (
    <Modal
      open
      onClose={onClose}
      title={`${role.name} authorities`}
      subtitle="Grants take effect for every user assigned to this role."
      size="lg"
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          run(
            () => updateTeamRoleAuthorities(role.id, [...selected]),
            `${role.name} authorities were updated.`,
            onClose
          );
        }}
      >
        {groups.map(([group, authorities]) => (
          <fieldset key={group}>
            <legend className="mb-2 text-sm font-semibold text-[var(--text-dark)]">
              {AUTHORITY_GROUPS[group as keyof typeof AUTHORITY_GROUPS] ??
                group.replaceAll("_", " ")}
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {authorities.map((authority) => (
                <label
                  key={authority.key}
                  className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--border)] p-3"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={selected.has(authority.key)}
                    onChange={(event) => {
                      setSelected((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(authority.key);
                        else next.delete(authority.key);
                        return next;
                      });
                    }}
                  />
                  <span>
                    <span className="block text-sm font-medium text-[var(--text-dark)]">
                      {authority.label}
                    </span>
                    {authority.description && (
                      <span className="block text-xs text-[var(--text-muted)]">
                        {authority.description}
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save authorities"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
