"use client";

import { useState } from "react";
import { PitchFormation } from "@/components/PitchFormation";
import { Crest } from "@/components/Crest";

type Player = {
  id: string;
  name: string;
  jerseyNumber: number;
  position: string | null;
  isCaptain: boolean;
  photoUrl: string | null;
  teamId: string;
};
type Team = { id: string; name: string };

/** Defaults to the champion's squad — the one worth seeing first — with a
 * dropdown to switch to any other team instead of listing every squad on
 * the page at once. */
export function LegacySquadPicker({
  teams,
  players,
  defaultTeamId,
  championTeamId,
}: {
  teams: Team[];
  players: Player[];
  defaultTeamId: string;
  championTeamId: string | null;
}) {
  const [teamId, setTeamId] = useState(defaultTeamId);
  const squad = players.filter((p) => p.teamId === teamId);
  const team = teams.find((t) => t.id === teamId);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-bold">
          <Crest size={24} name={team?.name} />
          {team?.name}
          {teamId === championTeamId && <span className="text-sm">🏆</span>}
        </p>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">View other squads</span>
          <select
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            className="rounded-lg border border-line bg-background px-3 py-1.5 text-sm outline-none focus:border-pitch"
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.id === championTeamId ? " (Champions)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      <PitchFormation players={squad} />
    </div>
  );
}
