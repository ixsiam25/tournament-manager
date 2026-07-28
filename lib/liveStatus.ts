import { prisma } from "@/lib/db";

const matchWithTeams = {
  homeTeam: true,
  awayTeam: true,
} as const;

const recentResultsQuery = {
  where: { status: "FINISHED" as const },
  include: {
    ...matchWithTeams,
    events: {
      include: { player: true, team: true },
      orderBy: { sequence: "desc" as const },
    },
  },
  orderBy: { finishedAt: "desc" as const },
  take: 5,
};

export async function getLiveStatus() {
  const [live, recentResults] = await Promise.all([
    prisma.match.findFirst({
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
    }),
    prisma.match.findMany(recentResultsQuery),
  ]);

  if (live) {
    // Recent results stay visible even while a match is live, instead of
    // vanishing until the live match finishes.
    return { status: "LIVE" as const, match: live, recentResults };
  }

  const nextFixture = await prisma.match.findFirst({
    where: { status: "SCHEDULED", homeTeamId: { not: null }, awayTeamId: { not: null } },
    include: matchWithTeams,
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
  });

  return { status: "IDLE" as const, nextFixture, recentResults };
}
