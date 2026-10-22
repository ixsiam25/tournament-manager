// End-to-end check of the public apply flow in a real browser: configurable
// fields, live card preview, mandatory review, edit-by-link, duplicate
// student ID. Creates a throwaway ACTIVE season, points the tournament at it,
// and restores everything afterwards — dev branch only.
//
// Needs a dev server on :3100.  Run: ALLOW_DB_WRITE_TESTS=1 npm run test:apply
import assert from "node:assert/strict";
import fs from "node:fs";
import { config } from "dotenv";
import { chromium } from "playwright-core";
config({ path: ".env.local" });

if (process.env.ALLOW_DB_WRITE_TESTS !== "1") {
  console.log("skipped: set ALLOW_DB_WRITE_TESTS=1 (dev branch only)");
  process.exit(0);
}
const base = process.env.SMOKE_BASE_URL ?? "http://localhost:3100";
const r2 = Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME);

async function main() {
  const { prisma } = await import("../../lib/db");
  const tournament = await prisma.tournament.findUniqueOrThrow({ where: { slug: "bfl" } });
  const originalPointer = tournament.currentSeasonId;
  const stamp = Date.now();
  const season = await prisma.season.create({
    data: {
      tournamentId: tournament.id,
      number: 70000 + (stamp % 9000),
      name: "ZZ Apply Test",
      slug: `zz-apply-${stamp}`,
      year: 2097,
      status: "ACTIVE",
      registrationOpen: true,
      registrationSelfServeEnabled: true,
    },
  });
  await prisma.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: season.id } });

  const photo = fs.readdirSync("public/photos").find((f) => f.startsWith("cmrx") && f.endsWith(".jpg"));
  assert.ok(photo, "need a sample photo in public/photos");
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 1000 } })).newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  try {
    // ---- default form ----
    await page.goto(`${base}/register`);
    await page.getByLabel("Student ID").waitFor({ timeout: 30000 });
    assert.equal(await page.getByText("Affiliation").count() > 0, true);
    await page.locator("input").first().fill("Test Applicant"); // Name
    assert.equal((await page.locator(".pcard__name").innerText()).trim(), "TEST APPLICANT", "card shows the typed name");
    await page.getByLabel("Student ID").fill(`zz-${stamp}`);
    await page.getByLabel("Affiliation").fill("ZZ Batch");
    await page.getByLabel("Contact").fill("090-0000-0000");
    await page.getByLabel("Preferred position").selectOption("GK");
    assert.equal((await page.locator(".pcard__pos").innerText()).trim(), "GK", "card shows the position");
    assert.ok((await page.locator(".pcard__stats").innerText()).includes("DIV"), "GK card uses goalkeeper stat labels");

    // photo -> card shows it; review is mandatory
    await page.setInputFiles('input[type="file"]', `public/photos/${photo}`);
    await page.locator(".pcard__photo img").waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: "Submit application" }).click();
    await page.getByText("Please check your card").waitFor();
    await page.getByLabel("Zoom").fill("150");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Submit application" }).click();

    if (r2) {
      await page.getByLabel("Your private edit link").waitFor({ timeout: 30000 });
    } else {
      await page.getByText("temporarily unavailable").waitFor({ timeout: 30000 });
      console.log("  (R2 not configured locally → photo path degraded gracefully with a clear message)");
      // Retry without a photo to exercise the rest of the flow.
      await page.reload();
      await page.getByLabel("Student ID").waitFor();
      await page.locator("input").first().fill("Test Applicant");
      await page.getByLabel("Student ID").fill(`zz-${stamp}`);
      await page.getByLabel("Affiliation").fill("ZZ Batch");
      await page.getByLabel("Contact").fill("090-0000-0000");
      await page.getByRole("button", { name: "Submit application" }).click();
      await page.getByLabel("Your private edit link").waitFor({ timeout: 30000 });
    }
    const link = await page.getByLabel("Your private edit link").inputValue();
    assert.match(link, /\/register\/edit\/[A-Za-z0-9_-]{20,}$/);
    const reg = await prisma.registration.findFirstOrThrow({ where: { seasonId: season.id } });
    assert.equal(reg.studentId, `ZZ-${stamp}`, "student ID stored normalised");
    assert.equal(reg.status, "PENDING");
    assert.ok(reg.editTokenHash && !link.includes(reg.editTokenHash), "only a hash of the token is stored");

    // ---- duplicate student ID is refused ----
    await page.goto(`${base}/register`);
    await page.getByLabel("Student ID").waitFor();
    await page.locator("input").first().fill("Someone Else");
    await page.getByLabel("Student ID").fill(`ZZ-${stamp}`);
    await page.getByLabel("Affiliation").fill("x");
    await page.getByLabel("Contact").fill("x");
    await page.getByRole("button", { name: "Submit application" }).click();
    await page.getByText("already exists for this season").waitFor({ timeout: 30000 });

    // ---- edit by link ----
    await page.goto(link);
    await page.getByLabel("Contact").waitFor({ timeout: 30000 });
    assert.equal(await page.locator("input").first().inputValue(), "Test Applicant");
    await page.locator("input").first().fill("Test Applicant Renamed");
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.getByText("Saved — your changes are in.").waitFor({ timeout: 30000 });
    assert.equal((await prisma.registration.findUniqueOrThrow({ where: { id: reg.id } })).name, "Test Applicant Renamed");
    await page.goto(`${base}/register/edit/not-a-real-token-xxxxxxxxxxxx`);
    await page.getByText("This link isn’t valid").waitFor({ timeout: 30000 });

    // once reviewed, the link becomes read-only
    await prisma.registration.update({ where: { id: reg.id }, data: { status: "APPROVED" } });
    await page.goto(link);
    await page.getByText("you're in").waitFor({ timeout: 30000 });
    await prisma.registration.update({ where: { id: reg.id }, data: { status: "PENDING" } });

    // ---- config drives the form ----
    await prisma.season.update({
      where: { id: season.id },
      data: {
        applicationConfig: {
          fields: {
            studentId: { enabled: true, required: true },
            affiliation: { enabled: false, required: false },
            position: { enabled: false, required: false },
            contact: { enabled: true, required: false },
            photo: { enabled: false, required: false },
          },
          questions: [{ id: "foot", label: "Strong foot", kind: "choice", options: ["Left", "Right"], required: true }],
          intro: "ZZ intro text",
        },
      },
    });
    await page.goto(`${base}/register`);
    await page.getByText("ZZ intro text").waitFor({ timeout: 30000 });
    assert.equal(await page.getByLabel("Affiliation").count(), 0, "disabled field must not render");
    assert.equal(await page.locator('input[type="file"]').count(), 0, "disabled photo must not render");
    await page.locator("input").first().fill("Config Person");
    await page.getByLabel("Student ID").fill(`ZZ-${stamp}-2`);
    await page.getByRole("button", { name: "Submit application" }).click(); // missing required question -> browser validation blocks
    assert.equal(await prisma.registration.count({ where: { seasonId: season.id } }), 1, "required custom question must block submit");
    await page.getByLabel("Strong foot").selectOption("Left");
    await page.getByRole("button", { name: "Submit application" }).click();
    await page.getByLabel("Your private edit link").waitFor({ timeout: 30000 });
    const second = await prisma.registration.findFirstOrThrow({ where: { seasonId: season.id, studentId: `ZZ-${stamp}-2` } });
    assert.deepEqual(second.answers, { foot: "Left" });

    // ---- deadline closes applications even though the switch is on ----
    await prisma.season.update({ where: { id: season.id }, data: { applicationDeadline: new Date(Date.now() - 60_000) } });
    const status = await (await fetch(`${base}/api/register`)).json();
    assert.equal(status.open, false, "past deadline => closed");

    assert.deepEqual(pageErrors, [], "no uncaught page errors");
    console.log("✓ apply flow: config-driven form, live card, mandatory review, edit link, duplicate ID, deadline");
  } finally {
    await browser.close();
    await prisma.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: originalPointer } });
    await prisma.season.delete({ where: { id: season.id } });
    await prisma.person.deleteMany({ where: { name: { startsWith: "ZZ " } } });
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
