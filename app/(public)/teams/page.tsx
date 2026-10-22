import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentSeasonId } from "@/lib/currentSeason";
import { Crest } from "@/components/Crest";

export const revalidate = 20;

export default async function TeamsPage() {
  const seasonId = await getCurrentSeasonId();
  const teams = await prisma.team.findMany({
    where: { seasonId: seasonId ?? "none" },
    orderBy: { name: "asc" },
    include: { _count: { select: { players: true } } },
  });

  return (
    <div>
      <h1 className="mb-6 heading-display text-2xl">Teams</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {teams.map((team) => (
          <Link
            key={team.id}
            href={`/teams/${team.id}`}
            className="flex flex-col items-center gap-2 rounded-block-lg border border-line bg-surface p-5 text-center shadow-block transition-transform hover:-translate-y-0.5 hover:bg-background"
          >
            {team.logoUrl ? (
              <Image
                src={team.logoUrl}
                alt={team.name}
                width={60}
                height={60}
                className="rounded-block border border-line-strong object-cover"
              />
            ) : (
              <Crest size={45} name={team.name} />
            )}
            <span className="font-black uppercase tracking-wide">{team.name}</span>
            {team.managerName && (
              <span className="text-xs text-muted-foreground">Manager: {team.managerName}</span>
            )}
            <span className="text-xs text-muted-foreground">{team._count.players} players</span>
          </Link>
        ))}
        {teams.length === 0 && <p className="text-muted-foreground">No teams yet.</p>}
      </div>
    </div>
  );
}
