import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PitchFormation } from "@/components/PitchFormation";
import { PlayerCard } from "@/components/PlayerCard";
import { Crest } from "@/components/Crest";

export const dynamic = "force-dynamic";

export default async function TeamSquadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const team = await prisma.team.findUnique({
    where: { id },
    include: { players: { orderBy: { jerseyNumber: "asc" } } },
  });

  if (!team) notFound();

  const extras = team.players.filter((p) => !p.position);

  return (
    <div>
      <Link href="/teams" className="mb-4 inline-block text-sm text-muted hover:text-foreground">
        ← All teams
      </Link>
      <div className="mb-6 flex items-center gap-3">
        {team.logoUrl ? (
          <Image
            src={team.logoUrl}
            alt={team.name}
            width={40}
            height={40}
            className="rounded-full object-cover"
          />
        ) : (
          <Crest size={36} />
        )}
        <div>
          <h1 className="heading-display text-2xl">{team.name}</h1>
          {team.managerName && (
            <p className="text-sm text-muted">Manager: {team.managerName}</p>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_220px]">
        <PitchFormation players={team.players} />

        <div>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">Extras</h2>
          {extras.length === 0 ? (
            <p className="text-sm text-muted">No extra squad players.</p>
          ) : (
            <div className="flex flex-row flex-wrap gap-3 lg:flex-col lg:items-start">
              {extras.map((p) => (
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
        </div>
      </div>
    </div>
  );
}
