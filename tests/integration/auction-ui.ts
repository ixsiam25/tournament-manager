// The auctioneer's console driving the projector view in a real browser:
// next lot, live bid, sold-to-leader, hold, wrap-up draw, then the closed
// state. (Password-gated actions — undo, close — are covered at service level.)
// Throwaway ZZ season; dev branch only; needs a dev server on :3100.
// Run: ALLOW_DB_WRITE_TESTS=1 npm run test:auctionui
import assert from "node:assert/strict";
import { config } from "dotenv";
import { chromium } from "playwright-core";
config({ path: ".env.local" });

if (process.env.ALLOW_DB_WRITE_TESTS !== "1") {
  console.log("skipped: set ALLOW_DB_WRITE_TESTS=1 (dev branch only)");
  process.exit(0);
}
const base = process.env.SMOKE_BASE_URL ?? "http://localhost:3100";

async function main() {
  const { prisma } = await import("../../lib/db");
  const { createUserSessionToken } = await import("../../lib/userAuth");
  const { approveRegistration } = await import("../../lib/registrationApproval");
  const { findOrCreateFranchise } = await import("../../lib/franchise");
  const svc = await import("../../lib/auctionService");

  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN", isActive: true } });
  const tournament = await prisma.tournament.findUniqueOrThrow({ where: { slug: "bfl" } });
  const original = tournament.currentSeasonId;
  const stamp = Date.now();
  const season = await prisma.season.create({
    data: { tournamentId: tournament.id, number: 20000 + (stamp % 9000), name: "ZZ Auction UI", slug: `zz-aucui-${stamp}`, year: 2091, status: "ACTIVE", teamFormation: "AUCTION", squadSizeMin: 2, squadSizeMax: 3 },
  });
  const settings = await prisma.auctionSettings.create({ data: { seasonId: season.id, budgetPerTeam: 1000, basePrice: 50, bidIncrement: 10 } });
  await prisma.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: season.id } });
  const teams = [];
  for (const name of ["ZZ Reds", "ZZ Blues"]) teams.push(await prisma.team.create({ data: { seasonId: season.id, name, franchiseId: (await findOrCreateFranchise(tournament.id, name)).id } }));
  for (const [i, name] of ["ZZ Ana", "ZZ Ben", "ZZ Cat", "ZZ Dan"].entries()) {
    const reg = await prisma.registration.create({ data: { seasonId: season.id, name, affiliation: "x", contact: "x", studentId: `ZZAUCUI${stamp}${i}`, source: "ADMIN_MANUAL", status: "APPROVED" } });
    await approveRegistration(reg, season);
  }

  const browser = await chromium.launch();
  const adminCtx = await browser.newContext({ viewport: { width: 1200, height: 1100 } });
  await adminCtx.addCookies([{ name: "user_session", value: await createUserSessionToken(admin.id), domain: "localhost", path: "/" }]);
  const console_ = await adminCtx.newPage();
  const stage = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage(); // anonymous, like the room's projector
  const errors: string[] = [];
  for (const p of [console_, stage]) p.on("pageerror", (e) => errors.push(e.message));
  const T = { timeout: 30000 };

  try {
    await stage.goto(`${base}/stage/auction`);
    await stage.getByText("The auction begins").waitFor(T);

    await console_.goto(`${base}/admin/auction`);
    await console_.getByRole("button", { name: "Next lot" }).click();
    await console_.getByText("Record a bid").waitFor(T);
    const onTheBlock = (await console_.locator("p.text-lg.font-bold").first().innerText()).trim();
    await stage.locator('[data-phase="lot"]').waitFor(T);
    await stage.getByText(onTheBlock.toUpperCase(), { exact: false }).first().waitFor(T);
    assert.equal((await stage.getByTestId("stage-bid").innerText()).trim(), "50", "opening price shows until someone bids");

    // a bid recorded on the console appears on the projector with its leader
    await console_.getByLabel("Bidding team").selectOption(teams[1].id);
    await console_.getByLabel("Bid amount").fill("70");
    await console_.getByRole("button", { name: "Record bid" }).click();
    await console_.getByTestId("leading-bid").filter({ hasText: "70" }).waitFor(T);
    await stage.getByTestId("stage-bid").filter({ hasText: "70" }).waitFor(T);
    await stage.getByText("ZZ Blues").first().waitFor(T);
    // a too-small raise is refused with the rule explained
    await console_.getByLabel("Bidding team").selectOption(teams[0].id);
    await console_.getByLabel("Bid amount").fill("75");
    await console_.getByRole("button", { name: "Record bid" }).click();
    await console_.getByText(/beat 70 by at least 10/).waitFor(T);

    // sell to the leader in one click -> SOLD stamp on the projector
    await console_.getByRole("button", { name: /Sold to ZZ Blues for 70/ }).click();
    await stage.getByTestId("stage-result").getByText("Sold", { exact: true }).waitFor(T);
    await stage.getByText("for 70").waitFor(T);
    const sold = await prisma.auctionLot.findFirstOrThrow({ where: { seasonId: season.id, status: "SOLD" } });
    assert.equal(sold.soldPrice, 70);
    assert.equal(sold.soldToTeamId, teams[1].id);

    // hold the next one: it shows "On hold" and appears in the held list
    await console_.getByRole("button", { name: "Next lot" }).click();
    await console_.getByRole("button", { name: "Hold till the end" }).click();
    await stage.getByTestId("stage-result").getByText("On hold").waitFor(T);
    await console_.getByText("On hold (1)").waitFor(T);
    assert.equal(await prisma.auctionLot.count({ where: { seasonId: season.id, status: "HELD" } }), 1);

    // retain a queued player with a team from the "Up next" list
    const upNext = console_.locator("ol");
    await upNext.getByLabel(/Place ZZ \w+ with/).first().selectOption(teams[0].id);
    await upNext.getByRole("button", { name: "Retain" }).first().click();
    // wait for the retain to land (squad text alone matches the other team too)
    for (let i = 0; i < 60; i++) {
      if (await prisma.auctionLot.count({ where: { seasonId: season.id, status: "SOLD", soldPrice: 0, soldToTeamId: teams[0].id } })) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    assert.equal(await prisma.auctionLot.count({ where: { seasonId: season.id, status: "SOLD", soldPrice: 0, soldToTeamId: teams[0].id } }), 1, "the retained player is placed with Reds at no charge");

    // run the remaining lots out so the wrap-up appears
    for (const lot of await prisma.auctionLot.findMany({ where: { seasonId: season.id, status: "QUEUED" } })) {
      await svc.nextLot({ season, settings, actor: null });
      await svc.markUnsold({ season, settings, actor: null });
      void lot;
    }
    await console_.reload();
    await console_.getByRole("heading", { name: "Wrap-up" }).waitFor(T);
    await console_.getByRole("button", { name: "Preview fair draw" }).click();
    await console_.getByText(/placed/).first().waitFor(T);
    await console_.getByRole("button", { name: "Apply this draw" }).click();
    await console_.getByText("Draw applied.").waitFor(T);
    await console_.getByText("Every team has a legal squad — ready to close.").waitFor(T);
    for (const t of teams) assert.ok((await prisma.player.count({ where: { teamId: t.id, status: "ACTIVE" } })) >= 2, "both teams reach the minimum squad");

    // closing (service: the UI button asks for the admin password) -> final squads on the projector, console shows closed
    await svc.closeAuction({ season, settings: await prisma.auctionSettings.findUniqueOrThrow({ where: { id: settings.id } }), actor: null });
    await stage.getByTestId("stage-closing").waitFor(T);
    await stage.getByText("Final squads").waitFor(T);
    await console_.reload();
    await console_.getByText(/The auction is closed/).waitFor(T);
    assert.equal(await console_.getByRole("button", { name: "Next lot" }).isDisabled(), true, "a closed auction can't continue");

    assert.deepEqual(errors, [], "no uncaught page errors");
    console.log("✓ auction UI: console drives the projector (lot, live bid, sold, hold), retain, wrap-up draw, closed state");
  } finally {
    await browser.close();
    await prisma.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: original } });
    await prisma.season.delete({ where: { id: season.id } });
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
