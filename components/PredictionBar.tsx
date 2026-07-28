"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { getVoterId, getVoterName, getVoterSemester } from "@/lib/voterIdentity";

type Team = { id: string; name: string; logoUrl: string | null };

type Tally = {
  homeVotes: number;
  awayVotes: number;
  total: number;
  homePct: number;
  awayPct: number;
  yourTeamId: string | null;
};

export function PredictionBar({
  matchId,
  homeTeam,
  awayTeam,
  votingOpen,
  compact = false,
  showLabel = true,
}: {
  matchId: string;
  homeTeam: Team | null;
  awayTeam: Team | null;
  votingOpen: boolean;
  compact?: boolean;
  showLabel?: boolean;
}) {
  const [tally, setTally] = useState<Tally | null>(null);
  const [voting, setVoting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const voterId = getVoterId();
      const res = await fetch(
        `/api/predictions?matchId=${encodeURIComponent(matchId)}&voterId=${encodeURIComponent(voterId)}`,
        { cache: "no-store" },
      );
      if (!res.ok || cancelled) return;
      const data: Tally = await res.json();
      if (!cancelled) setTally(data);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  async function vote(teamId: string) {
    if (!votingOpen || voting) return;
    setVoting(true);
    try {
      const res = await fetch("/api/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId,
          teamId,
          voterId: getVoterId(),
          voterName: getVoterName() || undefined,
          voterSemester: getVoterSemester() || undefined,
        }),
      });
      if (res.ok) {
        const data: Tally = await res.json();
        setTally(data);
      }
    } finally {
      setVoting(false);
    }
  }

  if (!homeTeam || !awayTeam) return null;

  const homePct = tally?.homePct ?? 50;
  const awayPct = tally?.awayPct ?? 50;
  const total = tally?.total ?? 0;
  const yourTeamId = tally?.yourTeamId ?? null;

  return (
    <div className={compact ? "mb-4" : "rounded-block-lg border-2 border-line-strong bg-surface p-4 shadow-block"}>
      <div className="mb-2 flex items-center justify-between">
        {showLabel ? (
          <p className="text-xs font-bold uppercase tracking-wide text-gold">🏆 Champions Prediction</p>
        ) : (
          <span />
        )}
        <p className="text-xs text-muted">
          {votingOpen ? `${total} vote${total === 1 ? "" : "s"}` : "Voting closed"}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <PickButton
          team={homeTeam}
          pct={homePct}
          selected={yourTeamId === homeTeam.id}
          disabled={!votingOpen || voting}
          align="right"
          onClick={() => vote(homeTeam.id)}
        />
        <PickButton
          team={awayTeam}
          pct={awayPct}
          selected={yourTeamId === awayTeam.id}
          disabled={!votingOpen || voting}
          align="left"
          onClick={() => vote(awayTeam.id)}
        />
      </div>
      <div className="mt-2 flex h-2 w-full overflow-hidden rounded-block bg-line">
        <div className="h-full bg-maroon transition-all" style={{ width: `${homePct}%` }} />
        <div className="h-full bg-royal transition-all" style={{ width: `${awayPct}%` }} />
      </div>
    </div>
  );
}

function PickButton({
  team,
  pct,
  selected,
  disabled,
  align,
  onClick,
}: {
  team: Team;
  pct: number;
  selected: boolean;
  disabled: boolean;
  align: "left" | "right";
  onClick: () => void;
}) {
  const isRight = align === "right";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        "flex flex-1 items-center gap-2 rounded-block border-2 px-2.5 py-1.5 text-left transition-colors disabled:cursor-default " +
        (isRight ? "flex-row-reverse text-right " : "") +
        (selected
          ? "border-gold bg-gold/10"
          : "border-line hover:border-line-strong disabled:hover:border-line")
      }
    >
      {team.logoUrl ? (
        <Image
          src={team.logoUrl}
          alt={team.name}
          width={24}
          height={24}
          className="h-6 w-6 shrink-0 rounded-block border border-line-strong object-cover"
        />
      ) : (
        <span className="h-6 w-6 shrink-0 rounded-block bg-line" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-bold sm:text-sm">{team.name}</span>
        <span className="block text-xs text-muted">{pct}%</span>
      </span>
      {selected && <span className="shrink-0 text-xs font-bold text-gold">✓</span>}
    </button>
  );
}
