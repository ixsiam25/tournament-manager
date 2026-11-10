// Removing a player (injury/withdrawal) at any stage, and knowing why the form is closed:
// pool players leave the pool + auction queue, squad players are released, the place is freed
// for the application limit, removal is reinstatable; a passed closing time is explained and fixable.
// Throwaway ZZ season; dev/test branch only. Run: ALLOW_DB_WRITE_TESTS=1 npm run test:removal
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
  const { DEFAULT_APPLICATION_CONFIG } = await import("../../lib/applicationConfig");
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN", isActive: true } });
  const token = await createUserSessionToken(admin.id);
  const cookie = { Cookie: `user_session=${token}`, "Content-Type": "application/json" };
  const tournament = await prisma.tournament.findUniqueOrThrow({ where: { slug: "bfl" } });
  const original = tournament.currentSeasonId;
  const stamp = Date.now();
  const season = await prisma.season.create({
    data: {
      tournamentId: tournament.id, number: 9300 + (stamp % 90), name: "ZZ Removal Season", slug: `zz-rem-${stamp}`, year: 2079, status: "ACTIVE", teamFormation: "AUCTION",
      registrationOpen: true, registrationSelfServeEnabled: true, squadSizeMin: 2, squadSizeMax: 5,
      applicationDeadline: new Date(Date.now() - 4 * 86_400_000), // passed four days ago
      applicationConfig: { ...DEFAULT_APPLICATION_CONFIG, maxApplications: 3 },
    },
  });
  await prisma.auctionSettings.create({ data: { seasonId: season.id, budgetPerTeam: 1000, basePrice: 50, bidIncrement: 10 } });
  await prisma.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: season.id } });
  const team = await prisma.team.create({ data: { seasonId: season.id, name: "ZZ Removal FC", franchiseId: (await findOrCreateFranchise(tournament.id, "ZZ Removal FC")).id } });
  const regs = [];
  for (const [i, name] of ["ZZ Pool Player", "ZZ Squad Player", "ZZ Third"].entries()) {
    const reg = await prisma.registration.create({ data: { seasonId: season.id, name, affiliation: batchLabelForSemester(3), contact: "x", studentId: `ZZRM${stamp}${i}`, position: "MID", source: "SELF_SERVE", status: "APPROVED" } });
    await approveRegistration(reg, season);
    regs.push(await prisma.registration.findUniqueOrThrow({ where: { id: reg.id } }));
  }
  const [poolReg, squadReg] = regs;
  const playerOf = (r: { personId: string | null }) => prisma.player.findFirstOrThrow({ where: { seasonId: season.id, personId: r.personId! } });
  const squadPlayer = await playerOf(squadReg);
  await prisma.player.update({ where: { id: squadPlayer.id }, data: { teamId: team.id, jerseyNumber: 7 } });
  await prisma.auctionLot.updateMany({ where: { playerId: squadPlayer.id }, data: { status: "SOLD" } });

  const publicStatus = async () => (await (await fetch(`${base}/api/register`, { cache: "no-store" })).json()) as { open: boolean; full: boolean; closedReason: string | null; cap: number | null };
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 1400 } });
  await ctx.addCookies([{ name: "user_session", value: token, domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const T = { timeout: 30000 };

  try {
    // ---- the form is closed because the closing time passed — and the admin is told so ----
    const s0 = await publicStatus();
    assert.deepEqual([s0.open, s0.full, s0.closedReason], [false, false, "deadline"], "closed by the deadline, not by the limit");
    await page.goto(`${base}/admin/settings`);
    const card = page.getByTestId("apply-status");
    await card.getByRole("button", { name: "Remove the closing time" }).waitFor(T);
    assert.match(await card.innerText(), /has passed/);
    assert.match(await card.innerText(), /Raising the limit does not reopen/);
    await card.getByRole("button", { name: "Remove the closing time" }).click();
    await card.getByText(/The public form is closed right now/).waitFor({ state: "detached", ...T }).catch(() => {});
    // limit 3 and 3 approved applications → now closed only because it's full
    const s1 = await publicStatus();
    assert.deepEqual([s1.open, s1.full, s1.closedReason], [false, true, "full"]);
    await card.getByText(/limit is reached \(3 of 3\)/).waitFor(T);

    // ---- remove a POOL player through the UI: out of the pool and the auction queue, place freed ----
    await page.goto(`${base}/admin/registrations`);
    await page.getByRole("button", { name: "All", exact: true }).click();
    await page.getByRole("button", { name: "Edit ZZ Pool Player" }).click();
    const rem = page.getByTestId("remove-player");
    await rem.waitFor(T);
    await rem.getByLabel("Reason for removing").fill("injured");
    await rem.getByRole("button", { name: "Remove player" }).click();
    await page.getByText("Removed", { exact: true }).first().waitFor(T);
    const poolReg2 = await prisma.registration.findUniqueOrThrow({ where: { id: poolReg.id } });
    assert.deepEqual([poolReg2.status, poolReg2.notes], ["REJECTED", "Removed by admin: injured"]);
    const poolPlayer = await playerOf(poolReg);
    assert.equal(poolPlayer.status, "RELEASED");
    assert.equal(await prisma.auctionLot.count({ where: { playerId: poolPlayer.id } }), 0, "their auction slot is gone");
    const s2 = await publicStatus();
    assert.equal(s2.full, false, "the place was freed (2 of 3)");

    // ---- remove a SQUAD player: released, shirt number freed ----
    const r2 = await fetch(`${base}/api/admin/registrations/${squadReg.id}/remove`, { method: "POST", headers: cookie, body: JSON.stringify({ reason: "withdrew" }) });
    assert.equal(r2.status, 200);
    const sp = await prisma.player.findUniqueOrThrow({ where: { id: squadPlayer.id } });
    assert.deepEqual([sp.status, sp.jerseyNumber < 0, sp.isCaptain], ["RELEASED", true, false]);
    assert.equal((await fetch(`${base}/api/admin/registrations/${squadReg.id}/remove`, { method: "DELETE", headers: cookie })).status, 409, "a squad player is restored from the Players page");
    assert.equal((await fetch(`${base}/api/admin/registrations/${poolReg.id}/remove`, { method: "POST", headers: cookie })).status, 409, "can't remove twice");

    // ---- reinstate the pool player: back in the pool and the auction queue ----
    await page.reload();
    await page.getByRole("button", { name: "All", exact: true }).click();
    await page.getByRole("button", { name: "Edit ZZ Pool Player" }).click();
    await page.getByTestId("reinstate-player").getByRole("button", { name: "Reinstate player" }).click();
    await page.getByTestId("reinstate-player").waitFor({ state: "detached", ...T });
    assert.equal((await prisma.registration.findUniqueOrThrow({ where: { id: poolReg.id } })).status, "APPROVED");
    assert.equal((await playerOf(poolReg)).status, "ACTIVE");
    assert.equal((await prisma.auctionLot.findFirstOrThrow({ where: { playerId: poolPlayer.id } })).status, "QUEUED", "queued for the auction again");

    // pending applications can't be 'removed' — they are rejected instead
    const pend = await prisma.registration.create({ data: { seasonId: season.id, name: "ZZ Pending One", affiliation: batchLabelForSemester(2), contact: "x", source: "SELF_SERVE", status: "PENDING" } });
    assert.equal((await fetch(`${base}/api/admin/registrations/${pend.id}/remove`, { method: "POST", headers: cookie })).status, 409);
    assert.equal((await fetch(`${base}/api/admin/registrations/${poolReg.id}/remove`, { method: "POST" })).status, 401, "needs an admin login");

    assert.deepEqual(errors, [], "no uncaught page errors");
    console.log("✓ player removal: pool + squad players removed, place freed, reinstate, closed-because-deadline explained and fixable");
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
