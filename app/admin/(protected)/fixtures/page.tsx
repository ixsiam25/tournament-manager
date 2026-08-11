"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePasswordConfirm } from "@/components/PasswordConfirm";
import { useRequireAdminRole } from "@/components/useRequireAdminRole";

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
  mainReferee: string | null;
  assistantReferee: string | null;
  winnerTeamId: string | null;
  penaltyHomeScore: number | null;
  penaltyAwayScore: number | null;
  extraTimePlayed: boolean;
};

const ROUND_LABELS: Record<Match["round"], string> = {
  LEAGUE: "League",
  SEMIFINAL: "Semifinals",
  FINAL: "Final",
};

export default function FixturesAdminPage() {
  useRequireAdminRole();
  const [matches, setMatches] = useState<Match[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [round, setRound] = useState<Match["round"]>("LEAGUE");
  const [label, setLabel] = useState("");
  const [homeTeamId, setHomeTeamId] = useState("");
  const [awayTeamId, setAwayTeamId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [populating, setPopulating] = useState(false);
  const [pairingTeamIds, setPairingTeamIds] = useState<string[]>([]);
  const [pairingDouble, setPairingDouble] = useState(false);
  const [generatingPairings, setGeneratingPairings] = useState(false);
  const [schedulePreview, setSchedulePreview] = useState<
    { matchId: string; homeTeamName: string; awayTeamName: string; pitch: string; time: string }[] | null
  >(null);
  const [scheduleWorstRest, setScheduleWorstRest] = useState<number | null>(null);
  const [randomizing, setRandomizing] = useState(false);
  const [applyingSchedule, setApplyingSchedule] = useState(false);
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

  function toggleTeam(teamId: string) {
    setPairingTeamIds((prev) => (prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]));
  }

  async function generatePairings() {
    setError(null);
    setGeneratingPairings(true);
    const res = await fetch("/api/admin/fixtures/generate-pairings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamIds: pairingTeamIds, double: pairingDouble }),
    });
    setGeneratingPairings(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to generate pairings");
      return;
    }
    load();
  }

  async function previewSchedule() {
    setError(null);
    setRandomizing(true);
    const res = await fetch("/api/admin/fixtures/randomize-schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setRandomizing(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to randomize schedule");
      setSchedulePreview(null);
      return;
    }
    const body = await res.json();
    setSchedulePreview(body.preview);
    setScheduleWorstRest(body.worstRestMinutes);
  }

  async function applySchedule() {
    setApplyingSchedule(true);
    setError(null);
    const res = await fetch("/api/admin/fixtures/randomize-schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apply: true }),
    });
    setApplyingSchedule(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to apply schedule");
      return;
    }
    setSchedulePreview(null);
    setScheduleWorstRest(null);
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
      {!loading && byRound.get("LEAGUE") === undefined && teams.length >= 2 && (
        <div className="mb-6 rounded-2xl border border-line bg-surface p-4">
          <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-muted">
            Generate round-robin pairings
          </h2>
          <p className="mb-3 text-xs text-muted">
            Bulk-creates league fixtures with both teams assigned but no kickoff time yet — pure
            combinatorics, nothing to review. Pick the teams, then use &quot;Randomize kickoff
            order&quot; below to schedule them.
          </p>
          <div className="mb-3 flex flex-wrap gap-2">
            {teams.map((t) => (
              <label
                key={t.id}
                className={
                  "flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium " +
                  (pairingTeamIds.includes(t.id) ? "border-pitch bg-pitch/10 text-pitch-dark" : "border-line")
                }
              >
                <input
                  type="checkbox"
                  checked={pairingTeamIds.includes(t.id)}
                  onChange={() => toggleTeam(t.id)}
                  className="hidden"
                />
                {t.name}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs font-medium">
              <input type="checkbox" checked={pairingDouble} onChange={(e) => setPairingDouble(e.target.checked)} />
              Double round-robin (home + away)
            </label>
            <button
              onClick={generatePairings}
              disabled={generatingPairings || pairingTeamIds.length < 2}
              className="rounded-full bg-pitch px-4 py-1.5 text-xs font-bold text-white disabled:opacity-40"
            >
              {generatingPairings ? "Generating…" : `Generate (${pairingTeamIds.length} teams)`}
            </button>
          </div>
        </div>
      )}

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
                  {r === "LEAGUE" && (
                    <button
                      onClick={previewSchedule}
                      disabled={randomizing}
                      title="Assigns kickoff times to league fixtures that don't have one yet, maximizing each team's minimum rest between matches"
                      className="rounded-full border border-line px-3 py-1 text-xs font-bold uppercase tracking-wide disabled:opacity-40"
                    >
                      {randomizing ? "Randomizing…" : "Randomize kickoff order"}
                    </button>
                  )}
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
                {r === "LEAGUE" && schedulePreview && (
                  <div className="mb-4 rounded-2xl border border-line bg-surface p-4">
                    <p className="mb-3 text-sm font-bold">
                      Worst-case rest:{" "}
                      <span className={scheduleWorstRest !== null && scheduleWorstRest < 10 ? "text-live" : "text-pitch-dark"}>
                        {scheduleWorstRest} min
                      </span>{" "}
                      <span className="font-normal text-muted">— nothing is saved yet</span>
                    </p>
                    <ul className="mb-3 max-h-64 divide-y divide-line overflow-y-auto text-sm">
                      {schedulePreview.map((p) => (
                        <li key={p.matchId} className="flex justify-between py-1.5">
                          <span>
                            {p.homeTeamName} vs {p.awayTeamName}
                          </span>
                          <span className="text-muted">
                            {p.time} · {p.pitch}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={applySchedule}
                        disabled={applyingSchedule}
                        className="rounded-full bg-pitch px-4 py-1.5 text-xs font-bold text-white disabled:opacity-40"
                      >
                        {applyingSchedule ? "Applying…" : "Apply"}
                      </button>
                      <button
                        onClick={previewSchedule}
                        disabled={randomizing}
                        className="rounded-full border border-line px-4 py-1.5 text-xs font-bold disabled:opacity-40"
                      >
                        Randomize again
                      </button>
                      <button
                        onClick={() => {
                          setSchedulePreview(null);
                          setScheduleWorstRest(null);
                        }}
                        className="rounded-full border border-line px-4 py-1.5 text-xs font-medium text-muted"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
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
                        {m.homeScore === m.awayScore && m.winnerTeamId && (
                          <span className="ml-3 text-xs font-medium text-muted">
                            {m.winnerTeamId === m.homeTeam?.id ? m.homeTeam?.name : m.awayTeam?.name} advances
                            {m.penaltyHomeScore !== null && m.penaltyAwayScore !== null ? (
                              <> ({m.penaltyHomeScore}–{m.penaltyAwayScore} pens)</>
                            ) : (
                              m.extraTimePlayed && <> (after extra time)</>
                            )}
                          </span>
                        )}
                        {m.homeScore !== m.awayScore && m.extraTimePlayed && m.winnerTeamId && (
                          <span className="ml-3 text-xs font-medium text-muted">won after extra time</span>
                        )}
                        {(m.mainReferee || m.assistantReferee) && (
                          <div className="mt-1 text-xs text-muted">
                            {m.mainReferee && (
                              <span>
                                Ref: <span className="font-medium text-foreground">{m.mainReferee}</span>
                              </span>
                            )}
                            {m.mainReferee && m.assistantReferee && <span className="mx-1.5">·</span>}
                            {m.assistantReferee && (
                              <span>
                                Assistant: <span className="font-medium text-foreground">{m.assistantReferee}</span>
                              </span>
                            )}
                          </div>
                        )}
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
