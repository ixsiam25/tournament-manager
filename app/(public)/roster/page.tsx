import { getAllPlayers } from "@/lib/roster";
import { RosterList } from "@/components/RosterList";

export const revalidate = 20;

export default async function RosterPage() {
  const players = await getAllPlayers();

  return (
    <div>
      <h1 className="mb-6 heading-display text-2xl">Players</h1>
      <RosterList players={players} />
    </div>
  );
}
