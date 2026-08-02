import Image from "next/image";
import Link from "next/link";

export type PlayerStatRow = {
  playerId: string;
  playerName: string;
  teamId: string | null;
  teamName: string;
  photoUrl: string | null;
  count: number;
};

export function PlayerStatList({
  title,
  icon,
  rows,
  limit,
  viewAllHref,
}: {
  title: string;
  icon: string;
  rows: PlayerStatRow[];
  limit?: number;
  viewAllHref?: string;
}) {
  const visible = limit ? rows.slice(0, limit) : rows;

  return (
    <div className="overflow-hidden rounded-block-lg border-2 border-line-strong bg-surface shadow-block">
      <h2 className="border-b-2 border-line-strong px-5 py-4 font-black uppercase tracking-wide">
        {icon} {title}
      </h2>
      {visible.length === 0 ? (
        <p className="p-5 text-sm text-muted">No data yet.</p>
      ) : (
        <ol className="divide-y-2 divide-line">
          {visible.map((row, i) => (
            <li
              key={row.playerId}
              className={
                "flex items-center gap-3 px-5 py-3 " +
                (i < 3 ? "border-l-4 border-l-pitch bg-pitch/5" : "")
              }
            >
              <span className="w-5 shrink-0 text-center text-sm font-bold text-muted">
                {i + 1}
              </span>
              {row.photoUrl ? (
                <span className="relative h-14 w-9 shrink-0 overflow-hidden rounded-block border-2 border-line-strong">
                  <Image src={row.photoUrl} alt={row.playerName} fill sizes="36px" className="object-cover" />
                </span>
              ) : (
                <span className="h-14 w-9 shrink-0 rounded-block bg-line" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-bold">{row.playerName}</span>
                {row.teamId ? (
                  <Link
                    href={`/teams/${row.teamId}`}
                    className="block truncate text-xs text-muted hover:text-foreground hover:underline"
                  >
                    {row.teamName}
                  </Link>
                ) : (
                  <span className="block truncate text-xs text-muted">{row.teamName}</span>
                )}
              </span>
              <span className="shrink-0 text-xl font-black tabular-nums">{row.count}</span>
            </li>
          ))}
        </ol>
      )}
      {viewAllHref && (
        <Link
          href={viewAllHref}
          className="block border-t-2 border-line-strong px-5 py-3 text-center text-sm font-bold uppercase tracking-wide text-pitch-dark hover:bg-background"
        >
          See full player standings →
        </Link>
      )}
    </div>
  );
}
