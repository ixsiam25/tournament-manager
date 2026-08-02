"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Crest } from "@/components/Crest";
import { ordinalSemester } from "@/lib/semester";
import type { RosterPlayer } from "@/lib/roster";

type SortDirection = "desc" | "asc";

export function RosterList({ players }: { players: RosterPlayer[] }) {
  // Default high -> low by request, since that's the order a batch rep
  // scanning for their own semester would look in.
  const [direction, setDirection] = useState<SortDirection>("desc");

  const sorted = useMemo(() => {
    const factor = direction === "desc" ? -1 : 1;
    // Unassigned semesters (null) always sink to the bottom regardless of
    // direction — "unknown" isn't meaningfully higher or lower than a real
    // semester number, so it shouldn't jump to the top on ascending sort.
    return [...players].sort((a, b) => {
      if (a.semester == null && b.semester == null) return tieBreak(a, b);
      if (a.semester == null) return 1;
      if (b.semester == null) return -1;
      if (a.semester !== b.semester) return (a.semester - b.semester) * factor;
      return tieBreak(a, b);
    });
  }, [players, direction]);

  const teamCount = new Set(players.map((p) => p.teamId)).size;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {players.length} players across {teamCount} teams
        </p>
        <button
          type="button"
          onClick={() => setDirection((d) => (d === "desc" ? "asc" : "desc"))}
          aria-label="Toggle semester sort direction"
          className="flex items-center gap-1.5 rounded-block border-2 border-line px-3 py-1.5 text-xs font-bold uppercase tracking-wide hover:border-line-strong"
        >
          Semester: {direction === "desc" ? "High → Low" : "Low → High"}
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className={"transition-transform duration-150 " + (direction === "asc" ? "rotate-180" : "")}
            aria-hidden
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      <ul className="divide-y-2 divide-line overflow-hidden rounded-block-lg border-2 border-line-strong bg-surface shadow-block">
        {sorted.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-4 py-3 sm:gap-4 sm:px-6 sm:py-3.5">
            {p.photoUrl ? (
              <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-block border-2 border-line-strong">
                <Image src={p.photoUrl} alt={p.name} fill sizes="36px" className="object-cover" />
              </span>
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-block bg-line text-xs font-bold text-muted">
                {p.jerseyNumber}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-sm font-bold sm:text-base">{p.name}</span>
                {p.isCaptain && (
                  <span className="shrink-0 rounded-full bg-brand/15 px-1.5 py-0.5 text-[10px] font-bold text-brand">
                    C
                  </span>
                )}
              </span>
              <Link
                href={`/teams/${p.teamId}`}
                className="flex min-w-0 items-center gap-1 text-xs text-muted hover:text-foreground hover:underline"
              >
                {p.teamLogoUrl ? (
                  <Image
                    src={p.teamLogoUrl}
                    alt={p.teamName}
                    width={14}
                    height={14}
                    className="h-[14px] w-[14px] shrink-0 rounded-block object-cover"
                  />
                ) : (
                  <Crest size={14} name={p.teamName} />
                )}
                <span className="truncate">{p.teamName}</span>
              </Link>
            </span>
            {p.position && (
              <span className="shrink-0 rounded-block border border-line px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
                {p.position}
              </span>
            )}
            <span className="shrink-0 rounded-block bg-pitch/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-pitch-dark">
              {p.semester != null ? `${ordinalSemester(p.semester)} sem` : "—"}
            </span>
          </li>
        ))}
        {sorted.length === 0 && <li className="px-6 py-6 text-center text-muted">No players yet.</li>}
      </ul>
    </div>
  );
}

function tieBreak(a: RosterPlayer, b: RosterPlayer): number {
  return a.teamName.localeCompare(b.teamName) || a.jerseyNumber - b.jerseyNumber;
}
