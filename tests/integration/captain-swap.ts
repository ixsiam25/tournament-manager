// Captains + team deletion: changing a captain returns the previous (captain-only) one to the pool and
// the auction queue; real squad members just lose the armband; deleting a team keeps its players
// (back in the pool and queue); approved players missing from the season can be restored.
// Throwaway ZZ season; dev/test branch only. Run: ALLOW_DB_WRITE_TESTS=1 npm run test:captains
import assert from "node:assert/strict";
import { config } from "dotenv";
import { chromium } from "playwright-core";
config({ path: process.env.TEST_ENV_FILE ?? ".env.local" });

if (process.env.ALLOW_DB_WRITE_TESTS !== "1") {
  console.log("skipped: set ALLOW_DB_WRITE_TESTS=1 (dev/test branch only)");
  process.exit(0);
}
const base = process.env.SMOKE_BASE_URL ?? "http://localhost:3100";

async function main() {
  const { prisma } = await import("../../lib/db");
  const { createUserSessionToken } = await import("../../lib/userAuth");
  const { approveRegistration } = await import("../../lib/registrationApproval");
  const { findOrCreateFranchise } = await import("../../lib/franchise");
  const { batchLabelForSemester } = await import("../../lib/batch");
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN", isActive: true } });
  const token = await createUserSessionToken(admin.id);
  const cookie = { Cookie: `user_session=${token}`, "Content-Type": "application/json" };
  const tournament = await prisma.tournament.findUniqueOrThrow({ where: { slug: "bfl" } });
  const original = tournament.currentSeasonId;
  const stamp = Date.now();
  const season = await prisma.season.create({
    data: { tournamentId: tournament.id, number: 9200 + (stamp % 90), name: "ZZ Captain Season", slug: `zz-cap2-${stamp}`, year: 2078, status: "ACTIVE", teamFormation: "AUCTION", squadSizeMin: 2, squadSizeMax: 6 },
  });
  await prisma.auctionSettings.create({ data: { seasonId: season.id, budgetPerTeam: 1000, basePrice: 50, bidIncrement: 10 } });
  await prisma.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: season.id } });
  const team = await prisma.team.create({ data: { seasonId: season.id, name: "ZZ Captain FC", franchiseId: (await findOrCreateFranchise(tournament.id, "ZZ Captain FC")).id } });
  const mk = async (name: string, i: number) => {
    const reg = await prisma.registration.create({ data: { seasonId: season.id, name, affiliation: batchLabelForSemester(3), contact: "x", studentId: `ZZCP${stamp}${i}`, position: "MID", source: "SELF_SERVE", status: "APPROVED" } });
    await approveRegistration(reg, season);
    return prisma.player.findFirstOrThrow({ where: { seasonId: season.id, name } });
  };
  const [a, b, c, d] = [await mk("ZZ Cap A", 1), await mk("ZZ Cap B", 2), await mk("ZZ Cap C", 3), await mk("ZZ Bought D", 4)];
  const api = (p: string, method = "GET", body?: unknown) => fetch(base + p, { method, headers: cookie, body: body === undefined ? undefined : JSON.stringify(body) });
  const player = (id: string) => prisma.player.findUniqueOrThrow({ where: { id } });
  const lot = (playerId: string) => prisma.auctionLot.findUniqueOrThrow({ where: { playerId } });
  const setCaptain = (playerId: string | null) => api(`/api/admin/teams/${team.id}/captain`, "POST", { playerId });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 1300 } });
  await ctx.addCookies([{ name: "user_session", value: token, domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  page.on("dialog", (dlg) => dlg.accept());
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const T = { timeout: 30000 };

  try {
    // ---- pick A as captain: placed for free, lot closed out ----
    assert.equal((await setCaptain(a.id)).status, 200);
    let pa = await player(a.id);
    assert.deepEqual([pa.teamId, pa.isCaptain, pa.placedAsCaptain], [team.id, true, true]);
    assert.equal((await lot(a.id)).status, "SOLD");

    // ---- change to B: A goes back to the pool and the queue; B is the captain ----
    assert.equal((await setCaptain(b.id)).status, 200);
    pa = await player(a.id);
    assert.deepEqual([pa.teamId, pa.isCaptain, pa.placedAsCaptain, pa.jerseyNumber], [null, false, false, 0], "the previous captain is available again");
    assert.equal((await lot(a.id)).status, "QUEUED", "…and can be bid for again");
    const pb = await player(b.id);
    assert.deepEqual([pb.teamId, pb.isCaptain], [team.id, true]);
    const onTeam = await prisma.player.count({ where: { teamId: team.id } });
    assert.equal(onTeam, 1, "only one player is on the team — the new captain is not added on top of the old one");
    const pool = (await (await api("/api/admin/season/teams")).json()).pool as { name: string }[];
    assert.ok(pool.some((p) => p.name === "ZZ Cap A"), "the previous captain shows up as available");

    // ---- clearing the captain returns a captain-only placement too ----
    assert.equal((await setCaptain(null)).status, 200);
    assert.equal((await player(b.id)).teamId, null);
    assert.equal((await lot(b.id)).status, "QUEUED");

    // ---- a real squad member (bought) who is captain keeps their place when the captain changes ----
    await prisma.player.update({ where: { id: d.id }, data: { teamId: team.id, jerseyNumber: 9 } });
    await prisma.auctionLot.update({ where: { playerId: d.id }, data: { status: "SOLD", soldToTeamId: team.id, soldPrice: 120, soldAt: new Date() } });
    assert.equal((await setCaptain(d.id)).status, 200);
    assert.equal((await player(d.id)).placedAsCaptain, false);
    assert.equal((await setCaptain(c.id)).status, 200);
    const pd = await player(d.id);
    assert.deepEqual([pd.teamId, pd.isCaptain], [team.id, false], "a bought player stays on the team");
    assert.equal((await lot(d.id)).status, "SOLD");

    // ---- deleting the team keeps its players: back in the pool and the auction queue ----
    assert.equal((await api(`/api/admin/teams/${team.id}`, "DELETE")).status, 200);
    for (const [p, label] of [[c, "captain C"], [d, "bought D"]] as const) {
      const after = await player(p.id);
      assert.deepEqual([after.teamId, after.isCaptain, after.status], [null, false, "ACTIVE"], `${label} survives the team's deletion`);
      assert.equal((await lot(p.id)).status, "QUEUED", `${label} is back in the auction queue`);
    }

    // ---- players lost to an older delete can be restored ----
    await prisma.player.delete({ where: { id: c.id } }); // what the old cascade did
    await page.goto(`${base}/admin/season/teams`);
    const banner = page.getByTestId("missing-players");
    await banner.waitFor(T);
    assert.match(await banner.innerText(), /1 approved player is missing/);
    await banner.getByRole("button", { name: /Restore this player/ }).click();
    await banner.waitFor({ state: "detached", ...T });
    const back = await prisma.player.findFirstOrThrow({ where: { seasonId: season.id, name: "ZZ Cap C" } });
    assert.equal(back.teamId, null);
    assert.equal((await lot(back.id)).status, "QUEUED", "restored players are queued for the auction");

    assert.deepEqual(errors, [], "no uncaught page errors");
    console.log("✓ captains: swapping returns the old captain to the pool/queue, members keep their place, team delete keeps players, missing players restorable");
  } finally {
    await browser.close();
    await prisma.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: original } });
    await prisma.season.delete({ where: { id: season.id } }).catch((e) => console.error("cleanup", e.message));
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
