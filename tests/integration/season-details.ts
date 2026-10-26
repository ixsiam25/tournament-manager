// Season details: the time fields accept typing (5pm, 1730…), and everything
// entered at creation can be edited afterwards from "Edit season details".
// Throwaway ZZ season; dev/test branch only. Run: ALLOW_DB_WRITE_TESTS=1 npm run test:seasondetails
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
    data: {
      tournamentId: tournament.id, number: 6000 + (stamp % 900), name: "ZZ Details", slug: `zz-det-${stamp}`, year: 2087, status: "ACTIVE", squadSizeMin: 6, squadSizeMax: 8,
      formatConfig: { matchFormat: "SINGLE_ROUND_ROBIN", knockoutStructure: "SEMIS_FINAL", matchDurationMinutes: 7, bufferMinutes: 3, dayStartTime: "17:00", pitches: [{ name: "Field 1" }] },
    },
  });
  await prisma.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: season.id } });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 1400 } });
  await ctx.addCookies([{ name: "user_session", value: token, domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const T = { timeout: 30000 };

  try {
    // The Season page links to the editor.
    await page.goto(`${base}/admin/season`);
    await page.getByRole("link", { name: "Edit season details" }).click(T);
    await page.waitForURL(/season\/details/, T);
    const form = page.getByTestId("season-details");
    await form.waitFor(T);

    // Type into the time fields like a person would.
    const day = form.getByText("Day start time").locator("..").locator("input");
    await day.fill("5:30pm");
    await day.blur();
    assert.equal(await day.inputValue(), "17:30", "5:30pm is tidied to 17:30");
    await form.getByText("Available from").locator("..").locator("input").first().fill("1800");
    await form.getByText("Until").locator("..").locator("input").first().fill("9pm");
    await form.getByRole("button", { name: "+ Add pitch" }).click();
    await form.getByPlaceholder("", { exact: false }).first().waitFor(T);
    const pitchNames = form.getByText("Name").locator("..").locator("input");
    await pitchNames.nth(1).waitFor(T); // [0] = season name, [1] = pitch 1
    await pitchNames.nth(2).fill("Field 2"); // the new pitch (blank times = all day)
    await pitchNames.nth(0).fill("ZZ Details Renamed");
    await form.getByText("Max per team").locator("..").locator("input").fill("9");
    await form.getByRole("button", { name: "Save changes" }).click();
    await page.getByRole("status").getByText("Saved.").waitFor(T);

    const saved = await prisma.season.findUniqueOrThrow({ where: { id: season.id } });
    assert.equal(saved.name, "ZZ Details Renamed");
    assert.equal(saved.squadSizeMax, 9);
    const fc = saved.formatConfig as { dayStartTime: string; pitches: { name: string; availabilityStart: string | null; availabilityEnd: string | null }[] };
    assert.equal(fc.dayStartTime, "17:30");
    assert.deepEqual(fc.pitches, [
      { name: "Field 1", availabilityStart: "18:00", availabilityEnd: "21:00" },
      { name: "Field 2", availabilityStart: null, availabilityEnd: null },
    ]);

    // Reload shows what was saved; bad input is refused by the API.
    await page.reload();
    await form.waitFor(T);
    assert.equal(await form.getByText("Day start time").locator("..").locator("input").inputValue(), "17:30");
    const bad = await fetch(base + "/api/admin/season/details", {
      method: "PATCH", headers: { Cookie: `user_session=${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "x", year: 2087, targetTeamCount: null, squadSizeMin: 8, squadSizeMax: 4, registrationSelfServeEnabled: true, registrationExcelImportEnabled: true, formatConfig: fc }),
    });
    assert.equal(bad.status, 400, "squad max below min is refused");

    // The creation wizard's time fields accept typing too.
    await prisma.season.update({ where: { id: season.id }, data: { status: "ARCHIVED" } });
    await page.goto(`${base}/admin/season/rollover`);
    const wizDay = page.getByText("Day start time").locator("..").locator("input");
    await wizDay.fill("6pm");
    await wizDay.blur();
    assert.equal(await wizDay.inputValue(), "18:00");

    assert.deepEqual(errors, [], "no uncaught page errors");
    console.log("✓ season details: typeable times, edit-after-create, validation, wizard time fields");
  } finally {
    await browser.close();
    await prisma.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: original } });
    await prisma.season.delete({ where: { id: season.id } }).catch((e) => console.error("cleanup", e.message));
    await prisma.auditLog.deleteMany({ where: { summary: { contains: "ZZ " } } });
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
