// Rebuilds the live Team/Player/Match/Event/Prediction rows of an ARCHIVED
// season from its frozen `resultsJson`, scoped to that season. Needed once
// for Season IX, whose rows were wiped at rollover before rows carried a
// seasonId — afterwards its history is queryable with SQL instead of only
// living in a JSON blob. Then re-derives standings + top scorers from the
// rebuilt rows and compares them with the frozen snapshot, so a mismatch
// shows up immediately.
//
// Run: SEASON_SLUG=ix npx tsx scripts/rehydrate-season.ts
// Targets whatever DATABASE_URL points at (.env.local → the dev branch).
// Refuses if the season already has teams, so re-running is harmless.

import fs from "node:fs";
import dotenv from "dotenv";
dotenv.config({ path: process.env.ENV_FILE ?? (fs.existsSync(".env.local") ? ".env.local" : ".env") });

/** Season IX's stored URLs are legacy `/api/photos/<key>` (Netlify Blobs).
 * Every one of those was exported to `public/photos/<key>.jpg`, which is
 * served straight off the CDN — point at that when the file exists. */
function modernUrl(url: string | null): string | null {
  if (!url?.startsWith("/api/photos/")) return url;
  const key = url.slice("/api/photos/".length);
  return fs.existsSync(`public/photos/${key}.jpg`) ? `/photos/${key}.jpg` : url;
}

