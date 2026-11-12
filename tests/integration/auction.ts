// Auction against the real schema: team-less live bids, retained
// players, squad-aware budgets, unsold/requeue, the wrap-up fair draw, close
// checks + lock, and the projector's phase derivation.
// Throwaway ZZ seasons; dev branch only. Run: ALLOW_DB_WRITE_TESTS=1 npm run test:auction
import assert from "node:assert/strict";
import { config } from "dotenv";
config({ path: process.env.TEST_ENV_FILE ?? ".env.local" });

if (process.env.ALLOW_DB_WRITE_TESTS !== "1") {
  console.log("skipped: set ALLOW_DB_WRITE_TESTS=1 (dev branch only)");
  process.exit(0);
}

async function main() {
  const { prisma } = await import("../../lib/db");
  const svc = await import("../../lib/auctionService");
  const { getStageState } = await import("../../lib/auctionStage");
  const { approveRegistration } = await import("../../lib/registrationApproval");
  const { findOrCreateFranchise } = await import("../../lib/franchise");

  const tournament = await prisma.tournament.findUniqueOrThrow({ where: { slug: "bfl" } });
  const original = tournament.currentSeasonId;
  const stamp = Date.now();
  const seasonIds: string[] = [];

  async function mkAuction(n: number, teamNames: string[], playerNames: string[]) {
    const season = await prisma.season.create({
      data: { tournamentId: tournament.id, number: 30000 + ((stamp + n) % 9000), name: `ZZ Auction ${n}`, slug: `zz-auc-${stamp}-${n}`, year: 2092, status: "ACTIVE", teamFormation: "AUCTION", squadSizeMin: 2, squadSizeMax: 3 },
    });
    seasonIds.push(season.id);
    const settings = await prisma.auctionSettings.create({ data: { seasonId: season.id, budgetPerTeam: 1000, basePrice: 50, bidIncrement: 10 } });
    const teams = [];
    for (const name of teamNames) teams.push(await prisma.team.create({ data: { seasonId: season.id, name, franchiseId: (await findOrCreateFranchise(tournament.id, name)).id } }));
    for (const [i, name] of playerNames.entries()) {
      const reg = await prisma.registration.create({
        data: { seasonId: season.id, name, affiliation: "x", contact: "x", studentId: `ZZAUC${stamp}${n}${i}`, position: (["GK", "DEF", "MID", "FWD"] as const)[i % 4], source: "ADMIN_MANUAL", status: "APPROVED" },
      });
      await approveRegistration(reg, season);
    }
    const ctx = async () => ({ season: await prisma.season.findUniqueOrThrow({ where: { id: season.id } }), settings: await prisma.auctionSettings.findUniqueOrThrow({ where: { id: settings.id } }), actor: null });
    return { season, teams, ctx };
  }
  const squad = (teamId: string) => prisma.player.count({ where: { teamId, status: "ACTIVE" } });

  try {
    const A = await mkAuction(1, ["ZZ A", "ZZ B", "ZZ C"], ["ZZ P1", "ZZ P2", "ZZ P3", "ZZ P4", "ZZ P5", "ZZ P6", "ZZ P7", "ZZ P8", "ZZ P9"]);
    const [ta, tb, tc] = A.teams;
    await prisma.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: A.season.id } });

    // projector: nothing resolved yet => opening slide
    let stage = await getStageState();
    assert.equal(stage.phase, "opening");
    assert.equal(stage.phase === "opening" && stage.players, 9);

    // ---- live bids ----
    const first = await svc.nextLot(await A.ctx());
    assert.equal(first.player.name.startsWith("ZZ P"), true);
    await assert.rejects(async () => svc.nextLot(await A.ctx()), /Resolve the current lot/);
    await assert.rejects(async () => svc.setBid(await A.ctx(), 40), /at least the base price/);
    await svc.setBid(await A.ctx(), 50); // bids are just amounts — no team is named
    await assert.rejects(async () => svc.setBid(await A.ctx(), 55), /beat 50 by at least 10/);
    await svc.setBid(await A.ctx(), 60);
    assert.equal((await prisma.auctionLot.findUniqueOrThrow({ where: { id: first.id } })).currentBidTeamId, null, "no bidding team is recorded");
    stage = await getStageState();
    assert.ok(stage.phase === "lot" && stage.currentBid === 60 && stage.leader === null, "the projector shows the live bid and no team");
    await svc.clearBid(await A.ctx());
    assert.equal((await prisma.auctionLot.findUniqueOrThrow({ where: { id: first.id } })).currentBid, null);
    await svc.setBid(await A.ctx(), 60);

    // the budget is checked where the team is finally named: the sale
    await assert.rejects(async () => svc.sellLot(await A.ctx(), tb.id, 960), /max allowable bid \(950/);
    await assert.rejects(async () => svc.sellLot(await A.ctx(), tb.id, 40), /at least the base price/);

    // ---- sale: budget + roster + stage result ----
    await svc.sellLot(await A.ctx(), ta.id); // the price defaults to the recorded bid (60)
    const soldLot = await prisma.auctionLot.findUniqueOrThrow({ where: { id: first.id }, include: { player: true } });
    assert.equal(soldLot.status, "SOLD");
    assert.equal(soldLot.player.teamId, ta.id);
    assert.equal(soldLot.player.jerseyNumber, 1);
    stage = await getStageState();
    assert.ok(stage.phase === "result" && stage.kind === "SOLD" && stage.price === 60 && stage.team?.name === "ZZ A");
    stage = await getStageState(new Date(Date.now() + 60_000));
    assert.equal(stage.phase, "between", "the result clears after a few seconds");

    // ---- unsold is the only "not now" outcome; undo puts the player back ----
    const second = await svc.nextLot(await A.ctx());
    await svc.markUnsold(await A.ctx());
    assert.equal((await prisma.auctionLot.findUniqueOrThrow({ where: { id: second.id } })).status, "UNSOLD");
    await svc.undoLast(await A.ctx());
    assert.equal((await prisma.auctionLot.findUniqueOrThrow({ where: { id: second.id } })).status, "QUEUED", "undo puts the player back in the queue");
    await assert.rejects(async () => svc.sellLot(await A.ctx(), ta.id), /No lot is currently up/);
    await svc.nextLot(await A.ctx());
    await assert.rejects(async () => svc.sellLot(await A.ctx(), ta.id), /no bid has been recorded/i);
    await svc.markUnsold(await A.ctx()); // the lot brought up above
    stage = await getStageState();
    assert.ok(stage.phase === "result" && stage.kind === "UNSOLD");
    for (const state of [stage, await getStageState(new Date(Date.now() + 60_000))]) {
      assert.ok(!/budget|remaining|squad/i.test(JSON.stringify(state)), "the projector state carries no budgets or squad data");
    }

    // ---- retained player: free, counts toward the squad, budget untouched ----
    const queued = await prisma.auctionLot.findFirstOrThrow({ where: { seasonId: A.season.id, status: "QUEUED" }, include: { player: true } });
    await svc.assignLot(await A.ctx(), queued.id, tc.id, true);
    assert.equal(await squad(tc.id), 1);
    const statuses = await (await import("../../lib/auction")).getTeamAuctionStatuses((await A.ctx()).season, (await A.ctx()).settings);
    assert.equal(statuses.find((s) => s.teamId === tc.id)!.remainingBudget, 1000, "a free placement costs no budget");
    assert.equal(statuses.find((s) => s.teamId === tc.id)!.squadCount, 1, "squad counts everyone on the team");
    assert.equal(statuses.find((s) => s.teamId === ta.id)!.remainingBudget, 940);

    // ---- squad max is enforced for bids and placements ----
    await svc.assignLot(await A.ctx(), (await prisma.auctionLot.findFirstOrThrow({ where: { seasonId: A.season.id, status: "QUEUED" } })).id, ta.id, true);
    await svc.assignLot(await A.ctx(), (await prisma.auctionLot.findFirstOrThrow({ where: { seasonId: A.season.id, status: "QUEUED" } })).id, ta.id, true);
    assert.equal(await squad(ta.id), 3);
    await assert.rejects(async () => svc.assignLot(await A.ctx(), (await prisma.auctionLot.findFirstOrThrow({ where: { seasonId: A.season.id, status: "QUEUED" } })).id, ta.id, true), /max size/);

    // ---- close is refused while anything is outstanding ----
    const checks = await svc.closeChecks(await A.ctx());
    assert.ok(checks.blockers.some((b) => /still queued/.test(b)) || checks.blockers.some((b) => /minimum/.test(b)), "close is blocked until the queue is done and squads are legal");
    await assert.rejects(async () => svc.closeAuction(await A.ctx()), /Can't close yet/);

    // ---- wrap-up: fair draw to teams below the minimum ----
    const B = await mkAuction(2, ["ZZ X", "ZZ Y"], ["ZZ Q1", "ZZ Q2", "ZZ Q3", "ZZ Q4", "ZZ Q5"]);
    for (let i = 0; i < 5; i++) {
      await svc.nextLot(await B.ctx());
      await svc.markUnsold(await B.ctx());
    }
    assert.equal((await svc.closeChecks(await B.ctx())).blockers.length, 2, "both teams are short of the minimum squad");
    const preview = await svc.drawProposal(await B.ctx(), 5);
    assert.equal(preview.moves.length, 4, "2 teams x 2 needed = 4 placed");
    assert.equal(preview.leftOver, 1);
    assert.deepEqual((await svc.drawProposal(await B.ctx(), 5)).moves, preview.moves, "same seed, same draw");
    const applied = await svc.applyDraw(await B.ctx(), 5);
    assert.equal(applied.placed, 4);
    for (const t of B.teams) assert.equal(await squad(t.id), 2);
    assert.equal((await svc.closeChecks(await B.ctx())).blockers.length, 0);

    // ---- close locks the auction; reopen unlocks ----
    await prisma.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: B.season.id } });
    await svc.closeAuction(await B.ctx());
    assert.ok((await B.ctx()).settings.lockedAt);
    await assert.rejects(async () => svc.nextLot(await B.ctx()), /closed/);
    await assert.rejects(async () => svc.assignLot(await B.ctx(), (await prisma.auctionLot.findFirstOrThrow({ where: { seasonId: B.season.id, status: { in: ["HELD", "UNSOLD"] } } })).id, B.teams[0].id, true), /closed/);
    stage = await getStageState();
    assert.ok(stage.phase === "closing" && stage.squads.length === 2 && stage.squads.every((s) => s.players.length === 2), "the projector shows the final squads");
    await svc.reopenAuction(await B.ctx());
    assert.equal((await B.ctx()).settings.lockedAt, null);

    console.log("✓ auction: team-less live bids, sale-time budget check, unsold/undo, retain, squad-aware budgets, fair draw, close/lock, projector phases");
  } finally {
    await prisma.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: original } });
    for (const seasonId of seasonIds) {
      await prisma.matchEvent.deleteMany({ where: { match: { seasonId } } });
      await prisma.season.delete({ where: { id: seasonId } }).catch((e) => console.error("cleanup", e.message));
    }
    await prisma.person.deleteMany({ where: { name: { startsWith: "ZZ " } } });
    await prisma.franchise.deleteMany({ where: { name: { startsWith: "ZZ " } } });
    await prisma.auditLog.deleteMany({ where: { summary: { contains: "ZZ " } } });
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
