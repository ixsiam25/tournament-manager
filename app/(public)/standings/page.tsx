import { getStandings } from "@/lib/standings";
import { AutoRefresh } from "@/components/AutoRefresh";
import { StandingsTable } from "@/components/StandingsTable";

export const revalidate = 15;

export default async function StandingsPage() {
  const rows = await getStandings();

  return (
    <div>
      <AutoRefresh />
      <h1 className="mb-6 heading-display text-2xl">League Standings</h1>
      <StandingsTable rows={rows} />
      <p className="mt-3 text-xs text-muted">
        Top 4 (highlighted) qualify for the semifinals. Click a team once to highlight it, click
        again to see their fixtures.
      </p>
    </div>
  );
}
