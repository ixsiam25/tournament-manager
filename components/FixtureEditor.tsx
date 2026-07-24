"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePasswordConfirm } from "@/components/PasswordConfirm";

type Team = { id: string; name: string };
type Match = {
  id: string;
  round: "LEAGUE" | "SEMIFINAL" | "FINAL";
  label: string | null;
  status: "SCHEDULED" | "LIVE" | "FINISHED";
  homeTeamId: string | null;
  awayTeamId: string | null;
  scheduledAt: string | null;
  venue: string | null;
};

export function FixtureEditor({ matchId }: { matchId: string }) {
  const router = useRouter();
  const [match, setMatch] = useState<Match | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { confirmWithPassword, modal } = usePasswordConfirm();

  async function load() {
    const [matchRes, teamsRes] = await Promise.all([
      fetch(`/api/admin/fixtures/${matchId}`),
      fetch("/api/admin/teams"),
    ]);
    const matchBody = await matchRes.json();
    setMatch(matchBody.match ?? null);
    setTeams((await teamsRes.json()).teams ?? []);
  }

  useEffect(() => {
    let ignore = false;
    (async () => {
      const [matchRes, teamsRes] = await Promise.all([
        fetch(`/api/admin/fixtures/${matchId}`),
        fetch("/api/admin/teams"),
      ]);
      const matchBody = await matchRes.json();
      const teamsBody = await teamsRes.json();
      if (!ignore) {
        setMatch(matchBody.match ?? null);
        setTeams(teamsBody.teams ?? []);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [matchId]);

  if (!match) return <p className="text-muted">Loading…</p>;

  async function save(patch: Partial<Match>) {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/admin/fixtures/${matchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to save");
      return;
    }
    load();
  }

  async function handleStart() {
    setError(null);
    const res = await fetch(`/api/admin/fixtures/${matchId}/start`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to start match");
      return;
    }
    router.push(`/admin/live/${matchId}`);
  }

  async function handleDelete() {
    const confirmed = await confirmWithPassword("Delete this fixture?");
    if (!confirmed) return;
    await fetch(`/api/admin/fixtures/${matchId}`, { method: "DELETE" });
    router.push("/admin/fixtures");
  }

  const canStart = match.status === "SCHEDULED" && match.homeTeamId && match.awayTeamId;

  return (
    <div>
      {modal}
      <h1 className="mb-6 heading-display text-2xl">Edit Fixture</h1>

      <div className="max-w-lg space-y-4 rounded-2xl border border-line bg-surface p-6">
        <Field label="Round">
          <select
            value={match.round}
            onChange={(e) => save({ round: e.target.value as Match["round"] })}
            className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
          >
            <option value="LEAGUE">League</option>
            <option value="SEMIFINAL">Semifinal</option>
            <option value="FINAL">Final</option>
          </select>
        </Field>

        <Field label="Home team">
          <select
            value={match.homeTeamId ?? ""}
            onChange={(e) => save({ homeTeamId: e.target.value || null })}
            className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
          >
            <option value="">TBD</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Away team">
          <select
            value={match.awayTeamId ?? ""}
            onChange={(e) => save({ awayTeamId: e.target.value || null })}
            className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
          >
            <option value="">TBD</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Date & time">
          <input
            type="datetime-local"
            defaultValue={match.scheduledAt ? match.scheduledAt.slice(0, 16) : ""}
            onBlur={(e) => save({ scheduledAt: e.target.value || null })}
            className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
          />
        </Field>

        <Field label="Venue">
          <input
            type="text"
            defaultValue={match.venue ?? ""}
            onBlur={(e) => save({ venue: e.target.value || null })}
            className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
          />
        </Field>

        <Field label="Label">
          <input
            type="text"
            defaultValue={match.label ?? ""}
            onBlur={(e) => save({ label: e.target.value || null })}
            className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
          />
        </Field>

        {error && <p className="text-sm text-live">{error}</p>}
        {saving && <p className="text-sm text-muted">Saving…</p>}

        <div className="flex flex-wrap gap-3 pt-2">
          {match.status === "SCHEDULED" && (
            <button
              onClick={handleStart}
              disabled={!canStart}
              title={canStart ? undefined : "Both teams must be assigned first"}
              className="rounded-full bg-live px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              Start match
            </button>
          )}
          {match.status !== "SCHEDULED" && (
            <a
              href={`/admin/live/${matchId}`}
              className="rounded-full bg-pitch px-5 py-2 text-sm font-bold text-white"
            >
              Open live console
            </a>
          )}
          <button onClick={handleDelete} className="rounded-full border border-line px-5 py-2 text-sm font-medium text-live">
            Delete fixture
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
