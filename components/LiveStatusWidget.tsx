"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { EventList, type EventItem } from "@/components/EventList";
import { PredictionBar } from "@/components/PredictionBar";
import { Crest } from "@/components/Crest";

type Team = { id: string; name: string; logoUrl: string | null } | null;

type LiveMatch = {
  id: string;
  homeTeam: Team;
  awayTeam: Team;
  homeScore: number;
  awayScore: number;
  events: EventItem[];
};

type LiveResponse =
  | { status: "LIVE"; match: LiveMatch; recentResults: LiveMatch[] }
  | {
      status: "IDLE";
      nextFixture: (LiveMatch & { scheduledAt: string | null; venue: string | null }) | null;
      recentResults: LiveMatch[];
    };

const LIVE_POLL_MS = 7000;
const IDLE_POLL_MS = 20000;

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

    // Poll at all times, not just while LIVE — otherwise a visitor sitting on
    // the idle state never learns a match just kicked off without reloading.
    intervalRef.current = setInterval(poll, data.status === "LIVE" ? LIVE_POLL_MS : IDLE_POLL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [data.status]);

  if (data.status === "LIVE") {
    const { match, recentResults } = data;
    return (
      <div className="space-y-4">
        <div className="animate-card-in rounded-block-lg border-2 border-line-strong bg-surface p-6 shadow-block">
          <PredictionBar
            matchId={match.id}
            homeTeam={match.homeTeam}
            awayTeam={match.awayTeam}
            votingOpen
            compact
          />
          <div className="mb-4 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-block bg-live px-2.5 py-1 text-xs font-black uppercase tracking-wide text-white">
              <span className="h-1.5 w-1.5 animate-pulse-live rounded-full bg-white" />
              Live
            </span>
          </div>
          <div className="flex items-center justify-between text-center">
            <TeamScore
              name={match.homeTeam?.name ?? "TBD"}
              logoUrl={match.homeTeam?.logoUrl}
              score={match.homeScore}
            />
            <span className="text-sm font-bold uppercase text-muted">vs</span>
            <TeamScore
              name={match.awayTeam?.name ?? "TBD"}
              logoUrl={match.awayTeam?.logoUrl}
              score={match.awayScore}
            />
          </div>
          <EventList events={match.events} className="mt-6 border-t-2 border-line pt-4" />
        </div>
        <RecentResults results={recentResults} />
      </div>
    );
  }

  const { nextFixture, recentResults } = data;
  return (
    <div className="space-y-4">
      {nextFixture && (
        <div className="animate-card-in rounded-block-lg border-2 border-line-strong bg-surface p-6 shadow-block">
          <PredictionBar
            matchId={nextFixture.id}
            homeTeam={nextFixture.homeTeam}
            awayTeam={nextFixture.awayTeam}
            votingOpen
            compact
          />
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Next match</p>
          <div className="flex items-center justify-between text-center">
            <span className="flex flex-1 flex-col items-center gap-1 font-semibold">
              {nextFixture.homeTeam?.logoUrl ? (
                <Image
                  src={nextFixture.homeTeam.logoUrl}
                  alt={nextFixture.homeTeam.name}
                  width={28}
                  height={28}
                  className="rounded-block object-cover"
                />
              ) : (
                <Crest size={26} name={nextFixture.homeTeam?.name} />
              )}
              {nextFixture.homeTeam?.name ?? "TBD"}
            </span>
            <span className="text-sm font-bold uppercase text-muted">vs</span>
            <span className="flex flex-1 flex-col items-center gap-1 font-semibold">
              {nextFixture.awayTeam?.logoUrl ? (
                <Image
                  src={nextFixture.awayTeam.logoUrl}
                  alt={nextFixture.awayTeam.name}
                  width={28}
                  height={28}
                  className="rounded-block object-cover"
                />
              ) : (
                <Crest size={26} name={nextFixture.awayTeam?.name} />
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
      <RecentResults results={recentResults} />
      {!nextFixture && recentResults.length === 0 && (
        <p className="text-center text-muted">No matches scheduled yet.</p>
      )}
    </div>
  );
}

function RecentResults({ results }: { results: LiveMatch[] }) {
  if (results.length === 0) return null;
  return (
    <div className="animate-card-in rounded-block-lg border-2 border-line-strong bg-surface p-6 shadow-block">
      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Recent results</p>
      <ul className="divide-y-2 divide-line">
        {results.map((m) => (
          <li key={m.id} className="py-2.5">
            <div className="flex items-center gap-3 text-sm">
              <span className="flex flex-1 items-center justify-end gap-2 text-right font-medium">
                {m.homeTeam?.name ?? "TBD"}
                <ResultLogo logoUrl={m.homeTeam?.logoUrl} name={m.homeTeam?.name} />
              </span>
              <span className="min-w-14 shrink-0 rounded-block bg-background px-3 py-1 text-center text-xs font-bold tabular-nums">
                {m.homeScore} – {m.awayScore}
              </span>
              <span className="flex flex-1 items-center gap-2 font-medium">
                <ResultLogo logoUrl={m.awayTeam?.logoUrl} name={m.awayTeam?.name} />
                {m.awayTeam?.name ?? "TBD"}
              </span>
            </div>
            <EventList events={m.events} className="mt-2 pl-2" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResultLogo({ logoUrl, name }: { logoUrl?: string | null; name?: string }) {
  if (!logoUrl) return <Crest size={24} name={name} />;
  return (
    <Image
      src={logoUrl}
      alt={name ?? ""}
      width={24}
      height={24}
      className="shrink-0 rounded-block object-cover"
    />
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
        <Image
          src={logoUrl}
          alt={name}
          width={32}
          height={32}
          className="mb-1 rounded-block object-cover"
        />
      ) : (
        <span className="mb-1">
          <Crest size={32} name={name} />
        </span>
      )}
      <p className="font-semibold">{name}</p>
      <p className="heading-display text-3xl tabular-nums">{score}</p>
    </div>
  );
}
