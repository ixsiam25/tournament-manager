import Image from "next/image";
import { getStandings } from "@/lib/standings";

export const dynamic = "force-dynamic";

export default async function StandingsPage() {
  const rows = await getStandings();

  return (
    <div>
      <h1 className="mb-6 heading-display text-2xl">League Standings</h1>
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[680px] text-base">
          <thead>
            <tr className="border-b border-line text-left text-sm uppercase tracking-wide text-muted">
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
            {rows.map((row, i) => (
              <tr key={row.teamId} className={i < 4 ? "bg-pitch/5" : undefined}>
                <td className="px-5 py-4 text-muted">{i + 1}</td>
                <td className="px-5 py-4 font-medium">
                  <span className="flex items-center gap-3">
                    {row.logoUrl ? (
                      <Image
                        src={row.logoUrl}
                        alt={row.teamName}
                        width={36}
                        height={36}
                        className="shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span className="h-9 w-9 shrink-0 rounded-full bg-line" />
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
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">Top 4 (highlighted) qualify for the semifinals.</p>
    </div>
  );
}
