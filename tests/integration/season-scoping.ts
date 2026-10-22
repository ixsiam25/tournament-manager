// Two-season isolation check. Writes a throwaway season + teams to whatever
// DATABASE_URL points at, so it refuses to run unless explicitly allowed
// (use the dev branch). Cleans up after itself, even on failure.
//
// Run: ALLOW_DB_WRITE_TESTS=1 npm run test:scoping
// Needs a dev server for the page checks: npx next dev -p 3100

import assert from "node:assert/strict";
import { config } from "dotenv";
config({ path: ".env.local" });

if (process.env.ALLOW_DB_WRITE_TESTS !== "1") {
  console.log("skipped: set ALLOW_DB_WRITE_TESTS=1 (dev branch only)");
  process.exit(0);
}

const base = process.env.SMOKE_BASE_URL ?? "http://localhost:3100";

async function main() {
  const { prisma } = await import("../../lib/db");
  const { getStandings } = await import("../../lib/standings");
  const { getTopScorers } = await import("../../lib/playerStats");
  const { getAllPlayers } = await import("../../lib/roster");
  const { getLiveStatus } = await import("../../lib/liveStatus");
  const { getCurrentSeason } = await import("../../lib/currentSeason");

  const before = await getCurrentSeason();
  assert.ok(before, "a current season must exist");
  const tournament = await prisma.tournament.findUniqueOrThrow({ where: { slug: "bfl" } });
  const other = await prisma.season.create({
    data: {
      tournamentId: tournament.id,
      number: 90000 + (Date.now() % 9000),
      name: "ZZ Scope Test",
      slug: `zz-scope-${Date.now()}`,
      year: 2099,
      status: "ACTIVE",
    },
  });

  try {
    const team = await prisma.team.create({ data: { seasonId: other.id, name: "ZZ Ghost FC" } });
    const rival = await prisma.team.create({ data: { seasonId: other.id, name: "ZZ Rival FC" } });
    const player = await prisma.player.create({ data: { seasonId: other.id, teamId: team.id, name: "ZZ Ghost Striker", jerseyNumber: 9 } });
    const match = await prisma.match.create({
      data: { seasonId: other.id, round: "LEAGUE", homeTeamId: team.id, awayTeamId: rival.id, homeScore: 7, awayScore: 0, status: "FINISHED", finishedAt: new Date() },
    });
    await prisma.matchEvent.create({ data: { matchId: match.id, type: "GOAL", teamId: team.id, playerId: player.id, groupId: "zz-g1" } });
    await prisma.championPrediction.create({ data: { seasonId: other.id, teamId: team.id, voterId: "zz-voter" } });

    assert.equal((await getCurrentSeason())?.id, before.id, "creating another ACTIVE season must not hijack 'current'");

    assert.ok(!(await getStandings()).some((r) => r.teamName.startsWith("ZZ ")), "standings leaked");
    assert.ok(!(await getTopScorers()).some((s) => s.playerName.startsWith("ZZ ")), "top scorers leaked");
    assert.ok(!(await getAllPlayers()).some((p) => p.name.startsWith("ZZ ")), "roster leaked");
    assert.ok(!JSON.stringify(await getLiveStatus()).includes("ZZ Ghost"), "live status leaked");

    const own = await getStandings(other.id);
    assert.deepEqual(own.map((r) => r.teamName).sort(), ["ZZ Ghost FC", "ZZ Rival FC"]);
    assert.equal(own.find((r) => r.teamName === "ZZ Ghost FC")?.points, 3);
    assert.deepEqual((await getTopScorers(other.id)).map((s) => s.playerName), ["ZZ Ghost Striker"]);

    for (const path of ["/teams", "/standings", "/fixtures", "/roster", "/players", "/predictions"]) {
      const res = await fetch(base + path);
      assert.equal(res.status, 200, `${path} status`);
      assert.ok(!(await res.text()).includes("ZZ Ghost"), `${path} leaked the other season`);
    }
    console.log("✓ season scoping: no cross-season leakage across libs and public pages");
  } finally {
    // MatchEvent -> Team/Player is RESTRICT on purpose (a safety net against
    // deleting a team that has history), so remove events before the season.
    await prisma.matchEvent.deleteMany({ where: { match: { seasonId: other.id } } });
    await prisma.season.delete({ where: { id: other.id } }); // cascades to every other scoped row
    const leftovers = await prisma.team.count({ where: { name: { startsWith: "ZZ " } } });
    assert.equal(leftovers, 0, "cleanup left rows behind");
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
