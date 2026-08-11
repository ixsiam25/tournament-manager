"use client";

import { useEffect, useState } from "react";
import { usePasswordConfirm } from "@/components/PasswordConfirm";

type Role = "ADMIN" | "SCORER";
type User = { id: string; name: string; username: string; role: Role; isActive: boolean; createdAt: string };

/**
 * Manages ADMIN/SCORER (staff) accounts. Team OWNER accounts stay on
 * /admin/security, alongside the rest of that team's settings — see
 * `app/api/admin/users/route.ts` for why this page only ever touches
 * ADMIN/SCORER.
 */
export function UsersPanel() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("SCORER");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resetPasswords, setResetPasswords] = useState<Record<string, string>>({});
  const { confirmWithPassword, modal } = usePasswordConfirm();

  async function load() {
    const res = await fetch("/api/admin/users");
    const body = await res.json();
    setUsers(body.users ?? []);
    setLoading(false);
  }

  useEffect(() => {
    let ignore = false;
    (async () => {
      const res = await fetch("/api/admin/users");
      const body = await res.json();
      if (!ignore) {
        setUsers(body.users ?? []);
        setLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, username, password, role }),
    });
    setCreating(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to create account");
      return;
    }
    setName("");
    setUsername("");
    setPassword("");
    setRole("SCORER");
    load();
  }

  async function patchUser(id: string, patch: Partial<{ role: Role; isActive: boolean; password: string }>) {
    setBusyId(id);
    setError(null);
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setBusyId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to update account");
      return;
    }
    load();
  }

  async function handleToggleActive(u: User) {
    const confirmed = await confirmWithPassword(
      u.isActive ? `Deactivate ${u.username}?` : `Reactivate ${u.username}?`,
    );
    if (!confirmed) return;
    patchUser(u.id, { isActive: !u.isActive });
  }

  async function handleResetPassword(u: User) {
    const newPassword = resetPasswords[u.id];
    if (!newPassword || newPassword.length < 6) {
      setError("New password must be at least 6 characters");
      return;
    }
    const confirmed = await confirmWithPassword(`Reset the password for ${u.username}?`);
    if (!confirmed) return;
    await patchUser(u.id, { password: newPassword });
    setResetPasswords((prev) => ({ ...prev, [u.id]: "" }));
  }

  return (
    <div>
      {modal}
      <h1 className="mb-6 heading-display text-2xl">Users</h1>

      <section className="mb-8 rounded-2xl border border-line bg-surface p-6">
        <h2 className="mb-1 font-bold">New account</h2>
        <p className="mb-4 text-sm text-muted">
          ADMIN can reach every page. SCORER can only start/finish matches and log events via the
          live console.
        </p>
        <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-40 rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Username</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoCapitalize="none"
              className="w-36 rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-36 rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Role</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
            >
              <option value="SCORER">Scorer</option>
              <option value="ADMIN">Admin</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={creating}
            className="rounded-full bg-pitch px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
          >
            {creating ? "Creating…" : "Create account"}
          </button>
        </form>
        {error && <p className="mt-3 text-sm text-live">{error}</p>}
      </section>

      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {users.map((u) => (
            <li key={u.id} className="space-y-2.5 px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{u.name}</span>
                <span className="text-sm text-muted">@{u.username}</span>
                <span className="rounded-full bg-line px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-muted">
                  {u.role}
                </span>
                {!u.isActive && (
                  <span className="rounded-full bg-live/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-live">
                    Deactivated
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={u.role}
                  onChange={(e) => patchUser(u.id, { role: e.target.value as Role })}
                  disabled={busyId === u.id}
                  className="rounded-lg border border-line bg-background px-2 py-1.5 text-xs outline-none focus:border-pitch"
                >
                  <option value="SCORER">Scorer</option>
                  <option value="ADMIN">Admin</option>
                </select>
                <button
                  onClick={() => handleToggleActive(u)}
                  disabled={busyId === u.id}
                  className={
                    "rounded-full border px-3 py-1.5 text-xs font-bold disabled:opacity-40 " +
                    (u.isActive ? "border-live text-live" : "border-pitch text-pitch-dark")
                  }
                >
                  {u.isActive ? "Deactivate" : "Reactivate"}
                </button>
                <input
                  type="password"
                  placeholder="New password"
                  value={resetPasswords[u.id] ?? ""}
                  onChange={(e) => setResetPasswords((prev) => ({ ...prev, [u.id]: e.target.value }))}
                  className="w-36 rounded-lg border border-line bg-background px-2 py-1.5 text-xs outline-none focus:border-pitch"
                />
                <button
                  onClick={() => handleResetPassword(u)}
                  disabled={busyId === u.id}
                  className="rounded-full border border-line px-3 py-1.5 text-xs font-medium disabled:opacity-40"
                >
                  Reset password
                </button>
              </div>
            </li>
          ))}
          {users.length === 0 && <li className="px-5 py-6 text-center text-muted">No accounts yet.</li>}
        </ul>
      )}
    </div>
  );
}
