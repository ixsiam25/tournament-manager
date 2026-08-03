"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PitchFormation } from "@/components/PitchFormation";

type Position = "GK" | "DEF" | "MID" | "FWD";

type Player = {
  id: string;
  name: string;
  jerseyNumber: number;
  position: Position | null;
  isCaptain: boolean;
  photoUrl: string | null;
};

const POSITIONS: { value: Position | ""; label: string }[] = [
  { value: "", label: "Unassigned" },
  { value: "GK", label: "Goalkeeper" },
  { value: "DEF", label: "Defence" },
  { value: "MID", label: "Midfield" },
  { value: "FWD", label: "Forward" },
];

/** Lets a manager assign which position each of their own players lines up
 * in on the 6-a-side pitch. The preview above the selects re-renders
 * immediately from local state so a manager sees the effect of a change
 * without waiting on a full page reload; `router.refresh()` afterward just
 * keeps the server-rendered page (and anything else on it) in sync. */
export function ManagerSquadEditor({ players: initialPlayers }: { players: Player[] }) {
  const router = useRouter();
  const [players, setPlayers] = useState(initialPlayers);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(playerId: string, next: Position | "") {
    const prev = players;
    setPlayers((ps) => ps.map((p) => (p.id === playerId ? { ...p, position: next || null } : p)));
    setSavingId(playerId);
    setError(null);

    const res = await fetch(`/api/manager/players/${playerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ position: next || null }),
    });
    setSavingId(null);

    if (!res.ok) {
      setPlayers(prev);
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to update position");
      return;
    }
    router.refresh();
  }

  return (
    <section className="mb-8">
      <h2 className="mb-1 font-black uppercase tracking-wide">Squad formation</h2>
      <p className="mb-4 text-sm text-muted">
        Assign each player&rsquo;s position — the first 6 players by jersey number are your
        starting lineup on the pitch below.
      </p>

      <PitchFormation players={players.slice(0, 6)} />

      {error && <p className="mt-3 text-sm text-live">{error}</p>}

      <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {players.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
            <span className="min-w-0 truncate text-sm font-medium">
              #{p.jerseyNumber} {p.name}
              {p.isCaptain && <span className="ml-1.5 text-xs text-muted">(C)</span>}
            </span>
            <select
              value={p.position ?? ""}
              disabled={savingId === p.id}
              onChange={(e) => handleChange(p.id, e.target.value as Position | "")}
              className="shrink-0 rounded-lg border border-line bg-background px-3 py-1.5 text-sm outline-none focus:border-pitch disabled:opacity-50"
            >
              {POSITIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </li>
        ))}
        {players.length === 0 && (
          <li className="px-5 py-6 text-center text-sm text-muted">No players on your squad yet.</li>
        )}
      </ul>
    </section>
  );
}
