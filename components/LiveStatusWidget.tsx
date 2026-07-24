"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type Team = { id: string; name: string; logoUrl: string | null } | null;

type EventRow = {
  id: string;
  type: "GOAL" | "ASSIST" | "YELLOW_CARD" | "RED_CARD";
  player: { name: string };
  team: { name: string };
};

const EVENT_LABELS: Record<EventRow["type"], string> = {
  GOAL: "⚽",
  ASSIST: "🅰️",
  YELLOW_CARD: "🟨",
  RED_CARD: "🟥",
};

type LiveMatch = {
  id: string;
  homeTeam: Team;
  awayTeam: Team;
  homeScore: number;
  awayScore: number;
  events: EventRow[];
};

type LiveResponse =
  | { status: "LIVE"; match: LiveMatch }
  | {
      status: "IDLE";
      nextFixture: (LiveMatch & { scheduledAt: string | null; venue: string | null }) | null;
      lastResult: LiveMatch | null;
    };

const POLL_INTERVAL_MS = 7000;

export function LiveStatusWidget({ initial }: { initial: LiveResponse }) {
  const [data, setData] = useState<LiveResponse>(initial);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch("/api/public/live", { cache: "no-store" });
        if (!res.ok) return;
        const next: LiveResponse = await res.json();
        setData(next);
      } catch {
        // network hiccup — try again on the next tick
      }
    }

    if (data.status === "LIVE") {
      intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [data.status]);

  if (data.status === "LIVE") {
    const { match } = data;
    return (
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-live/10 px-2.5 py-1 text-xs font-bold text-live">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-live" />
            LIVE
          </span>
        </div>
        <div className="flex items-center justify-between text-center">
          <TeamScore
            name={match.homeTeam?.name ?? "TBD"}
            logoUrl={match.homeTeam?.logoUrl}
            score={match.homeScore}
          />
          <span className="text-sm font-medium text-muted">vs</span>
          <TeamScore
            name={match.awayTeam?.name ?? "TBD"}
            logoUrl={match.awayTeam?.logoUrl}
            score={match.awayScore}
          />
        </div>
        {match.events.length > 0 && (
          <ul className="mt-6 space-y-1.5 border-t border-line pt-4 text-sm">
            {match.events.map((e) => (
              <li key={e.id} className="flex justify-between text-muted">
                <span>
                  {EVENT_LABELS[e.type]} {e.player.name}
                  <span className="text-xs"> ({e.team.name})</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const { nextFixture, lastResult } = data;
  return (
    <div className="space-y-4">
      {nextFixture && (
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Next match</p>
          <div className="flex items-center justify-between text-center">
            <span className="flex flex-1 flex-col items-center gap-1 font-semibold">
              {nextFixture.homeTeam?.logoUrl && (
                <Image
                  src={nextFixture.homeTeam.logoUrl}
                  alt={nextFixture.homeTeam.name}
                  width={28}
                  height={28}
                  className="rounded-full object-cover"
                />
              )}
              {nextFixture.homeTeam?.name ?? "TBD"}
            </span>
            <span className="text-sm text-muted">vs</span>
            <span className="flex flex-1 flex-col items-center gap-1 font-semibold">
              {nextFixture.awayTeam?.logoUrl && (
                <Image
                  src={nextFixture.awayTeam.logoUrl}
                  alt={nextFixture.awayTeam.name}
                  width={28}
                  height={28}
                  className="rounded-full object-cover"
                />
              )}
              {nextFixture.awayTeam?.name ?? "TBD"}
            </span>
          </div>
          {nextFixture.scheduledAt && (
            <p className="mt-3 text-center text-sm text-muted">
              {new Date(nextFixture.scheduledAt).toLocaleString()}
              {nextFixture.venue ? ` · ${nextFixture.venue}` : ""}
            </p>
          )}
        </div>
      )}
      {lastResult && (
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">
            Most recent result
          </p>
          <div className="flex items-center justify-between text-center">
            <TeamScore
              name={lastResult.homeTeam?.name ?? "TBD"}
              logoUrl={lastResult.homeTeam?.logoUrl}
              score={lastResult.homeScore}
            />
            <span className="text-sm font-medium text-muted">–</span>
            <TeamScore
              name={lastResult.awayTeam?.name ?? "TBD"}
              logoUrl={lastResult.awayTeam?.logoUrl}
              score={lastResult.awayScore}
            />
          </div>
        </div>
      )}
      {!nextFixture && !lastResult && (
        <p className="text-center text-muted">No matches scheduled yet.</p>
      )}
    </div>
  );
}

function TeamScore({
  name,
  logoUrl,
  score,
}: {
  name: string;
  logoUrl?: string | null;
  score: number;
}) {
  return (
    <div className="flex flex-1 flex-col items-center">
      {logoUrl ? (
        <Image src={logoUrl} alt={name} width={32} height={32} className="mb-1 rounded-full object-cover" />
      ) : null}
      <p className="font-semibold">{name}</p>
      <p className="heading-display text-3xl tabular-nums">{score}</p>
    </div>
  );
}
