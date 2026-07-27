import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { Crest } from "@/components/Crest";

export const revalidate = 20;

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
            className="flex flex-col items-center gap-2 rounded-block-lg border-2 border-line-strong bg-surface p-5 text-center shadow-block transition-transform hover:-translate-y-0.5 hover:bg-background"
          >
            {team.logoUrl ? (
              <Image
                src={team.logoUrl}
                alt={team.name}
                width={48}
                height={48}
                className="rounded-block border border-line-strong object-cover"
              />
            ) : (
              <Crest size={36} />
            )}
            <span className="font-black uppercase tracking-wide">{team.name}</span>
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
