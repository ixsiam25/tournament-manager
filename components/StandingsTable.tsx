"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { StandingRow } from "@/lib/standings";

/** Click a row once to highlight it for easier reading across the wide
 * table; click the same row again to jump to its filtered fixtures. */
export function StandingsTable({ rows }: { rows: StandingRow[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function activate(teamId: string) {
    if (selectedId === teamId) {
      router.push(`/fixtures?team=${teamId}`);
      return;
    }
    setSelectedId(teamId);
  }

  function handleKeyDown(e: React.KeyboardEvent, teamId: string) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate(teamId);
    }
  }

  return (
    <div className="overflow-x-auto rounded-block-lg border-2 border-line-strong bg-surface shadow-block">
      <table className="w-full min-w-[680px] text-base">
        <thead>
          <tr className="border-b-2 border-line-strong text-left text-sm uppercase tracking-wide text-muted">
            <th className="px-5 py-4">#</th>
            <th className="px-5 py-4">Team</th>
            <th className="px-3 py-4 text-center">P</th>
            <th className="px-3 py-4 text-center">W</th>
            <th className="px-3 py-4 text-center">D</th>
            <th className="px-3 py-4 text-center">L</th>
            <th className="px-3 py-4 text-center">GF</th>
            <th className="px-3 py-4 text-center">GA</th>
            <th className="px-3 py-4 text-center">GD</th>
            <th className="px-5 py-4 text-center font-bold">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const selected = selectedId === row.teamId;
            return (
              <tr
                key={row.teamId}
                tabIndex={0}
                role="button"
                aria-pressed={selected}
                onClick={() => activate(row.teamId)}
                onKeyDown={(e) => handleKeyDown(e, row.teamId)}
                title={
                  selected
                    ? `Click again to see ${row.teamName}'s fixtures`
                    : `Click to highlight ${row.teamName}`
                }
                className={
                  "cursor-pointer border-b border-line outline-none transition-colors last:border-b-0 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pitch " +
                  (selected
                    ? "bg-pitch/20"
                    : i < 4
                      ? "border-l-4 border-l-pitch bg-pitch/5 hover:bg-pitch/10"
                      : "border-l-4 border-l-transparent hover:bg-background")
                }
              >
                <td className="px-5 py-4 text-muted">{i + 1}</td>
                <td className="px-5 py-4 font-medium">
                  <span className="flex items-center gap-3">
                    {row.logoUrl ? (
                      <Image
                        src={row.logoUrl}
                        alt={row.teamName}
                        width={36}
                        height={36}
                        className="shrink-0 rounded-block border border-line-strong object-cover"
                      />
                    ) : (
                      <span className="h-9 w-9 shrink-0 rounded-block bg-line" />
                    )}
                    {row.teamName}
                  </span>
                </td>
                <td className="px-3 py-4 text-center">{row.played}</td>
                <td className="px-3 py-4 text-center">{row.won}</td>
                <td className="px-3 py-4 text-center">{row.drawn}</td>
                <td className="px-3 py-4 text-center">{row.lost}</td>
                <td className="px-3 py-4 text-center">{row.goalsFor}</td>
                <td className="px-3 py-4 text-center">{row.goalsAgainst}</td>
                <td className="px-3 py-4 text-center">{row.goalDifference}</td>
                <td className="px-5 py-4 text-center text-lg font-extrabold">{row.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
