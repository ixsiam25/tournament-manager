// The organiser's whole season lifecycle, as described by the people who run it:
//   create season -> applications open -> registration closes, organiser reviews
//   -> confirms applicants and CHOOSES team formation -> teams form by batch ->
//   the rest of the system.
// Batches ("Fall 25") are turned into current semesters / alumni automatically.
// Dev branch only; needs a dev server on :3100. Run: ALLOW_DB_WRITE_TESTS=1 npm run test:seasonflow
import assert from "node:assert/strict";
import { config } from "dotenv";
import { chromium, type Page } from "playwright-core";
import { batchInfo } from "../../lib/batch";
config({ path: process.env.TEST_ENV_FILE ?? ".env.local" });

if (process.env.ALLOW_DB_WRITE_TESTS !== "1") {
  console.log("skipped: set ALLOW_DB_WRITE_TESTS=1 (dev branch only)");
  process.exit(0);
}
const base = process.env.SMOKE_BASE_URL ?? "http://localhost:3100";

async function main() {
  const { prisma } = await import("../../lib/db");
  const { createUserSessionToken } = await import("../../lib/userAuth");

  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN", isActive: true } });
  const cookie = `user_session=${await createUserSessionToken(admin.id)}`;
  const tournament = await prisma.tournament.findUniqueOrThrow({ where: { slug: "bfl" } });
  const originalPointer = tournament.currentSeasonId;
  const stamp = Date.now();
  let seasonId: string | null = null;

  const browser = await chromium.launch();
  const T = { timeout: 30000 };
  const errors: string[] = [];
  const mk = async (adminSession: boolean) => {
    const ctx = await browser.newContext({ viewport: { width: 1300, height: 1100 } });
    if (adminSession) await ctx.addCookies([{ name: "user_session", value: cookie.split("=")[1], domain: "localhost", path: "/" }]);
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    return p;
  };
  const step = (page: Page, key: string) => page.locator(`[data-step="${key}"]`);

  try {
    // ---- 1. admin creates the new season (the wizard's endpoint) ----
    const create = await fetch(`${base}/api/admin/season/rollover/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        number: 5000 + (stamp % 900), name: "ZZ Flow Season", slug: `zz-flow-${stamp}`, year: 2089, teamFormation: "UNDECIDED",
        squadSizeMin: 1, squadSizeMax: 5, registrationSelfServeEnabled: true, registrationExcelImportEnabled: true, openRegistrationNow: true,
        formatConfig: { matchFormat: "SINGLE_ROUND_ROBIN", knockoutStructure: "NONE", matchDurationMinutes: 7, bufferMinutes: 3, dayStartTime: "17:00", pitches: [{ name: "Field 1" }] },
      }),
    });
    assert.equal(create.status, 201, "season is created");
    const season = await prisma.season.findFirstOrThrow({ where: { slug: `zz-flow-${stamp}` } });
    seasonId = season.id;
    assert.equal(season.registrationOpen, true, "creating the season opens the application portal");
    assert.equal(season.teamFormation, "UNDECIDED", "team formation is NOT decided yet");
    assert.equal((await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } })).currentSeasonId, season.id, "the new season becomes the current one");

    // ---- 2. the organiser's checklist shows applications as the thing to do ----
    const adminPage = await mk(true);
    await adminPage.goto(`${base}/admin/season`);
    await step(adminPage, "applications").waitFor(T);
    assert.equal(await step(adminPage, "created").getAttribute("data-status"), "done");
    assert.equal(await step(adminPage, "applications").getAttribute("data-status"), "current");
    assert.equal(await step(adminPage, "formation").getAttribute("data-status"), "todo");
    await adminPage.getByText("Open · 0 application(s)").waitFor(T);

    // ---- 3. players apply with their batch ----
    const applicants: [string, "FALL" | "SPRING", number][] = [
      ["ZZ Flow Anan", "FALL", 2025], ["ZZ Flow Bashir", "FALL", 2025], ["ZZ Flow Chitra", "SPRING", 2024],
      ["ZZ Flow Dipu", "SPRING", 2023], ["ZZ Flow Eshita", "SPRING", 2020], ["ZZ Flow Farhan", "FALL", 2018],
    ];
    for (const [i, [name, term, year]] of applicants.entries()) {
      const p = await mk(false);
      await p.goto(`${base}/register`);
      await p.getByLabel("Student ID").waitFor(T);
      await p.locator("input").first().fill(name);
      await p.getByLabel("Student ID").fill(`ZZF${stamp}${i}`);
      await p.getByLabel("Batch term").selectOption(term);
      await p.getByLabel("Batch year").selectOption(String(year));
      const info = batchInfo(`${term === "FALL" ? "Fall" : "Spring"} ${String(year % 100).padStart(2, "0")}`);
      assert.ok(info.valid);
      assert.match(await p.getByTestId("batch-status").innerText(), new RegExp(info.status === "alumni" ? "Alumni" : info.text), "the form shows what the batch means today");
      await p.getByLabel("Contact").fill("090-0000-0000");
      await p.getByRole("button", { name: "Submit application" }).click();
      await p.getByLabel("Your private edit link").waitFor(T);
      await p.context().close();
    }
    assert.equal(await prisma.registration.count({ where: { seasonId: season.id, status: "PENDING" } }), 6);

    // ---- 4. registration closes; applications are still waiting for review ----
    await adminPage.reload();
    await adminPage.getByText(/6 application\(s\): 6 waiting for review/).waitFor(T);
    await adminPage.getByRole("button", { name: "Close registration" }).click();
    await adminPage.getByText(/^Closed · 6 application/).waitFor(T);
    assert.equal((await (await fetch(`${base}/api/register`)).json()).open, false, "the public form is closed");
    assert.equal(await step(adminPage, "applications").getAttribute("data-status"), "current", "still current: 6 await review");
    assert.equal(await step(adminPage, "formation").getAttribute("data-status"), "todo");

    // ---- 5. the organiser reviews and approves ----
    await adminPage.goto(`${base}/admin/registrations`);
    await adminPage.getByText("ZZ Flow Anan").waitFor(T);
    assert.ok((await adminPage.locator("li", { hasText: "ZZ Flow Eshita" }).innerText()).includes("Alumni"), "the review list shows alumni");
    assert.ok((await adminPage.locator("li", { hasText: "ZZ Flow Bashir" }).innerText()).match(/\d+(st|nd|rd|th) semester/), "and the current semester");
    for (const box of await adminPage.locator('li input[type="checkbox"]').all()) await box.check();
    await adminPage.getByRole("button", { name: /Approve 6 selected/ }).click();
    for (let i = 0; i < 40 && (await prisma.player.count({ where: { seasonId: season.id } })) < 6; i++) await new Promise((r) => setTimeout(r, 500));
    assert.equal(await prisma.player.count({ where: { seasonId: season.id } }), 6);

    await adminPage.goto(`${base}/admin/season`);
    await step(adminPage, "formation").waitFor(T);
    assert.equal(await step(adminPage, "applications").getAttribute("data-status"), "done");
    assert.equal(await step(adminPage, "formation").getAttribute("data-status"), "current");

    // ---- 6. confirm applicants and CHOOSE the formation ----
    await adminPage.getByRole("link", { name: "Confirm & choose formation" }).click();
    await adminPage.getByText("Confirm applicants & choose how teams are formed").waitFor(T);
    assert.equal(await adminPage.getByText("Pool (").count(), 0, "no board until a strategy is chosen");
    await adminPage.getByRole("button", { name: "Choose By batch (Fall/Spring intake)" }).click();
    await adminPage.getByText("Pool (6)").waitFor(T);
    assert.equal((await prisma.season.findUniqueOrThrow({ where: { id: season.id } })).teamFormation, "BATCH");
    await adminPage.getByRole("button", { name: "Group by batch" }).click();
    await adminPage.getByText("Pool (0)").waitFor(T);

    // teams: one per batch with the computed semester; alumni merged
    const teams = await prisma.team.findMany({ where: { seasonId: season.id }, include: { _count: { select: { players: true } } } });
    const byName = Object.fromEntries(teams.map((t) => [t.name, t]));
    assert.deepEqual(Object.keys(byName).sort(), ["Alumni", "Fall 25", "Spring 23", "Spring 24"]);
    for (const label of ["Fall 25", "Spring 24", "Spring 23"]) {
      const info = batchInfo(label);
      assert.ok(info.valid && info.status === "student");
      assert.equal(byName[label].semester, info.semester, `${label} team carries its current semester`);
    }
    assert.equal(byName["Fall 25"]._count.players, 2);
    assert.equal(byName["Alumni"]._count.players, 2, "Spring 20 + Fall 18 -> one Alumni team");
    assert.equal(byName["Alumni"].semester, null);

    // ---- 7. the checklist moves on to the rest of the system ----
    await adminPage.goto(`${base}/admin/season`);
    await step(adminPage, "fixtures").waitFor(T);
    assert.equal(await step(adminPage, "formation").getAttribute("data-status"), "done");
    assert.equal(await step(adminPage, "teams").getAttribute("data-status"), "done", "4 teams, nobody left in the pool");
    assert.equal(await step(adminPage, "fixtures").getAttribute("data-status"), "current", "next: fixtures");

    assert.deepEqual(errors, [], "no uncaught page errors");
    console.log("✓ season flow: create → apply (batch) → close → review → choose formation → teams by batch → fixtures next");
  } finally {
    await browser.close();
    await prisma.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: originalPointer } });
    if (seasonId) {
      await prisma.matchEvent.deleteMany({ where: { match: { seasonId } } });
      await prisma.season.delete({ where: { id: seasonId } });
    }
    await prisma.person.deleteMany({ where: { name: { startsWith: "ZZ " } } });
    await prisma.franchise.deleteMany({ where: { name: { in: ["Alumni", "Spring 23", "Spring 24", "Fall 25"] }, teams: { none: {} } } });
    await prisma.auditLog.deleteMany({ where: { summary: { contains: "ZZ " } } });
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
