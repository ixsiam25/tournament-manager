import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { Crest } from "@/components/Crest";

export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  const teams = await prisma.team.findMany({
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
            className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface p-5 text-center hover:border-pitch"
          >
            {team.logoUrl ? (
              <Image
                src={team.logoUrl}
                alt={team.name}
                width={48}
                height={48}
                className="rounded-full object-cover"
              />
            ) : (
              <Crest size={36} />
            )}
            <span className="font-bold">{team.name}</span>
            {team.managerName && (
              <span className="text-xs text-muted">Manager: {team.managerName}</span>
            )}
            <span className="text-xs text-muted">{team._count.players} players</span>
          </Link>
        ))}
        {teams.length === 0 && <p className="text-muted">No teams yet.</p>}
      </div>
    </div>
  );
}
