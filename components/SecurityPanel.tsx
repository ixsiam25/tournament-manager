"use client";

import { useState } from "react";
import { usePasswordConfirm } from "@/components/PasswordConfirm";

type Team = { id: string; name: string; hasManagerPassword: boolean; blocked: boolean };

export function SecurityPanel({ teams: initialTeams }: { teams: Team[] }) {
  const [teams, setTeams] = useState(initialTeams);
  const { confirmWithPassword, modal } = usePasswordConfirm();

  const [adminPassword, setAdminPassword] = useState("");
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminMessage, setAdminMessage] = useState<string | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);

  const [teamPasswords, setTeamPasswords] = useState<Record<string, string>>({});
  const [savingTeamId, setSavingTeamId] = useState<string | null>(null);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [teamMessage, setTeamMessage] = useState<string | null>(null);

  async function handleAdminPasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setAdminError(null);
    setAdminMessage(null);
    if (adminPassword.length < 6) {
      setAdminError("Password must be at least 6 characters");
      return;
    }
    const confirmed = await confirmWithPassword("Change the admin password?");
    if (!confirmed) return;

    setAdminSaving(true);
    const res = await fetch("/api/admin/security/admin-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: adminPassword }),
    });
    setAdminSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setAdminError(body.error ?? "Failed to change password");
      return;
    }
    setAdminPassword("");
    setAdminMessage("Admin password changed.");
  }

  async function handleSetTeamPassword(teamId: string) {
    const password = teamPasswords[teamId] ?? "";
    setTeamError(null);
    setTeamMessage(null);
    if (password.length < 6) {
      setTeamError("Password must be at least 6 characters");
      return;
    }
    const confirmed = await confirmWithPassword("Set this team's manager password?");
    if (!confirmed) return;

    setSavingTeamId(teamId);
    const res = await fetch("/api/admin/security/team-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId, password }),
    });
    setSavingTeamId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setTeamError(body.error ?? "Failed to set password");
      return;
    }
    setTeams((prev) => prev.map((t) => (t.id === teamId ? { ...t, hasManagerPassword: true } : t)));
    setTeamPasswords((prev) => ({ ...prev, [teamId]: "" }));
    setTeamMessage("Password set.");
  }

  async function handleClearTeamPassword(teamId: string) {
    const confirmed = await confirmWithPassword("Remove this team's manager login?");
    if (!confirmed) return;

    setSavingTeamId(teamId);
    const res = await fetch("/api/admin/security/team-password", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId }),
    });
    setSavingTeamId(null);
    if (res.ok) {
      setTeams((prev) =>
        prev.map((t) => (t.id === teamId ? { ...t, hasManagerPassword: false } : t)),
      );
    }
  }

  async function handleToggleBlock(teamId: string, nextBlocked: boolean) {
    const confirmed = await confirmWithPassword(
      nextBlocked ? "Block this team's manager login?" : "Unblock this team's manager login?",
    );
    if (!confirmed) return;

    setSavingTeamId(teamId);
    const res = await fetch("/api/admin/security/team-block", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId, blocked: nextBlocked }),
    });
    setSavingTeamId(null);
    if (res.ok) {
      setTeams((prev) => prev.map((t) => (t.id === teamId ? { ...t, blocked: nextBlocked } : t)));
    }
  }

  return (
    <div>
      {modal}
      <h1 className="mb-6 heading-display text-2xl">Security</h1>

      <section className="mb-8 rounded-block-lg border-2 border-line-strong bg-surface p-6 shadow-block">
        <h2 className="mb-1 font-black uppercase tracking-wide">Admin password</h2>
        <p className="mb-4 text-sm text-muted">Used to log into this admin console.</p>
        <form onSubmit={handleAdminPasswordChange} className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <label className="mb-1 block text-sm font-medium">New password</label>
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              className="w-full rounded-block border-2 border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
            />
          </div>
          <button
            type="submit"
            disabled={adminSaving}
            className="rounded-block bg-pitch px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
          >
            {adminSaving ? "Saving…" : "Change password"}
          </button>
        </form>
        {adminError && <p className="mt-3 text-sm text-live">{adminError}</p>}
        {adminMessage && <p className="mt-3 text-sm text-pitch-dark">{adminMessage}</p>}
      </section>

      <section className="rounded-block-lg border-2 border-line-strong bg-surface p-6 shadow-block">
        <h2 className="mb-1 font-black uppercase tracking-wide">Team manager logins</h2>
        <p className="mb-4 text-sm text-muted">
          Set a password for a team so its manager/captain can log in at{" "}
          <code className="rounded bg-background px-1 py-0.5">/manager/login</code> and upload
          player photos. Blocking keeps the password saved but stops them logging in until
          unblocked.
        </p>
        {teamError && <p className="mb-3 text-sm text-live">{teamError}</p>}
        {teamMessage && <p className="mb-3 text-sm text-pitch-dark">{teamMessage}</p>}
        <ul className="divide-y-2 divide-line">
          {teams.map((t) => (
            <li key={t.id} className="space-y-2.5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{t.name}</span>
                <span
                  className={
                    "rounded-block px-2 py-0.5 text-xs font-bold uppercase tracking-wide " +
                    (t.hasManagerPassword ? "bg-pitch/10 text-pitch-dark" : "bg-line text-muted")
                  }
                >
                  {t.hasManagerPassword ? "Login set" : "No login"}
                </span>
                {t.blocked && (
                  <span className="rounded-block bg-live/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-live">
                    Blocked
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="password"
                  placeholder="New password"
                  value={teamPasswords[t.id] ?? ""}
                  onChange={(e) => setTeamPasswords((prev) => ({ ...prev, [t.id]: e.target.value }))}
                  className="w-44 rounded-block border-2 border-line bg-background px-3 py-1.5 text-sm outline-none focus:border-pitch"
                />
                <button
                  onClick={() => handleSetTeamPassword(t.id)}
                  disabled={savingTeamId === t.id}
                  className="rounded-block bg-pitch px-4 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                >
                  {t.hasManagerPassword ? "Change" : "Set"}
                </button>
                {t.hasManagerPassword && (
                  <>
                    <button
                      onClick={() => handleToggleBlock(t.id, !t.blocked)}
                      disabled={savingTeamId === t.id}
                      className={
                        "rounded-block border-2 px-4 py-1.5 text-xs font-bold disabled:opacity-40 " +
                        (t.blocked
                          ? "border-pitch text-pitch-dark"
                          : "border-live text-live")
                      }
                    >
                      {t.blocked ? "Unblock" : "Block"}
                    </button>
                    <button
                      onClick={() => handleClearTeamPassword(t.id)}
                      disabled={savingTeamId === t.id}
                      className="rounded-block border-2 border-line px-4 py-1.5 text-xs font-medium text-muted disabled:opacity-40"
                    >
                      Clear
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