async function main() {
  const { prisma } = await import("../lib/db");
  const { getStandings } = await import("../lib/standings");
  const { getTopScorers } = await import("../lib/playerStats");
  type Archive = import("../lib/seasonArchive").SeasonArchive;

  const slug = process.env.SEASON_SLUG ?? "ix";
  const season = await prisma.season.findUnique({ where: { slug } });
  if (!season) throw new Error(`No season "${slug}"`);
  const archive = season.resultsJson as unknown as Archive | null;
  if (!archive) throw new Error(`Season "${slug}" has no resultsJson snapshot`);

  const existing = await prisma.team.count({ where: { seasonId: season.id } });
  if (existing > 0) {
    console.log(`Season "${slug}" already has ${existing} teams — nothing to do.`);
    return;
  }

  const teamIdByName = new Map(archive.teams.map((t) => [t.name, t.id]));
  const playerIdByTeamAndName = new Map(archive.players.map((p) => [`${p.teamName}\u0000${p.name}`, p.id]));
  const { findOrCreateFranchise } = await import("../lib/franchise");
  const franchiseIdByTeam = new Map<string, string>();
  for (const t of archive.teams) {
    franchiseIdByTeam.set(t.id, (await findOrCreateFranchise(season.tournamentId, t.name, t.shortName)).id);
  }
  const knownPersonIds = new Set(
    (await prisma.person.findMany({ where: { id: { in: archive.players.map((p) => p.personId).filter((x): x is string => !!x) } }, select: { id: true } })).map((p) => p.id),
  );

  // Bulk inserts: hundreds of single-row writes through the serverless
  // driver blow past any sane transaction timeout.
  await prisma.$transaction(
    async (tx) => {
      await tx.team.createMany({
        data: archive.teams.map((t) => ({
          id: t.id,
          seasonId: season.id,
          franchiseId: franchiseIdByTeam.get(t.id)!,
          name: t.name,
          shortName: t.shortName,
          semester: t.semester,
          managerName: t.managerName,
          logoUrl: modernUrl(t.logoUrl),
          managerLoginBlocked: t.managerLoginBlocked,
          createdAt: new Date(t.createdAt),
        })),
      });

      // Players archived without a (surviving) Person get one now: a roster
      // slot is always a Person in an edition.
      const personIdByPlayer = new Map<string, string>();
      for (const p of archive.players) {
        if (p.personId && knownPersonIds.has(p.personId)) personIdByPlayer.set(p.id, p.personId);
        else personIdByPlayer.set(p.id, (await tx.person.create({ data: { name: p.name } })).id);
      }

      await tx.player.createMany({
        data: archive.players.map((p) => ({
          id: p.id,
          seasonId: season.id,
          teamId: p.teamId,
          name: p.name,
          jerseyNumber: p.jerseyNumber,
          position: (p.position as "GK" | "DEF" | "MID" | "FWD" | null) ?? null,
          isCaptain: p.isCaptain,
          photoUrl: modernUrl(p.photoUrl),
          personId: personIdByPlayer.get(p.id)!,
          createdAt: new Date(p.createdAt),
        })),
      });

      await tx.match.createMany({
        data: archive.matches.map((m) => ({
          id: m.id,
          seasonId: season.id,
          round: m.round as "LEAGUE" | "SEMIFINAL" | "FINAL",
          label: m.label,
          homeTeamId: m.homeTeam ? teamIdByName.get(m.homeTeam) ?? null : null,
          awayTeamId: m.awayTeam ? teamIdByName.get(m.awayTeam) ?? null : null,
          homeScore: m.homeScore,
          awayScore: m.awayScore,
          status: m.status as "SCHEDULED" | "LIVE" | "FINISHED",
          scheduledAt: m.scheduledAt ? new Date(m.scheduledAt) : null,
          venue: m.venue,
          mainReferee: m.mainReferee,
          assistantReferee: m.assistantReferee,
          winnerTeamId: m.winnerTeam ? teamIdByName.get(m.winnerTeam) ?? null : null,
          penaltyHomeScore: m.penaltyHomeScore,
          penaltyAwayScore: m.penaltyAwayScore,
          extraTimePlayed: m.extraTimePlayed,
          startedAt: m.startedAt ? new Date(m.startedAt) : null,
          finishedAt: m.finishedAt ? new Date(m.finishedAt) : null,
        })),
      });

      await tx.matchEvent.createMany({
        data: archive.matchEvents.map((e) => {
          const teamId = teamIdByName.get(e.team);
          const playerId = playerIdByTeamAndName.get(`${e.team}\u0000${e.player}`);
          if (!teamId || !playerId) throw new Error(`Cannot resolve event ${e.type} for ${e.player} (${e.team})`);
          return {
            matchId: e.matchId,
            type: e.type as "GOAL" | "ASSIST" | "YELLOW_CARD" | "RED_CARD",
            teamId,
            playerId,
            groupId: e.groupId,
            sequence: e.sequence,
          };
        }),
      });

      await tx.prediction.createMany({
        data: archive.predictions.flatMap((p) => {
          const teamId = teamIdByName.get(p.team);
          // Voter ids were never archived; synthetic ones keep the unique
          // (matchId, voterId) constraint satisfied.
          return teamId
            ? [{ matchId: p.matchId, teamId, voterId: `archived-${crypto.randomUUID()}`, voterName: p.voterName, voterSemester: p.voterSemester }]
            : [];
        }),
      });

      await tx.championPrediction.createMany({
        data: archive.championPredictions.flatMap((c) => {
          const teamId = teamIdByName.get(c.team);
          return teamId
            ? [{ seasonId: season.id, teamId, voterId: `archived-${crypto.randomUUID()}`, voterName: c.voterName, voterSemester: c.voterSemester }]
            : [];
        }),
      });
    },
    { timeout: 120_000 },
  );

  console.log(
    `Rehydrated "${slug}": ${archive.teams.length} teams, ${archive.players.length} players, ${archive.matches.length} matches, ${archive.matchEvents.length} events.`,
  );

  // Re-derive and compare against the frozen snapshot.
  const standings = await getStandings(season.id);
  const scorers = await getTopScorers(season.id);
  let mismatches = 0;
  const frozenRows = archive.finalStandings;
  if (standings.length !== frozenRows.length) {
    mismatches++;
    console.error(`MISMATCH standings length ${standings.length} vs ${frozenRows.length}`);
  }
  frozenRows.forEach((row, i) => {
    const got = standings[i];
    const same =
      got &&
      got.teamName === row.teamName &&
      got.points === row.points &&
      got.goalDifference === row.goalDifference &&
      got.played === row.played &&
      got.goalsFor === row.goalsFor;
    if (!same) {
      mismatches++;
      console.error(`MISMATCH standings row ${i + 1}: derived ${JSON.stringify(got)} vs frozen ${JSON.stringify(row)}`);
    }
  });
  const frozenScorers = archive.topScorers.map((s) => `${s.playerName}:${s.count}`).join("|");
  const derivedScorers = scorers.map((s) => `${s.playerName}:${s.count}`).join("|");
  if (frozenScorers !== derivedScorers) {
    mismatches++;
    console.error(`MISMATCH top scorers\n  derived: ${derivedScorers}\n  frozen:  ${frozenScorers}`);
  }
  console.log(mismatches === 0 ? "✓ Derived standings and top scorers match the frozen snapshot exactly." : `✗ ${mismatches} mismatch(es).`);
  await prisma.$disconnect();
  process.exit(mismatches === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
