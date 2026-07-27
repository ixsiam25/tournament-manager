import Image from "next/image";
import { getTopScorers, getTopAssists } from "@/lib/playerStats";
import { AutoRefresh } from "@/components/AutoRefresh";

export const revalidate = 15;

export default async function PlayerStandingsPage() {
  const [scorers, assists] = await Promise.all([getTopScorers(), getTopAssists()]);

  return (
    <div>
      <AutoRefresh />
      <h1 className="mb-6 heading-display text-2xl">Player Standings</h1>
      <div className="grid gap-6 sm:grid-cols-2">
        <StatList title="Top Scorers" icon="⚽" rows={scorers} />
        <StatList title="Top Assists" icon="🅰️" rows={assists} />
      </div>
    </div>
  );
}

function StatList({
  title,
  icon,
  rows,
}: {
  title: string;
  icon: string;
  rows: { playerId: string; playerName: string; teamName: string; photoUrl: string | null; count: number }[];
}) {
  return (
    <div className="rounded-block-lg border-2 border-line-strong bg-surface p-5 shadow-block">
      <h2 className="mb-3 font-black uppercase tracking-wide">
        {icon} {title}
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No data yet.</p>
      ) : (
        <ol className="space-y-2 text-sm">
          {rows.map((row, i) => (
            <li key={row.playerId} className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="text-muted">{i + 1}.</span>
                {row.photoUrl ? (
                  <Image
                    src={row.photoUrl}
                    alt={row.playerName}
                    width={24}
                    height={24}
                    className="rounded-block border border-line-strong object-cover"
                  />
                ) : (
                  <span className="h-6 w-6 rounded-block bg-line" />
                )}
                {row.playerName}
                <span className="text-xs text-muted">({row.teamName})</span>
              </span>
              <span className="font-bold tabular-nums">{row.count}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
