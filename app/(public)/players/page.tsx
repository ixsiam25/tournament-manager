import { getTopScorers, getTopAssists } from "@/lib/playerStats";
import { AutoRefresh } from "@/components/AutoRefresh";
import { PlayerStatList } from "@/components/PlayerStatList";

export const revalidate = 15;

export default async function PlayerStandingsPage() {
  const [scorers, assists] = await Promise.all([getTopScorers(), getTopAssists()]);

  return (
    <div>
      <AutoRefresh />
      <h1 className="mb-6 heading-display text-2xl">Player Standings</h1>
      <div className="grid gap-6 sm:grid-cols-2">
        <PlayerStatList title="Top Scorers" icon="⚽" rows={scorers} />
        <PlayerStatList title="Top Assists" icon="🅰️" rows={assists} />
      </div>
    </div>
  );
}
