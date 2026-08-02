"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { StandingRow } from "@/lib/standings";
import { Crest } from "@/components/Crest";

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
            <th className="sticky right-0 bg-surface px-5 py-4 text-center font-bold shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.2)]">
              Pts
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const selected = selectedId === row.teamId;
            // Shared with the sticky Pts cell below so it doesn't show a
            // mismatched background while the row is scrolled horizontally.
            const rowBg = selected ? "bg-pitch/20" : i < 4 ? "bg-pitch/5" : "bg-surface";
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
                  rowBg +
                  " " +
                  (selected
                    ? ""
                    : i < 4
                      ? "border-l-4 border-l-pitch hover:bg-pitch/10"
                      : "border-l-4 border-l-transparent hover:bg-background")
                }
              >
                <td className="px-5 py-4 text-muted">{i + 1}</td>
                <td className="px-5 py-4 font-medium">
                  <span className="flex items-center gap-3">
                    <Link
                      href={`/teams/${row.teamId}`}
                      onClick={(e) => e.stopPropagation()}
                      title={`Open ${row.teamName}'s squad`}
                      className="shrink-0"
                    >
                      {row.logoUrl ? (
                        <Image
                          src={row.logoUrl}
                          alt={row.teamName}
                          width={45}
                          height={45}
                          className="rounded-block border border-line-strong object-cover"
                        />
                      ) : (
                        <Crest size={40} name={row.teamName} />
                      )}
                    </Link>
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
                <td
                  className={
                    "sticky right-0 px-5 py-4 text-center text-lg font-extrabold shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.2)] " +
                    rowBg
                  }
                >
                  {row.points}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
