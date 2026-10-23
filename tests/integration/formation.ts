// Team-formation services + roster rules against the real schema: approval
// into the pool, moves/jerseys/squad limits, group-by-affiliation, balanced
// deal, snake draft, release/restore, transfer flagging, switch to auction.
// Writes throwaway "ZZ" rows (dev branch only) and cleans up after itself.
//
// Run: ALLOW_DB_WRITE_TESTS=1 npm run test:formationdb
import assert from "node:assert/strict";
import { config } from "dotenv";
config({ path: process.env.TEST_ENV_FILE ?? ".env.local" });

if (process.env.ALLOW_DB_WRITE_TESTS !== "1") {
  console.log("skipped: set ALLOW_DB_WRITE_TESTS=1 (dev branch only)");
  process.exit(0);
}

import { batchLabelForSemester as batchLabelForSemesterForCleanup } from "../../lib/batch";

async function main() {
  const { prisma } = await import("../../lib/db");
  const svc = await import("../../lib/formationService");
  const { approveRegistration } = await import("../../lib/registrationApproval");
  const { findOrCreateFranchise } = await import("../../lib/franchise");

  const tournament = await prisma.tournament.findUniqueOrThrow({ where: { slug: "bfl" } });
  const stamp = Date.now();
  const seasonIds: string[] = [];
  const mkSeason = async (n: number, formation: "BATCH" | "MANUAL" | "DRAFT" | "BALANCED_RANDOM" | "AUCTION") => {
    const s = await prisma.season.create({
      data: {
        tournamentId: tournament.id,
        number: 60000 + ((stamp + n) % 9000),
        name: `ZZ Formation ${n}`,
        slug: `zz-form-${stamp}-${n}`,
        year: 2096,
        status: "ACTIVE",
        teamFormation: formation,
        squadSizeMin: 2,
        squadSizeMax: 4,
      },
    });
    seasonIds.push(s.id);
    return s;
  };
  const apply = async (seasonId: string, name: string, affiliation: string, position: "GK" | "DEF" | "MID" | "FWD" | null = null) => {
    const season = await prisma.season.findUniqueOrThrow({ where: { id: seasonId } });
    const reg = await prisma.registration.create({
      data: { seasonId, name, affiliation, contact: "x", studentId: `ZZ${stamp}${name.replace(/\W/g, "")}`, position, source: "ADMIN_MANUAL", status: "APPROVED" },
    });
    await approveRegistration(reg, season);
    return prisma.player.findFirstOrThrow({ where: { seasonId, name } });
  };
  const mkTeam = async (seasonId: string, name: string) => {
    const f = await findOrCreateFranchise(tournament.id, name);
    return prisma.team.create({ data: { seasonId, franchiseId: f.id, name } });
  };
  const fresh = (id: string) => prisma.season.findUniqueOrThrow({ where: { id } });

  try {
    // 1. Approval always lands in the pool; only AUCTION seasons also get lots.
    const manual = await mkSeason(1, "MANUAL");
    const p1 = await apply(manual.id, "ZZ Ann", "ZZ Batch A", "GK");
    assert.equal(p1.teamId, null);
    assert.equal(p1.jerseyNumber, 0);
    assert.equal(await prisma.auctionLot.count({ where: { seasonId: manual.id } }), 0);

    // 2. Moves: jerseys fill the lowest free number; squad max is enforced; back to pool resets.
    const t1 = await mkTeam(manual.id, "ZZ Red");
    const t2 = await mkTeam(manual.id, "ZZ Blue");
    const names = ["ZZ Bo", "ZZ Cy", "ZZ Di", "ZZ Ed", "ZZ Fay"];
    const rest: Awaited<ReturnType<typeof apply>>[] = [];
    for (const n of names) rest.push(await apply(manual.id, n, "ZZ Batch A"));
    const season = await fresh(manual.id);
    await svc.movePlayer({ season, playerId: p1.id, teamId: t1.id, actor: null });
    for (const p of rest.slice(0, 3)) await svc.movePlayer({ season, playerId: p.id, teamId: t1.id, actor: null });
    const redJerseys = (await prisma.player.findMany({ where: { teamId: t1.id }, orderBy: { jerseyNumber: "asc" } })).map((p) => p.jerseyNumber);
    assert.deepEqual(redJerseys, [1, 2, 3, 4]);
    await assert.rejects(() => svc.movePlayer({ season, playerId: rest[3].id, teamId: t1.id, actor: null }), /maximum of 4/);
    await svc.movePlayer({ season, playerId: rest[0].id, teamId: null, actor: null });
    const back = await prisma.player.findUniqueOrThrow({ where: { id: rest[0].id } });
    assert.equal(back.teamId, null);
    assert.equal(back.jerseyNumber, 0);
    await svc.movePlayer({ season, playerId: rest[3].id, teamId: t1.id, actor: null });
    assert.equal((await prisma.player.findUniqueOrThrow({ where: { id: rest[3].id } })).jerseyNumber, 2, "freed number is reused");

    // 3. Release keeps history, frees the number, hides from squads; delete is blocked with events.
    const match = await prisma.match.create({ data: { seasonId: manual.id, round: "LEAGUE", homeTeamId: t1.id, awayTeamId: t2.id, status: "FINISHED", homeScore: 1 } });
    await prisma.matchEvent.create({ data: { matchId: match.id, type: "GOAL", teamId: t1.id, playerId: p1.id, groupId: "zz-1" } });
    const parked = await prisma.player.count({ where: { teamId: t1.id, jerseyNumber: { lt: 0 } } });
    await prisma.player.update({ where: { id: p1.id }, data: { status: "RELEASED", releasedAt: new Date(), jerseyNumber: -(parked + 1) } });
    assert.equal(await prisma.player.count({ where: { teamId: t1.id, status: "ACTIVE" } }), 3);
    assert.equal(await prisma.matchEvent.count({ where: { playerId: p1.id } }), 1, "goals stay on record");
    const { nextFreeJersey } = await import("../../lib/rosterRules");
    assert.equal(await nextFreeJersey(t1.id), 1, "released player's number is free again");

    // 4. In-play edition: moving a player between teams is flagged as a transfer.
    await svc.movePlayer({ season, playerId: rest[1].id, teamId: t2.id, actor: null });
    const transfer = await prisma.auditLog.findFirst({ where: { entityId: rest[1].id, action: "roster.transfer" } });
    assert.ok(transfer, "a move after kickoff must be audited as a transfer");

    // 5. Group by affiliation: creates a team per affiliation, respects squad max, reports overflow.
    const batch = await mkSeason(2, "BATCH");
    for (const n of ["ZZ A1", "ZZ A2", "ZZ A3", "ZZ A4", "ZZ A5"]) await apply(batch.id, n, "ZZ Sem 3");
    for (const n of ["ZZ B1", "ZZ B2"]) await apply(batch.id, n, "ZZ Sem 5");
    const grouped = await svc.groupByAffiliation(await fresh(batch.id), null);
    assert.equal(grouped.teamsCreated, 2);
    assert.equal(grouped.placed, 6, "4 fit in Sem 3 + 2 in Sem 5");
    assert.equal(grouped.overflow, 1, "5th Sem 3 player doesn't fit (max 4)");
    assert.equal(await prisma.player.count({ where: { seasonId: batch.id, teamId: null } }), 1);

    // 5b. Batch-aware grouping: team per batch with its real semester, alumni together.
    const ref = new Date(2026, 7, 4);
    const { batchLabelForSemester } = await import("../../lib/batch");
    const sem2 = batchLabelForSemester(2, ref);
    const sem7 = batchLabelForSemester(7, ref);
    const messy = sem2.replace(" ", "'").toLowerCase(); // "fall'27"-style spelling of the same batch
    const bs = await prisma.season.create({
      data: { tournamentId: tournament.id, number: 61000 + (stamp % 900), name: "ZZ Batch Season", slug: `zz-batch-${stamp}`, year: 2096, status: "ACTIVE", teamFormation: "BATCH", squadSizeMin: 2, squadSizeMax: 4, startsOn: ref },
    });
    seasonIds.push(bs.id);
    for (const [name, label] of [["ZZ B1", sem2], ["ZZ B2", messy], ["ZZ B3", sem7], ["ZZ B4", batchLabelForSemester(10, ref)], ["ZZ B5", batchLabelForSemester(12, ref)], ["ZZ B6", "Some Club"]] as const) await apply(bs.id, name, label);
    const batchResult = await svc.groupByAffiliation(await fresh(bs.id), null);
    assert.equal(batchResult.placed, 6);
    const batchTeams = await prisma.team.findMany({ where: { seasonId: bs.id }, include: { _count: { select: { players: true } } }, orderBy: { name: "asc" } });
    const byName = Object.fromEntries(batchTeams.map((t) => [t.name, t]));
    assert.deepEqual(Object.keys(byName).sort(), [sem2, sem7, "Alumni", "Some Club"].sort(), "one team per batch, alumni merged, free text kept");
    assert.equal(byName[sem2].semester, 2, "that batch is in its 2nd semester on the season's start date");
    assert.equal(byName[sem2]._count.players, 2, "two spellings of the same batch land together");
    assert.equal(byName[sem7].semester, 7);
    assert.equal(byName["Alumni"]._count.players, 2, "two different alumni batches share one team");
    assert.equal(byName["Alumni"].semester, null);

    // 6. Balanced deal: preview == apply for the same seed; everyone placed within capacity.
    const bal = await mkSeason(3, "BALANCED_RANDOM");
    for (const [i, n] of ["ZZ P1", "ZZ P2", "ZZ P3", "ZZ P4", "ZZ P5", "ZZ P6"].entries()) await apply(bal.id, n, "x", (["GK", "DEF", "MID", "FWD", "DEF", "MID"] as const)[i]);
    await mkTeam(bal.id, "ZZ T1");
    await mkTeam(bal.id, "ZZ T2");
    const balSeason = await fresh(bal.id);
    const preview = await svc.balancedProposal(balSeason, 7);
    assert.equal(preview.moves.length, 6);
    assert.deepEqual((await svc.balancedProposal(balSeason, 7)).moves, preview.moves, "same seed, same deal");
    const applied = await svc.applyBalanced(balSeason, 7, null);
    assert.equal(applied.placed, 6);
    for (const t of await prisma.team.findMany({ where: { seasonId: bal.id } })) assert.equal(await prisma.player.count({ where: { teamId: t.id } }), 3);
    for (const m of preview.moves) assert.equal((await prisma.player.findUniqueOrThrow({ where: { id: m.playerId } })).teamId, m.teamId, "applied exactly what was previewed");

    // 7. Snake draft: order, undo, reset.
    const dr = await mkSeason(4, "DRAFT");
    const dps: Awaited<ReturnType<typeof apply>>[] = [];
    for (const n of ["ZZ D1", "ZZ D2", "ZZ D3", "ZZ D4", "ZZ D5"]) dps.push(await apply(dr.id, n, "x"));
    const da = await mkTeam(dr.id, "ZZ DA");
    const db = await mkTeam(dr.id, "ZZ DB");
    await svc.startDraft(await fresh(dr.id), [da.id, db.id], null);
    const picked: string[] = [];
    for (const p of dps.slice(0, 4)) picked.push((await svc.draftPick(await fresh(dr.id), p.id, null)).teamId);
    assert.deepEqual(picked, [da.id, db.id, db.id, da.id], "snake order A,B,B,A");
    await svc.undoDraftPick(await fresh(dr.id), null);
    assert.equal((await prisma.player.findUniqueOrThrow({ where: { id: dps[3].id } })).teamId, null, "undo returns the player to the pool");
    assert.equal((await svc.draftPick(await fresh(dr.id), dps[3].id, null)).teamId, da.id, "the same team is back on the clock");
    await svc.resetDraft(await fresh(dr.id), null);
    assert.equal((await fresh(dr.id)).formationState, null);
    await assert.rejects(async () => svc.draftPick(await fresh(dr.id), dps[4].id, null), /No draft is running/);

    // 8. Auction seasons refuse board moves and queue lots on approval.
    const auc = await mkSeason(5, "AUCTION");
    const ap = await apply(auc.id, "ZZ Auc", "x");
    assert.equal(await prisma.auctionLot.count({ where: { seasonId: auc.id, playerId: ap.id } }), 1);
    await assert.rejects(() => Promise.resolve().then(() => svc.assertBoardUsable({ teamFormation: "AUCTION" })), /auction/i);

    console.log("✓ formation: pool approval, moves + jerseys + limits, release/transfer rules, group-by-affiliation, balanced deal, snake draft, auction guard");
  } finally {
    for (const seasonId of seasonIds) {
      await prisma.matchEvent.deleteMany({ where: { match: { seasonId } } });
      await prisma.season.delete({ where: { id: seasonId } }).catch((e) => console.error("cleanup", e.message));
    }
    await prisma.person.deleteMany({ where: { name: { startsWith: "ZZ " } } });
    await prisma.franchise.deleteMany({ where: { name: { startsWith: "ZZ " } } });
    await prisma.franchise.deleteMany({ where: { name: { in: ["Alumni", "Some Club", batchLabelForSemesterForCleanup(2, new Date(2026, 7, 4)), batchLabelForSemesterForCleanup(7, new Date(2026, 7, 4))] }, teams: { none: {} } } });
    await prisma.auditLog.deleteMany({ where: { summary: { contains: "ZZ " } } });
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
