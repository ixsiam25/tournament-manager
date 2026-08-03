import { PlayerCard } from "@/components/PlayerCard";

type Position = "GK" | "DEF" | "MID" | "FWD";

type Player = {
  id: string;
  name: string;
  jerseyNumber: number;
  position: string | null;
  isCaptain: boolean;
  photoUrl: string | null;
};

// Fixed 6-a-side shape (1-2-2-1: 1 GK + 2 DEF + 2 MID + 1 FWD = 6 slots),
// attacking end first. Every team's pitch renders this same skeleton
// regardless of how many of its players have a position set -- that's the
// whole point: before this, a row simply disappeared when nobody was
// tagged for it, so two teams' pitches could look structurally different
// depending on how completely their positions happened to be filled in.
const FORMATION: { key: Position; label: string; slots: number }[] = [
  { key: "FWD", label: "Forward", slots: 1 },
  { key: "MID", label: "Midfield", slots: 2 },
  { key: "DEF", label: "Defence", slots: 2 },
  { key: "GK", label: "Goalkeeper", slots: 1 },
];

type SlotRow = { key: Position; label: string; players: (Player | null)[] };

/**
 * Places each player into their tagged position's row first (jersey-number
 * order), up to that row's slot count. Anyone left over -- no position set,
 * or more players tagged for a row than it has slots -- drops into the
 * first empty slot anywhere on the pitch, so all 6 squad members always
 * appear somewhere and the grid shape never changes.
 */
function assignToFormation(players: Player[]): SlotRow[] {
  const remaining = [...players].sort((a, b) => a.jerseyNumber - b.jerseyNumber);
  const rows: SlotRow[] = FORMATION.map((f) => ({ key: f.key, label: f.label, players: [] }));

  for (const row of rows) {
    const capacity = FORMATION.find((f) => f.key === row.key)!.slots;
    for (let i = 0; i < remaining.length && row.players.length < capacity; ) {
      if (remaining[i].position === row.key) {
        row.players.push(remaining[i]);
        remaining.splice(i, 1);
      } else {
        i++;
      }
    }
  }

  for (const row of rows) {
    const capacity = FORMATION.find((f) => f.key === row.key)!.slots;
    while (row.players.length < capacity && remaining.length > 0) {
      row.players.push(remaining.shift()!);
    }
  }

  for (const row of rows) {
    const capacity = FORMATION.find((f) => f.key === row.key)!.slots;
    while (row.players.length < capacity) row.players.push(null);
  }

  return rows;
}

export function PitchFormation({ players }: { players: Player[] }) {
  const rows = assignToFormation(players);

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
        {rows.map((row) => (
          <div key={row.key} className="flex flex-wrap items-center justify-center gap-4">
            {row.players.map((p, i) =>
              p ? (
                <PlayerCard
                  key={p.id}
                  name={p.name}
                  jerseyNumber={p.jerseyNumber}
                  position={p.position}
                  isCaptain={p.isCaptain}
                  photoUrl={p.photoUrl}
                />
              ) : (
                <EmptySlot key={`${row.key}-${i}`} label={row.label} />
              ),
            )}
          </div>
        ))}
        {players.length === 0 && (
          <p className="py-12 text-center text-sm font-medium text-white/80">
            No squad players yet.
          </p>
        )}
      </div>
    </div>
  );
}

function EmptySlot({ label }: { label: string }) {
  return (
    <div className="flex w-24 flex-col items-center justify-center gap-1.5 rounded-block-lg border-2 border-dashed border-white/40 bg-white/5 p-1.5 text-center">
      <span className="flex h-9 w-9 items-center justify-center rounded-block border-2 border-dashed border-white/40 text-xs text-white/50">
        ?
      </span>
      <span className="text-[10px] font-bold uppercase tracking-wide text-white/50">{label}</span>
    </div>
  );
}
