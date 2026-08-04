"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { getVoterId, getVoterName, getVoterSemester } from "@/lib/voterIdentity";
import { Crest } from "@/components/Crest";

type Team = { id: string; name: string; logoUrl: string | null };

type Tally = {
  counts: Record<string, number>;
  total: number;
  yourTeamId: string | null;
  open: boolean;
};

export function ChampionPredictionForm({ teams }: { teams: Team[] }) {
  const [tally, setTally] = useState<Tally | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const voterId = getVoterId();
      const res = await fetch(`/api/champion-prediction?voterId=${encodeURIComponent(voterId)}`, {
        cache: "no-store",
      });
      if (!res.ok || cancelled) return;
      const data: Tally = await res.json();
      if (cancelled) return;
      setTally(data);
      if (data.yourTeamId) {
        setSelected(data.yourTeamId);
        setSubmitted(true);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit() {
    if (!selected || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/champion-prediction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: selected,
          voterId: getVoterId(),
          voterName: getVoterName() || undefined,
          voterSemester: getVoterSemester() || undefined,
        }),
      });
      if (res.ok) {
        const data: Tally = await res.json();
        setTally(data);
        setSubmitted(true);
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to submit prediction");
      if (res.status === 403) {
        // Closed since the page loaded (e.g. a scheduled auto-close fired) —
        // refetch so the UI reflects that instead of staying stuck.
        const voterId = getVoterId();
        const refreshed = await fetch(`/api/champion-prediction?voterId=${encodeURIComponent(voterId)}`, {
          cache: "no-store",
        });
        if (refreshed.ok) setTally(await refreshed.json());
      }
    } finally {
      setSubmitting(false);
    }
  }

  const total = tally?.total ?? 0;
  const sorted = [...teams].sort((a, b) => (tally?.counts[b.id] ?? 0) - (tally?.counts[a.id] ?? 0));
  const changedSinceSubmit = submitted && selected !== tally?.yourTeamId;
  // Assume open until the tally loads, so the form doesn't flash disabled on
  // first paint — the server enforces the real gate on submit either way.
  const closed = tally !== null && !tally.open;

  return (
    <div className="rounded-block-lg border-2 border-line-strong bg-surface p-4 shadow-block sm:p-6">
      <p className="mb-4 text-sm text-muted">
        {closed
          ? "Predictions are closed."
          : submitted
            ? "You've picked your champion. Change your mind any time — select a different team and submit again."
            : "Pick the team you think will be crowned Season IX champions, then submit your prediction."}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {teams.map((team) => {
          const isSelected = selected === team.id;
          return (
            <button
              key={team.id}
              type="button"
              onClick={() => setSelected(team.id)}
              disabled={closed}
              aria-pressed={isSelected}
              className={
                "flex flex-col items-center gap-2 rounded-block border-2 p-3 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-60 " +
                (isSelected ? "border-gold bg-gold/10" : "border-line hover:border-line-strong")
              }
            >
              {team.logoUrl ? (
                <Image
                  src={team.logoUrl}
                  alt={team.name}
                  width={50}
                  height={50}
                  className="h-[50px] w-[50px] rounded-block border border-line-strong object-cover"
                />
              ) : (
                <Crest size={45} name={team.name} />
              )}
              <span className="text-xs font-bold sm:text-sm">{team.name}</span>
              {isSelected && <span className="text-xs font-bold text-gold">✓ Selected</span>}
            </button>
          );
        })}
      </div>

      {!closed && (
        <button
          type="button"
          onClick={submit}
          disabled={!selected || submitting || (submitted && !changedSinceSubmit)}
          className="mt-4 w-full rounded-block bg-maroon px-4 py-2.5 text-sm font-bold text-white transition-opacity disabled:opacity-40 sm:w-auto"
        >
          {submitting ? "Submitting…" : submitted ? "Update my pick" : "Submit prediction"}
        </button>
      )}
      {error && <p className="mt-3 text-sm text-live">{error}</p>}

      {total > 0 && (
        <div className="mt-6 border-t-2 border-line pt-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">
            {total} prediction{total === 1 ? "" : "s"} so far
          </p>
          <div className="space-y-2">
            {sorted.map((team) => {
              const count = tally?.counts[team.id] ?? 0;
              const pct = total === 0 ? 0 : Math.round((count / total) * 100);
              return (
                <div key={team.id} className="flex items-center gap-2 text-sm">
                  <span className="w-24 shrink-0 truncate font-medium sm:w-36">{team.name}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-block bg-line">
                    <span className="block h-full bg-royal transition-all" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="w-14 shrink-0 text-right text-xs text-muted tabular-nums">
                    {pct}% ({count})
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
