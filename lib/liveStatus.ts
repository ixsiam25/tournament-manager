import { prisma } from "@/lib/db";
import { getCurrentSeasonId } from "@/lib/currentSeason";

const matchWithTeams = {
  homeTeam: true,
  awayTeam: true,
} as const;

const recentResultsQuery = (seasonId: string) => ({
  where: { seasonId, status: "FINISHED" as const },
  include: {
    ...matchWithTeams,
    events: {
      include: { player: true, team: true },
      orderBy: { sequence: "desc" as const },
    },
  },
  orderBy: { finishedAt: "desc" as const },
  take: 5,
});

export async function getLiveStatus(seasonId?: string | null) {
  const sid = seasonId ?? (await getCurrentSeasonId());
  if (!sid) return { status: "IDLE" as const, nextFixture: null, recentResults: [] };
  const [live, recentResults] = await Promise.all([
    prisma.match.findFirst({
      where: { seasonId: sid, status: "LIVE" },
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
    prisma.match.findMany(recentResultsQuery(sid)),
  ]);

  if (live) {
    // Recent results stay visible even while a match is live, instead of
    // vanishing until the live match finishes.
    return { status: "LIVE" as const, match: live, recentResults };
  }

  const nextFixture = await prisma.match.findFirst({
    where: { seasonId: sid, status: "SCHEDULED", homeTeamId: { not: null }, awayTeamId: { not: null } },
    include: matchWithTeams,
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
  });

  return { status: "IDLE" as const, nextFixture, recentResults };
}
