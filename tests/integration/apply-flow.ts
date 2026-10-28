// End-to-end check of the public apply flow in a real browser: configurable
// fields, live card preview, mandatory review, edit-by-link, duplicate
// student ID. Creates a throwaway ACTIVE season, points the tournament at it,
// and restores everything afterwards — dev branch only.
//
// Needs a dev server on :3100.  Run: ALLOW_DB_WRITE_TESTS=1 npm run test:apply
import { pickBatch } from "./_batch";
import assert from "node:assert/strict";
import fs from "node:fs";
import { config } from "dotenv";
import { chromium } from "playwright-core";
import { batchLabelForSemester } from "../../lib/batch";
config({ path: process.env.TEST_ENV_FILE ?? ".env.local" });

if (process.env.ALLOW_DB_WRITE_TESTS !== "1") {
  console.log("skipped: set ALLOW_DB_WRITE_TESTS=1 (dev branch only)");
  process.exit(0);
}
const base = process.env.SMOKE_BASE_URL ?? "http://localhost:3100";

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
    assert.equal(await page.getByLabel("Current semester").count() > 0, true, "the form asks for the current semester");
    await page.locator("input").first().fill("Test Applicant"); // Name
    assert.equal((await page.locator(".pcard__name").innerText()).trim(), "TEST APPLICANT", "card shows the typed name");
    await page.getByLabel("Student ID").fill(`zz-${stamp}`);
    await pickBatch(page, batchLabelForSemester(5)); // "5th semester" → the batch is worked out
    assert.equal((await page.getByTestId("batch-status").innerText()).trim(), `You’ll be in the ${batchLabelForSemester(5)} batch — 5th semester`, "the form works out the batch itself");
    await pickBatch(page, batchLabelForSemester(11)); // graduated a while ago
    assert.match(await page.getByTestId("batch-status").innerText(), /— Alumni/, "an old batch is shown as alumni");
    await pickBatch(page, batchLabelForSemester(5));
    await page.getByLabel("Contact").fill("090-0000-0000");
    await page.getByLabel("Preferred position").selectOption("GK");
    assert.equal((await page.locator(".pcard__pos").innerText()).trim(), "GK", "card shows the position");
    assert.ok((await page.locator(".pcard__stats").innerText()).includes("DIV"), "GK card uses goalkeeper stat labels");

    // photo -> card shows it; review is mandatory
    // Record what the form uploads (multipart bodies aren't readable from the request object).
    await page.addInitScript(() => {
      const w = window as unknown as { __uploads: [string, string][][] };
      w.__uploads = [];
      const original = window.fetch.bind(window);
      window.fetch = (input, init) => {
        if (init?.body instanceof FormData) w.__uploads.push([...init.body.entries()].map(([k, v]) => [k, v instanceof File ? `${v.type}:${v.size}` : "text"]));
        return original(input, init);
      };
    });
    await page.reload();
    await page.getByLabel("Student ID").waitFor({ timeout: 30000 });
    await page.locator("input").first().fill("Test Applicant");
    await page.getByLabel("Student ID").fill(`zz-${stamp}`);
    await pickBatch(page, "Fall 24");
    await page.getByLabel("Contact").fill("090-0000-0000");
    await page.setInputFiles('input[type="file"]', `public/photos/${photo}`);
    await page.locator(".pcard__photo img").waitFor({ timeout: 15000 });
    // The background removal runs in a worker; while it runs the form says so and submit is held.
    await page.getByText(/Creating your card/).waitFor({ timeout: 15000 });
    assert.equal(await page.getByRole("button", { name: "Preparing your card…" }).isDisabled(), true, "submit is held while the card is prepared");
    // First run downloads the model (~40 MB), so allow a generous time.
    await page.getByText("✓ Background removed").waitFor({ timeout: 180000 });
    assert.equal(await page.locator(".pcard__photo--cutout img").count(), 1, "card now shows the cut-out");
    const cutoutSrc = await page.locator(".pcard__photo--cutout img").getAttribute("src");
    assert.match(cutoutSrc ?? "", /^blob:/);
    await page.getByRole("button", { name: "Submit application" }).click();
    await page.getByText("Please check your card").waitFor();
    await page.getByLabel("Zoom").fill("150");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Submit application" }).click();

    // the story image is prepared first, so the upload happens a moment after the click
    await page.waitForFunction(() => ((window as unknown as { __uploads?: unknown[] }).__uploads ?? []).length > 0, undefined, { timeout: 30000 });
    const uploads = await page.evaluate(() => (window as unknown as { __uploads: [string, string][][] }).__uploads);
    const parts = Object.fromEntries(uploads[uploads.length - 1]);
    assert.match(parts.cutout ?? "", /^image\/png:\d+$/, "the cut-out PNG is uploaded with the application");
    assert.match(parts.photo ?? "", /^image\/jpeg:\d+$/, "the original (downscaled) photo is uploaded too");
    await page.getByLabel("Your private edit link").waitFor({ timeout: 30000 });
    const link = await page.getByLabel("Your private edit link").inputValue();
    assert.match(link, /\/register\/edit\/[A-Za-z0-9_-]{20,}$/);
    const reg = await prisma.registration.findFirstOrThrow({ where: { seasonId: season.id } });
    assert.equal(reg.studentId, `ZZ-${stamp}`, "student ID stored normalised");
    assert.equal(reg.status, "PENDING");
    assert.ok(reg.editTokenHash && !link.includes(reg.editTokenHash), "only a hash of the token is stored");
    // the photo AND the cut-out really are stored and served back
    assert.ok(reg.photoKey && reg.cutoutKey, "photo and cut-out keys are saved");
    for (const [label, key, type] of [["photo", reg.photoKey!, "image/jpeg"], ["cut-out", reg.cutoutKey!, "image/png"]] as const) {
      const res = await fetch(`${base}/api/photos/${key}`);
      assert.equal(res.status, 200, `${label} is served back`);
      assert.equal(res.headers.get("content-type"), type);
      assert.ok((await res.arrayBuffer()).byteLength > 2000, `${label} isn't empty`);
    }

    // ---- duplicate student ID is refused ----
    await page.goto(`${base}/register`);
    await page.getByLabel("Student ID").waitFor();
    await page.locator("input").first().fill("Someone Else");
    await page.getByLabel("Student ID").fill(`ZZ-${stamp}`);
    await pickBatch(page, "Spring 25");
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
    assert.equal(await page.getByLabel("Current semester").count(), 0, "disabled field must not render");
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

    // ---- the server enforces the batch rules whatever the browser sent ----
    await prisma.season.update({ where: { id: season.id }, data: { applicationConfig: { fields: { studentId: { enabled: true, required: true }, affiliation: { enabled: true, required: true }, position: { enabled: false, required: false }, contact: { enabled: false, required: false }, photo: { enabled: false, required: false } }, questions: [], intro: "", affiliationKind: "batch", batchMeaning: "entry" } } });
    const post = async (affiliation: string, id: string) => {
      const fd = new FormData();
      fd.append("name", "ZZ Rules");
      fd.append("studentId", id);
      fd.append("affiliation", affiliation);
      return fetch(`${base}/api/register`, { method: "POST", body: fd });
    };
    const notBatch = await post("Sem 3", `ZZR${stamp}a`);
    assert.equal(notBatch.status, 400);
    assert.match((await notBatch.json()).error, /Fall 24/, "free text is refused with an example");
    const future = await post("Fall 2050", `ZZR${stamp}b`);
    assert.equal(future.status, 400);
    assert.match((await future.json()).error, /hasn't started yet/, "a batch that hasn't started is refused");
    const messy = await post("  fall'24 ", `ZZR${stamp}c`);
    assert.equal(messy.status, 201);
    assert.equal((await prisma.registration.findFirstOrThrow({ where: { seasonId: season.id, studentId: `ZZR${stamp}C` } })).affiliation, "Fall 24", "a messy spelling is stored canonically");

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
