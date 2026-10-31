// Maximum applications: the public form closes itself when the limit is reached; a rejected
// application frees its place; admins can still add people by hand; the setting validates.
// Throwaway ZZ season; dev/test branch only. Run: ALLOW_DB_WRITE_TESTS=1 npm run test:appcap
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
      tournamentId: tournament.id, number: 9700 + (stamp % 90), name: "ZZ Cap Season", slug: `zz-cap-${stamp}`, year: 2081, status: "ACTIVE",
      registrationOpen: true, registrationSelfServeEnabled: true, squadSizeMin: 2, squadSizeMax: 5,
      applicationConfig: { ...DEFAULT_APPLICATION_CONFIG, fields: { ...DEFAULT_APPLICATION_CONFIG.fields, studentId: { enabled: true, required: true }, contact: { enabled: true, required: true } } },
    },
  });
  await prisma.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: season.id } });

  const apply = async (i: number) => {
    const fd = new FormData();
    fd.append("name", `ZZ Cap ${i}`);
    fd.append("studentId", `ZZCAP${stamp}${i}`);
    fd.append("affiliation", batchLabelForSemester(3));
    fd.append("contact", "x");
    fd.append("answers", "{}");
    return fetch(`${base}/api/register`, { method: "POST", body: fd });
  };
  const status = async () => (await (await fetch(`${base}/api/register`, { cache: "no-store" })).json()) as { open: boolean; full: boolean; cap: number | null };
  const setCap = (cap: number | null) =>
    fetch(`${base}/api/admin/season/application`, { method: "PUT", headers: cookie, body: JSON.stringify({ config: { ...DEFAULT_APPLICATION_CONFIG, maxApplications: cap }, deadline: null }) });

  const browser = await chromium.launch();
  try {
    // ---- the setting validates and shows usage ----
    assert.equal((await setCap(0)).status, 400, "0 isn't a valid limit");
    assert.equal((await setCap(2)).status, 200);
    const got = await (await fetch(`${base}/api/admin/season/application`, { headers: cookie })).json();
    assert.equal(got.config.maxApplications, 2);
    assert.deepEqual(got.usage, { cap: 2, used: 0, full: false });

    // ---- the form closes itself at the limit ----
    assert.deepEqual(await status(), { ...(await status()), open: true, full: false, cap: 2 });
    assert.equal((await apply(1)).status, 201);
    assert.equal((await apply(2)).status, 201);
    const third = await apply(3);
    assert.equal(third.status, 403, "the third application is refused");
    assert.match((await third.json()).error, /full/i);
    const full = await status();
    assert.deepEqual([full.open, full.full], [false, true]);
    assert.equal(await prisma.registration.count({ where: { seasonId: season.id } }), 2, "nothing extra was stored");

    // the public page says so
    const page = await (await browser.newContext()).newPage();
    await page.goto(`${base}/register`);
    await page.getByTestId("applications-full").waitFor({ timeout: 30000 });
    assert.match(await page.getByTestId("applications-full").innerText(), /Applications are full/);

    // ---- admins aren't blocked; a rejection frees a place ----
    const manual = await fetch(`${base}/api/admin/registrations`, { method: "POST", headers: cookie, body: JSON.stringify({ name: "ZZ Cap Manual", affiliation: batchLabelForSemester(4), contact: "x", studentId: `ZZCAPM${stamp}` }) });
    assert.equal(manual.status, 201, "manual add ignores the limit");
    const rows = await prisma.registration.findMany({ where: { seasonId: season.id, source: "SELF_SERVE" } });
    for (const r of rows) await prisma.registration.update({ where: { id: r.id }, data: { status: "REJECTED" } });
    await prisma.registration.updateMany({ where: { seasonId: season.id, source: "ADMIN_MANUAL" }, data: { status: "REJECTED" } });
    assert.equal((await status()).open, true, "rejected applications free their places");
    assert.equal((await apply(4)).status, 201);

    // ---- no limit again ----
    assert.equal((await setCap(null)).status, 200);
    assert.equal((await apply(5)).status, 201);
    assert.equal((await apply(6)).status, 201);
    assert.equal((await status()).cap, null);
    console.log("✓ application cap: validates, closes the form at the limit, full page, admin adds allowed, rejection frees a place, removable");
  } finally {
    await browser.close();
    await prisma.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: original } });
    await prisma.season.delete({ where: { id: season.id } }).catch((e) => console.error("cleanup", e.message));
    await prisma.person.deleteMany({ where: { name: { startsWith: "ZZ " } } });
    await prisma.auditLog.deleteMany({ where: { summary: { contains: "ZZ " } } });
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
