// The admin console for a new organiser: grouped menu, a "next step" home,
// and the public application link shown wherever it's useful until applications close.
// Throwaway ZZ seasons; dev/test branch only. Run: ALLOW_DB_WRITE_TESTS=1 npm run test:adminnav
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
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN", isActive: true } });
  const token = await createUserSessionToken(admin.id);
  const tournament = await prisma.tournament.findUniqueOrThrow({ where: { slug: "bfl" } });
  const original = tournament.currentSeasonId;
  const stamp = Date.now();
  const season = await prisma.season.create({
    data: { tournamentId: tournament.id, number: 7000 + (stamp % 900), name: "ZZ Nav Season", slug: `zz-nav-${stamp}`, year: 2086, status: "ACTIVE", squadSizeMin: 2, squadSizeMax: 5, registrationOpen: true, registrationSelfServeEnabled: true },
  });
  await prisma.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: season.id } });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 1000 } });
  await ctx.addCookies([{ name: "user_session", value: token, domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const T = { timeout: 30000 };

  try {
    // Home: a short menu, a next step, and the application link.
    await page.goto(`${base}/admin`);
    const main = page.getByRole("navigation", { name: "Main" });
    await main.waitFor(T);
    assert.deepEqual((await main.getByRole("link").allTextContents()).map((t) => t.trim()), ["Home", "Season", "Players", "Matches", "Website", "Access"]);
    await page.getByTestId("next-step").waitFor(T);
    assert.ok(/Next:/.test((await page.getByTestId("next-step").textContent()) ?? ""));
    const link = page.getByLabel("Application link");
    await link.waitFor(T);
    assert.ok((await link.inputValue()).endsWith("/register"), "the share link points at the sign-up form");

    // Season area: sub-menu with the pages of that area, and the link again.
    await page.goto(`${base}/admin/season`);
    const sub = page.getByRole("navigation", { name: "Season" });
    await sub.waitFor(T);
    const labels = (await sub.getByRole("link").allTextContents()).map((t) => t.trim());
    assert.ok(["Setup guide", "Applications", "Team formation", "Auction", "Teams", "Season details", "Application form"].every((l) => labels.includes(l)), `season sub-menu: ${labels}`);
    assert.equal(await sub.getByRole("link", { name: "Setup guide" }).getAttribute("aria-current"), "page");
    await page.getByLabel("Application link").waitFor(T);

    // Right after creating a season the page says so and shows the link.
    await page.goto(`${base}/admin/season?created=1`);
    await page.getByText("ZZ Nav Season is created.").waitFor(T);
    await page.getByText("Applications are open — share the link below.").waitFor(T);

    // Applications page carries the link too; the sub-menu highlights it.
    await page.goto(`${base}/admin/registrations`);
    await page.getByLabel("Application link").waitFor(T);
    assert.equal(await page.getByRole("navigation", { name: "Season" }).getByRole("link", { name: "Applications" }).getAttribute("aria-current"), "page");

    // Once applications close the link goes away everywhere.
    await prisma.season.update({ where: { id: season.id }, data: { registrationOpen: false } });
    for (const path of ["/admin", "/admin/season", "/admin/registrations"]) {
      await page.goto(`${base}${path}`);
      await page.getByRole("navigation", { name: "Main" }).waitFor(T);
      await page.waitForTimeout(1500);
      assert.equal(await page.getByTestId("application-link").count(), 0, `no link on ${path} after closing`);
    }

    // Archived season: Home invites the organiser to create the next one.
    await prisma.season.update({ where: { id: season.id }, data: { status: "ARCHIVED" } });
    await page.goto(`${base}/admin`);
    await page.getByText("Ready for the next season?").waitFor(T);
    await page.getByRole("link", { name: "Create a new season" }).first().waitFor(T);

    assert.deepEqual(errors, [], "no uncaught page errors");
    console.log("✓ admin nav: grouped menu, next-step home, application link shown while open and gone once closed, archived invite");
  } finally {
    await browser.close();
    await prisma.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: original } });
    await prisma.season.delete({ where: { id: season.id } }).catch((e) => console.error("cleanup", e.message));
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
