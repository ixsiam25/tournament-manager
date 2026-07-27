import { prisma } from "@/lib/db";

const matchWithTeams = {
  homeTeam: true,
  awayTeam: true,
} as const;

export async function getLiveStatus() {
  const live = await prisma.match.findFirst({
    where: { status: "LIVE" },
    include: {
      ...matchWithTeams,
      events: {
        include: { player: true, team: true },
        orderBy: { sequence: "desc" as const },
        take: 10,
      },
    },
    orderBy: { startedAt: "asc" },
  });

  if (live) {
    return { status: "LIVE" as const, match: live };
  }

  const [nextFixture, recentResults] = await Promise.all([
    prisma.match.findFirst({
      where: { status: "SCHEDULED", homeTeamId: { not: null }, awayTeamId: { not: null } },
      include: matchWithTeams,
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    }),
    prisma.match.findMany({
      where: { status: "FINISHED" },
      include: {
        ...matchWithTeams,
        events: {
          include: { player: true, team: true },
          orderBy: { sequence: "desc" as const },
        },
      },
      orderBy: { finishedAt: "desc" },
      take: 5,
    }),
  ]);

  return { status: "IDLE" as const, nextFixture, recentResults };
}
