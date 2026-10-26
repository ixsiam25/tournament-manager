// The whole player journey in a real browser, with real photo storage:
//   apply (photo + background removal) -> organiser approves -> player is in the
//   pool with photo + cut-out + framing -> organiser rates -> formation deals
//   teams -> public card gallery shows the cut-out card and it downloads.
// Throwaway ZZ season; dev branch only; needs a dev server on :3100.
// Run: ALLOW_DB_WRITE_TESTS=1 npm run test:journey
import assert from "node:assert/strict";
import fs from "node:fs";
import { config } from "dotenv";
import { chromium } from "playwright-core";
config({ path: process.env.TEST_ENV_FILE ?? ".env.local" });

if (process.env.ALLOW_DB_WRITE_TESTS !== "1") {
  console.log("skipped: set ALLOW_DB_WRITE_TESTS=1 (dev branch only)");
  process.exit(0);
}
const base = process.env.SMOKE_BASE_URL ?? "http://localhost:3100";

async function main() {
  const { prisma } = await import("../../lib/db");
  const { createUserSessionToken } = await import("../../lib/userAuth");
  const { findOrCreateFranchise } = await import("../../lib/franchise");

  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN", isActive: true } });
  const tournament = await prisma.tournament.findUniqueOrThrow({ where: { slug: "bfl" } });
  const original = tournament.currentSeasonId;
  const stamp = Date.now();
  const season = await prisma.season.create({
    data: { tournamentId: tournament.id, number: 10000 + (stamp % 9000), name: "ZZ Journey", slug: `zz-journey-${stamp}`, year: 2090, status: "ACTIVE", teamFormation: "BALANCED_RANDOM", squadSizeMin: 2, squadSizeMax: 3, registrationOpen: true, registrationSelfServeEnabled: true },
  });
  await prisma.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: season.id } });
  for (const name of ["ZZ Journey Reds", "ZZ Journey Blues"]) await prisma.team.create({ data: { seasonId: season.id, name, franchiseId: (await findOrCreateFranchise(tournament.id, name)).id } });

  const photos = fs.readdirSync("public/photos").filter((f) => f.startsWith("cmrx") && f.endsWith(".jpg"));
  const browser = await chromium.launch();
  const T = { timeout: 30000 };
  const errors: string[] = [];
  const newPage = async (admin_ = false) => {
    const ctx = await browser.newContext({ viewport: { width: 1300, height: 1100 }, acceptDownloads: true });
    if (admin_) await ctx.addCookies([{ name: "user_session", value: await createUserSessionToken(admin.id), domain: "localhost", path: "/" }]);
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    return p;
  };

  try {
    // ---- 1. four players apply; the first with a photo ----
    const applicants = [
      { name: "ZZ Journey Alif", position: "FWD", photo: photos[0] },
      { name: "ZZ Journey Bina", position: "GK", photo: null },
      { name: "ZZ Journey Chowdhury", position: "DEF", photo: null },
      { name: "ZZ Journey Dola", position: "MID", photo: null },
    ];
    let editLink = "";
    for (const [i, a] of applicants.entries()) {
      const page = await newPage();
      await page.goto(`${base}/register`);
      await page.getByLabel("Student ID").waitFor(T);
      await page.locator("input").first().fill(a.name);
      await page.getByLabel("Student ID").fill(`ZZJ${stamp}${i}`);
      await page.getByLabel("Batch term").selectOption(i % 2 ? "SPRING" : "FALL");
      await page.getByLabel("Batch year").selectOption(i % 2 ? "2025" : "2024");
      await page.getByLabel("Contact").fill("090-1111-2222");
      await page.getByLabel("Preferred position").selectOption(a.position);
      if (a.photo) {
        await page.setInputFiles('input[type="file"]', `public/photos/${a.photo}`);
        await page.getByText("✓ Background removed").waitFor({ timeout: 180000 });
        await page.getByRole("checkbox").check();
      }
      await page.getByRole("button", { name: "Submit application" }).click();
      await page.getByLabel("Your private edit link").waitFor(T);
      if (i === 0) editLink = await page.getByLabel("Your private edit link").inputValue();
      await page.context().close();
    }
    assert.equal(await prisma.registration.count({ where: { seasonId: season.id, status: "PENDING" } }), 4);
    const withPhoto = await prisma.registration.findFirstOrThrow({ where: { seasonId: season.id, name: "ZZ Journey Alif" } });
    assert.ok(withPhoto.photoKey && withPhoto.cutoutKey, "the applicant's photo and cut-out were stored");

    // the applicant can reopen their link and sees their saved cut-out
    const applicantPage = await newPage();
    await applicantPage.goto(editLink);
    await applicantPage.getByLabel("Contact").waitFor(T);
    assert.equal(await applicantPage.locator(".pcard__photo--cutout img").count(), 1, "the edit page shows the stored cut-out on the card");
    await applicantPage.locator(".pcard__photo--cutout img").evaluate((img: HTMLImageElement) => img.decode());
    await applicantPage.context().close();

    // ---- 2. organiser approves everyone ----
    const adminPage = await newPage(true);
    await adminPage.goto(`${base}/admin/registrations`);
    await adminPage.getByText("ZZ Journey Alif").waitFor(T);
    assert.equal(await adminPage.locator('img[src^="/api/photos/registration-"]').count(), 1, "the applicant's photo shows in the review list");
    for (const box of await adminPage.locator('li input[type="checkbox"]').all()) await box.check();
    await adminPage.getByRole("button", { name: /Approve 4 selected/ }).click();
    await adminPage.getByText("No registrations").or(adminPage.getByText(/nothing|No .* here/i)).first().waitFor({ timeout: 8000 }).catch(() => {});
    for (let i = 0; i < 40 && (await prisma.player.count({ where: { seasonId: season.id } })) < 4; i++) await new Promise((r) => setTimeout(r, 500));
    const players = await prisma.player.findMany({ where: { seasonId: season.id }, include: { person: { include: { identifiers: true } } } });
    assert.equal(players.length, 4, "approval creates a pool player for every applicant");
    assert.ok(players.every((p) => !p.teamId && p.jerseyNumber === 0), "approved players wait in the pool");
    const alif = players.find((p) => p.name === "ZZ Journey Alif")!;
    assert.equal(alif.cutoutKey, withPhoto.cutoutKey, "the cut-out follows the applicant onto the player");
    assert.equal(alif.photoZoom, withPhoto.photoZoom);
    assert.equal(alif.person.identifiers[0]?.value, `ZZJ${stamp}0`, "the student ID pins the person");

    // ---- 3. organiser rates the players ----
    await adminPage.goto(`${base}/admin/cards`);
    await adminPage.getByRole("button", { name: /Start unrated players at 89/ }).click();
    await adminPage.getByText(/Set 4 unrated player/).waitFor(T);
    await adminPage.locator("li", { hasText: "ZZ Journey Alif" }).getByRole("button").first().click();
    for (const [k, v] of [["PAC", 88], ["SHO", 90], ["PAS", 75], ["DRI", 86], ["DEF", 45], ["PHY", 78]] as const) await adminPage.getByLabel(`${k} of ZZ Journey Alif`).fill(String(v));
    await adminPage.getByRole("button", { name: "Save card" }).click();
    await adminPage.getByText("Saved.").waitFor(T);

    // ---- 4. formation deals the pool to the two teams ----
    await adminPage.goto(`${base}/admin/formation`);
    await adminPage.getByText("Pool (4)").waitFor(T);
    await adminPage.getByRole("button", { name: "Preview deal" }).click();
    await adminPage.getByText(/4 placed in the preview/).waitFor(T);
    await adminPage.getByRole("button", { name: "Apply this deal" }).click();
    await adminPage.getByText("Pool (0)").waitFor(T);
    for (const t of await prisma.team.findMany({ where: { seasonId: season.id } })) assert.equal(await prisma.player.count({ where: { teamId: t.id } }), 2, "even teams");

    // ---- 5. the public sees the cards, the photo applicant's card uses the cut-out, and it downloads ----
    const pub = await newPage();
    await pub.goto(`${base}/cards`);
    await pub.getByLabel("Download ZZ Journey Alif's card as an image").waitFor(T);
    assert.equal(await pub.locator("figure").count(), 4);
    const alifCard = pub.locator("figure", { hasText: "ZZ JOURNEY ALIF" });
    assert.equal((await alifCard.locator(".pcard__ovrn").innerText()).trim(), "85", "88/90/75/86/45/78 as a forward = 85");
    const img = alifCard.locator(".pcard__photo--cutout img");
    assert.equal(await img.count(), 1, "the card shows the cut-out");
    assert.ok((await img.evaluate((el: HTMLImageElement) => el.decode().then(() => el.naturalWidth))) > 50, "the cut-out image loads");
    const [download] = await Promise.all([pub.waitForEvent("download", { timeout: 60000 }), alifCard.getByRole("button", { name: /Download/ }).click()]);
    assert.deepEqual([...fs.readFileSync((await download.path())!).subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], "PNG download");

    assert.deepEqual(errors, [], "no uncaught page errors on any screen");
    console.log("✓ journey: apply with photo+cut-out → approve → rate → form teams → public card (cut-out, PNG)");
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
