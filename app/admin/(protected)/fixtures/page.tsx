"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePasswordConfirm } from "@/components/PasswordConfirm";

type Team = { id: string; name: string };
type Match = {
  id: string;
  round: "LEAGUE" | "SEMIFINAL" | "FINAL";
  label: string | null;
  status: "SCHEDULED" | "LIVE" | "FINISHED";
  homeScore: number;
  awayScore: number;
  homeTeam: Team | null;
  awayTeam: Team | null;
};

const ROUND_LABELS: Record<Match["round"], string> = {
  LEAGUE: "League",
  SEMIFINAL: "Semifinals",
  FINAL: "Final",
};

export default function FixturesAdminPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [round, setRound] = useState<Match["round"]>("LEAGUE");
  const [label, setLabel] = useState("");
  const [homeTeamId, setHomeTeamId] = useState("");
  const [awayTeamId, setAwayTeamId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [populating, setPopulating] = useState(false);
  const { confirmWithPassword, modal } = usePasswordConfirm();

  async function load() {
    const [matchesRes, teamsRes] = await Promise.all([
      fetch("/api/admin/fixtures"),
      fetch("/api/admin/teams"),
    ]);
    setMatches((await matchesRes.json()).matches ?? []);
    setTeams((await teamsRes.json()).teams ?? []);
    setLoading(false);
  }

  useEffect(() => {
    let ignore = false;
    (async () => {
      const [matchesRes, teamsRes] = await Promise.all([
        fetch("/api/admin/fixtures"),
        fetch("/api/admin/teams"),
      ]);
      const matchesBody = await matchesRes.json();
      const teamsBody = await teamsRes.json();
      if (!ignore) {
        setMatches(matchesBody.matches ?? []);
        setTeams(teamsBody.teams ?? []);
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
    const res = await fetch("/api/admin/fixtures", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        round,
        label: label || null,
        homeTeamId: homeTeamId || null,
        awayTeamId: awayTeamId || null,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to create fixture");
      return;
    }
    setLabel("");
    setHomeTeamId("");
    setAwayTeamId("");
    load();
  }

  async function populateSemis() {
    const confirmed = await confirmWithPassword(
      "Fill in the semifinals from the current standings (1st vs 4th, 2nd vs 3rd)? This overwrites whichever teams are already assigned.",
    );
    if (!confirmed) return;
    setPopulating(true);
    setError(null);
    const res = await fetch("/api/admin/fixtures/populate-semis", { method: "POST" });
    setPopulating(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to populate semifinals");
      return;
    }
    load();
  }

  const byRound = new Map<Match["round"], Match[]>();
  for (const m of matches) {
    const list = byRound.get(m.round) ?? [];
    list.push(m);
    byRound.set(m.round, list);
  }

  return (
    <div>
      {modal}
      <h1 className="mb-6 heading-display text-2xl">Fixtures</h1>

      <form onSubmit={handleCreate} className="mb-6 flex flex-wrap gap-3 rounded-2xl border border-line bg-surface p-4">
        <select
          value={round}
          onChange={(e) => setRound(e.target.value as Match["round"])}
          className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
        >
          <option value="LEAGUE">League</option>
          <option value="SEMIFINAL">Semifinal</option>
          <option value="FINAL">Final</option>
        </select>
        <select
          value={homeTeamId}
          onChange={(e) => setHomeTeamId(e.target.value)}
          className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
        >
          <option value="">Home team (TBD)</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          value={awayTeamId}
          onChange={(e) => setAwayTeamId(e.target.value)}
          className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
        >
          <option value="">Away team (TBD)</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (optional)"
          className="flex-1 min-w-32 rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
        />
        <button type="submit" className="rounded-full bg-pitch px-5 py-2 text-sm font-bold text-white">
          Add fixture
        </button>
      </form>
      {error && <p className="mb-4 text-sm text-live">{error}</p>}

      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <div className="space-y-8">
          {(["LEAGUE", "SEMIFINAL", "FINAL"] as const).map((r) => {
            const list = byRound.get(r);
            if (!list || list.length === 0) return null;
            return (
              <section key={r}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-muted">
                    {ROUND_LABELS[r]}
                  </h2>
                  {r === "SEMIFINAL" && (
                    <button
                      onClick={populateSemis}
                      disabled={populating}
                      title="1st vs 4th, 2nd vs 3rd, taken from the current league standings"
                      className="rounded-full border border-line px-3 py-1 text-xs font-bold uppercase tracking-wide disabled:opacity-40"
                    >
                      {populating ? "Populating…" : "Populate from standings"}
                    </button>
                  )}
                </div>
                <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                  {list.map((m) => (
                    <li key={m.id} className="flex items-center justify-between px-5 py-3.5">
                      <div>
                        <span className="font-medium">
                          {m.homeTeam?.name ?? "TBD"} vs {m.awayTeam?.name ?? "TBD"}
                        </span>
                        {m.status !== "SCHEDULED" && (
                          <span className="ml-3 text-sm tabular-nums text-muted">
                            {m.homeScore} – {m.awayScore}
                          </span>
                        )}
                        <span
                          className={
                            "ml-3 rounded-full px-2 py-0.5 text-xs font-bold " +
                            (m.status === "LIVE"
                              ? "bg-live/10 text-live"
                              : m.status === "FINISHED"
                                ? "bg-pitch/10 text-pitch-dark"
                                : "bg-line text-muted")
                          }
                        >
                          {m.status}
                        </span>
                      </div>
                      <div className="flex gap-3 text-sm font-medium">
                        {m.status === "LIVE" ? (
                          <Link href={`/admin/live/${m.id}`} className="text-live">
                            Live console →
                          </Link>
                        ) : (
                          <Link href={`/admin/fixtures/${m.id}`} className="text-muted hover:text-foreground">
                            Edit
                          </Link>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          {matches.length === 0 && <p className="text-muted">No fixtures yet.</p>}
        </div>
      )}
    </div>
  );
}
