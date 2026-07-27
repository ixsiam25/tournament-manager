import { PlayerCard } from "@/components/PlayerCard";

type Player = {
  id: string;
  name: string;
  jerseyNumber: number;
  position: string | null;
  isCaptain: boolean;
  photoUrl: string | null;
};

const ROWS: { key: "FWD" | "MID" | "DEF" | "GK"; label: string }[] = [
  { key: "FWD", label: "Forwards" },
  { key: "MID", label: "Midfielders" },
  { key: "DEF", label: "Defenders" },
  { key: "GK", label: "Goalkeeper" },
];

export function PitchFormation({ players }: { players: Player[] }) {
  const byPosition = (pos: string) => players.filter((p) => p.position === pos);
  const unassigned = players.filter((p) => !p.position);

  return (
    <div className="relative overflow-hidden rounded-block-lg border-2 border-line-strong bg-pitch p-4 shadow-block sm:p-6">
      {/* Pitch markings */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full opacity-40"
        viewBox="0 0 100 140"
        preserveAspectRatio="none"
        aria-hidden
      >
        <rect x="2" y="2" width="96" height="136" fill="none" stroke="white" strokeWidth="0.6" />
        <line x1="2" y1="70" x2="98" y2="70" stroke="white" strokeWidth="0.6" />
        <circle cx="50" cy="70" r="12" fill="none" stroke="white" strokeWidth="0.6" />
        <rect x="25" y="2" width="50" height="18" fill="none" stroke="white" strokeWidth="0.6" />
        <rect x="25" y="120" width="50" height="18" fill="none" stroke="white" strokeWidth="0.6" />
      </svg>

      <div className="relative flex flex-col gap-6 py-4">
        {ROWS.map((row) => {
          const rowPlayers = byPosition(row.key);
          if (rowPlayers.length === 0) return null;
          return (
            <div key={row.key} className="flex flex-wrap items-center justify-center gap-4">
              {rowPlayers.map((p) => (
                <PlayerCard
                  key={p.id}
                  name={p.name}
                  jerseyNumber={p.jerseyNumber}
                  position={p.position}
                  isCaptain={p.isCaptain}
                  photoUrl={p.photoUrl}
                />
              ))}
            </div>
          );
        })}
        {unassigned.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-4">
            {unassigned.map((p) => (
              <PlayerCard
                key={p.id}
                name={p.name}
                jerseyNumber={p.jerseyNumber}
                isCaptain={p.isCaptain}
                photoUrl={p.photoUrl}
              />
            ))}
          </div>
        )}
        {players.length === 0 && (
          <p className="py-12 text-center text-sm font-medium text-white/80">
            No squad players yet.
          </p>
        )}
      </div>
    </div>
  );
}
