// The apply page: "Choose photo" is a real button, and the card can be saved
// as a 1080x1920 story image — before submitting and from the thank-you screen.
// Throwaway ZZ season; dev/test branch only. Run: ALLOW_DB_WRITE_TESTS=1 npm run test:story
import assert from "node:assert/strict";
import fs from "node:fs";
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
  const tournament = await prisma.tournament.findUniqueOrThrow({ where: { slug: "bfl" } });
  const original = tournament.currentSeasonId;
  const stamp = Date.now();
  const season = await prisma.season.create({
    data: { tournamentId: tournament.id, number: 8000 + (stamp % 900), name: "ZZ Story Season", slug: `zz-story-${stamp}`, year: 2085, status: "ACTIVE", registrationOpen: true, registrationSelfServeEnabled: true, squadSizeMin: 2, squadSizeMax: 5 },
  });
  await prisma.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: season.id } });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 1400 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const T = { timeout: 30000 };
  const pngSize = (file: string) => {
    const b = fs.readFileSync(file);
    return [b.readUInt32BE(16), b.readUInt32BE(20)];
  };

  try {
    await page.goto(`${base}/register`);
    await page.getByLabel("Student ID").waitFor(T);

    // the photo chooser is a button that opens the file picker
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Choose photo" }).click();
    await chooser;

    // saving needs a name
    const dl = page.getByRole("button", { name: /Download for stories/ });
    assert.equal(await dl.isDisabled(), true, "disabled until a name is typed");
    await page.getByLabel("Name", { exact: true }).fill("ZZ Story Player");
    // a chosen photo (a blob: URL) must not break the export
    const photo = fs.readdirSync("public/photos").find((f) => f.endsWith(".jpg"));
    if (photo) await page.setInputFiles('input[type="file"]', `public/photos/${photo}`);
    assert.equal(await dl.isDisabled(), false);
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), dl.click()]);
    const file = `/tmp/zz-story-${stamp}.png`;
    await download.saveAs(file);
    assert.deepEqual(pngSize(file), [1080, 1920], "story image is 1080x1920");
    assert.ok(download.suggestedFilename().endsWith("-story.png"));
    fs.rmSync(file, { force: true });

    // submit, then the thank-you screen offers the same image
    await page.getByLabel("Student ID").fill(`zz-story-${stamp}`);
    await page.getByLabel("Batch term").selectOption("FALL");
    await page.getByLabel("Batch year").selectOption("2027");
    await page.getByLabel("Contact").fill("x");
    // a photo means the card must be reviewed; skip the (slow) background removal
    const skip = page.getByRole("button", { name: "Use my photo as it is" });
    if (await skip.count()) await skip.click();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Submit application" }).click();
    await page.getByLabel("Your private edit link").waitFor(T);
    await page.getByText("Share your card").waitFor(T);
    const [again] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.getByRole("button", { name: /Download for stories/ }).click()]);
    const file2 = `/tmp/zz-story2-${stamp}.png`;
    await again.saveAs(file2);
    assert.deepEqual(pngSize(file2), [1080, 1920]);
    fs.rmSync(file2, { force: true });

    assert.deepEqual(errors, [], "no uncaught page errors");
    console.log("✓ story download: photo button opens the picker, 1080x1920 image before and after submitting");
  } finally {
    await browser.close();
    await prisma.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: original } });
    await prisma.registration.deleteMany({ where: { seasonId: season.id } });
    await prisma.season.delete({ where: { id: season.id } }).catch((e) => console.error("cleanup", e.message));
    await prisma.person.deleteMany({ where: { name: { startsWith: "ZZ " } } });
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
