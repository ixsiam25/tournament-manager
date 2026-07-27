"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Team = { id: string; name: string };

export function ManagerLoginForm({ teams }: { teams: Team[] }) {
  const router = useRouter();
  const [teamId, setTeamId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/manager/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Login failed");
        return;
      }
      router.push("/manager");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 shadow-sm"
      >
        <h1 className="text-xl font-extrabold">Manager Login</h1>
        <p className="mt-1 text-sm text-muted">Pick your team and enter the team password.</p>

        <label className="mt-6 block text-sm font-medium">Team</label>
        <select
          required
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-line bg-background px-3.5 py-2.5 outline-none focus:border-pitch"
        >
          <option value="" disabled>
            Select your team…
          </option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        <label className="mt-4 block text-sm font-medium">Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-line bg-background px-3.5 py-2.5 outline-none focus:border-pitch"
        />

        {error && <p className="mt-3 text-sm text-live">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="mt-6 w-full rounded-full bg-pitch px-6 py-3 text-sm font-bold text-white shadow-sm disabled:opacity-60"
        >
          {submitting ? "Logging in…" : "Log in"}
        </button>
      </form>
    </div>
  );
}
