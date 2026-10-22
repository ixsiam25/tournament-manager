// Drives the organiser screens in a real browser with a minted admin session:
// formation board (select + drag/drop, strategy switch, balanced deal), roster
// manager (inline edits, jersey conflict, release/restore), application
// settings. Throwaway ZZ season; restores the tournament pointer afterwards.
// Dev branch only; needs a dev server on :3100.
//
// Run: ALLOW_DB_WRITE_TESTS=1 npm run test:adminui
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

  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN", isActive: true } });
  const tournament = await prisma.tournament.findUniqueOrThrow({ where: { slug: "bfl" } });
  const original = tournament.currentSeasonId;
  const stamp = Date.now();
  const season = await prisma.season.create({
    data: { tournamentId: tournament.id, number: 50000 + (stamp % 9000), name: "ZZ UI Test", slug: `zz-ui-${stamp}`, year: 2095, status: "ACTIVE", teamFormation: "MANUAL", squadSizeMin: 2, squadSizeMax: 3, registrationOpen: true, registrationSelfServeEnabled: true },
  });
  await prisma.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: season.id } });

  const mkTeam = async (name: string) => prisma.team.create({ data: { seasonId: season.id, franchiseId: (await findOrCreateFranchise(tournament.id, name)).id, name } });
  const red = await mkTeam("ZZ Red");
  await mkTeam("ZZ Blue");
  for (const [i, n] of ["ZZ Uno", "ZZ Dos", "ZZ Tres", "ZZ Cuatro"].entries()) {
    const reg = await prisma.registration.create({ data: { seasonId: season.id, name: n, affiliation: "ZZ Batch", contact: "x", studentId: `ZZUI${stamp}${i}`, source: "ADMIN_MANUAL", status: "APPROVED" } });
    await approveRegistration(reg, season);
  }

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 1000 } });
  await ctx.addCookies([{ name: "user_session", value: await createUserSessionToken(admin.id), domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept("ZZ injury"));
  const T = { timeout: 30000 };

  try {
    // ---- formation board ----
    await page.goto(`${base}/admin/formation`);
    await page.getByText("Pool (4)").waitFor(T);
    await page.getByLabel("Move ZZ Uno").selectOption({ label: "ZZ Red" });
    await page.getByText("Pool (3)").waitFor(T);
    assert.equal((await prisma.player.findFirstOrThrow({ where: { name: "ZZ Uno" } })).teamId, red.id);
    assert.equal((await prisma.player.findFirstOrThrow({ where: { name: "ZZ Uno" } })).jerseyNumber, 1);

    // drag & drop a chip onto the other team's column
    const chip = page.locator("li", { hasText: "ZZ Dos" }).first();
    const blueCol = page.locator("section", { has: page.getByRole("heading", { name: /^ZZ Blue/ }) });
    await chip.dragTo(blueCol);
    await page.getByText("Pool (2)").waitFor(T);
    assert.ok((await prisma.player.findFirstOrThrow({ where: { name: "ZZ Dos" } })).teamId, "drag/drop assigned a team");

    // squad size is enforced (max 3) — fill Red, then the 4th is refused with a message
    await page.getByLabel("Move ZZ Tres").selectOption({ label: "ZZ Red" });
    await page.getByText("Pool (1)").waitFor(T);
    await page.getByLabel("Move ZZ Cuatro").selectOption({ label: "ZZ Red" });
    await page.getByText("Pool (0)").waitFor(T);

    // strategy switch + balanced deal on a fresh pool
    await prisma.player.updateMany({ where: { seasonId: season.id }, data: { teamId: null, jerseyNumber: 0 } });
    await page.reload();
    await page.getByText("Pool (4)").waitFor(T);
    await page.locator("select").first().selectOption("BALANCED_RANDOM");
    await page.getByRole("button", { name: "Preview deal" }).waitFor(T);
    await page.getByRole("button", { name: "Preview deal" }).click();
    await page.getByText(/4 placed in the preview/).waitFor(T);
    await page.getByRole("button", { name: "Apply this deal" }).click();
    await page.getByText("Pool (0)").waitFor(T);
    assert.equal(await prisma.player.count({ where: { seasonId: season.id, teamId: { not: null } } }), 4);

    // ---- roster manager ----
    await page.goto(`${base}/admin/players`);
    await page.getByLabel("Name of ZZ Uno").waitFor(T);
    await page.getByLabel("Name of ZZ Uno").fill("ZZ Uno Renamed");
    await page.getByLabel("Name of ZZ Uno").blur();
    await page.getByLabel("Name of ZZ Uno Renamed").waitFor(T);
    assert.equal(await prisma.player.count({ where: { name: "ZZ Uno Renamed" } }), 1);

    // jersey clash is refused with the holder's name
    const a = await prisma.player.findFirstOrThrow({ where: { name: "ZZ Uno Renamed" } });
    const mate = await prisma.player.findFirstOrThrow({ where: { teamId: a.teamId, id: { not: a.id } } });
    await page.getByLabel("Jersey number of ZZ Uno Renamed").fill(String(mate.jerseyNumber));
    await page.getByLabel("Jersey number of ZZ Uno Renamed").blur();
    await page.getByText(new RegExp(`already worn by ${mate.name}`)).waitFor(T);

    // release (dialog accepted) -> hidden by default, visible with the toggle, restore brings back
    const row = page.locator("li", { has: page.getByLabel("Name of ZZ Uno Renamed") });
    await row.getByRole("button", { name: "Release" }).click();
    await page.getByText("ZZ Uno Renamed released.").waitFor(T);
    assert.equal((await prisma.player.findUniqueOrThrow({ where: { id: a.id } })).status, "RELEASED");
    assert.ok((await prisma.player.findUniqueOrThrow({ where: { id: a.id } })).jerseyNumber < 0);
    assert.equal(await page.getByLabel("Name of ZZ Uno Renamed").count(), 0, "released players are hidden by default");
    await page.getByLabel("Show released").check();
    await page.getByLabel("Name of ZZ Uno Renamed").waitFor(T);
    await page.locator("li", { has: page.getByLabel("Name of ZZ Uno Renamed") }).getByRole("button", { name: "Restore" }).click();
    await page.getByText("ZZ Uno Renamed restored.").waitFor(T);
    assert.equal((await prisma.player.findUniqueOrThrow({ where: { id: a.id } })).status, "ACTIVE");

    // ---- application settings ----
    await page.goto(`${base}/admin/settings`);
    await page.getByRole("heading", { name: "Application form" }).waitFor(T);
    await page.getByLabel("Ask Affiliation").uncheck();
    await page.getByRole("button", { name: "+ Add a question" }).click();
    await page.getByLabel("Question text").fill("Strong foot");
    await page.getByLabel("Answer type").selectOption("choice");
    await page.getByLabel("Options").fill("Left, Right");
    await page.getByRole("button", { name: "Save form settings" }).click();
    await page.getByText("Saved. The public form now follows these settings.").waitFor(T);
    const saved = (await prisma.season.findUniqueOrThrow({ where: { id: season.id } })).applicationConfig as { fields: { affiliation: { enabled: boolean } }; questions: { label: string; options: string[] }[] };
    assert.equal(saved.fields.affiliation.enabled, false);
    assert.deepEqual(saved.questions.map((q) => [q.label, q.options]), [["Strong foot", ["Left", "Right"]]]);
    // an invalid config (choice with one option) is rejected by the server
    await page.getByLabel("Options").fill("Only");
    await page.getByRole("button", { name: "Save form settings" }).click();
    await page.getByText(/needs at least two options/).waitFor(T);

    assert.deepEqual(errors, [], "no uncaught page errors");
    console.log("✓ admin UI: formation board (select, drag/drop, limits, strategy, balanced deal), roster manager (edit, clash, release/restore), application settings");
  } finally {
    await browser.close();
    await prisma.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: original } });
    await prisma.matchEvent.deleteMany({ where: { match: { seasonId: season.id } } });
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
