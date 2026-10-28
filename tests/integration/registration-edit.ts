// Admin overwrite of applications: fix a wrong semester/batch, name, position, contact at any status;
// the student ID is locked once approved; an approved applicant's roster player follows; closed seasons refuse.
// Throwaway ZZ season; dev/test branch only. Run: ALLOW_DB_WRITE_TESTS=1 npm run test:regedit
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
  const { approveRegistration } = await import("../../lib/registrationApproval");
  const { batchLabelForSemester } = await import("../../lib/batch");
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN", isActive: true } });
  const token = await createUserSessionToken(admin.id);
  const tournament = await prisma.tournament.findUniqueOrThrow({ where: { slug: "bfl" } });
  const original = tournament.currentSeasonId;
  const stamp = Date.now();
  const season = await prisma.season.create({
    data: { tournamentId: tournament.id, number: 9000 + (stamp % 900), name: "ZZ Edit Season", slug: `zz-edit-${stamp}`, year: 2084, status: "ACTIVE", registrationOpen: true, registrationSelfServeEnabled: true, squadSizeMin: 2, squadSizeMax: 5 },
  });
  await prisma.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: season.id } });
  const mk = (name: string, i: number, status: "PENDING" | "APPROVED" | "REJECTED") =>
    prisma.registration.create({ data: { seasonId: season.id, name, affiliation: batchLabelForSemester(2), contact: "x", studentId: `ZZED${stamp}${i}`, position: "MID", source: "SELF_SERVE", status } });
  const approved = await mk("ZZ Approved", 1, "APPROVED");
  await approveRegistration(approved, season);
  const pending = await mk("ZZ Pending", 2, "PENDING");
  await mk("ZZ Rejected", 3, "REJECTED");

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 1200 } });
  await ctx.addCookies([{ name: "user_session", value: token, domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const T = { timeout: 30000 };
  const put = (id: string, body: unknown) => fetch(`${base}/api/admin/registrations/${id}`, { method: "PUT", headers: { Cookie: `user_session=${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });

  try {
    // ---- UI: fix an APPROVED applicant's semester + name ----
    await page.goto(`${base}/admin/registrations`);
    await page.getByRole("button", { name: "All", exact: true }).click();
    await page.getByText("ZZ Approved").waitFor(T);
    await page.getByRole("button", { name: "Edit ZZ Approved" }).click();
    const editor = page.getByTestId("registration-editor");
    await editor.waitFor(T);
    assert.equal(await editor.getByLabel("Student ID").isDisabled(), true, "the student ID is locked after approval");
    await editor.getByLabel("Current semester").selectOption("6");
    await editor.getByText("Stored as batch").waitFor(T);
    await editor.getByLabel("Name").fill("ZZ Approved Fixed");
    await editor.getByRole("button", { name: "Save changes" }).click();
    await page.getByText("ZZ Approved Fixed").waitFor(T);
    const saved = await prisma.registration.findUniqueOrThrow({ where: { id: approved.id } });
    assert.equal(saved.affiliation, batchLabelForSemester(6), "6th semester → its batch");
    assert.equal(saved.name, "ZZ Approved Fixed");
    assert.equal((await prisma.player.findFirstOrThrow({ where: { seasonId: season.id, personId: saved.personId! } })).name, "ZZ Approved Fixed", "the roster player follows");
    assert.ok((await prisma.auditLog.count({ where: { action: "registration.edit", entityId: approved.id } })) >= 1, "the edit is audited");

    // ---- API: ID locked after approval, editable before; duplicates refused; direct batch ----
    const r1 = await put(approved.id, { name: "ZZ Approved Fixed", affiliation: "Fall 25", contact: "x", position: "MID", studentId: "SOMETHING-ELSE" });
    assert.equal(r1.status, 200);
    assert.equal((await prisma.registration.findUniqueOrThrow({ where: { id: approved.id } })).studentId, `ZZED${stamp}1`, "approved ID unchanged");
    const r2 = await put(pending.id, { name: "ZZ Pending", affiliation: "Spring 28", contact: "y", position: null, studentId: `ZZED${stamp}9` });
    assert.equal(r2.status, 200);
    const p2 = await prisma.registration.findUniqueOrThrow({ where: { id: pending.id } });
    assert.deepEqual([p2.studentId, p2.affiliation, p2.position], [`ZZED${stamp}9`, "Spring 28", null], "a pending application's ID, batch and position change");
    const dup = await put(pending.id, { name: "ZZ Pending", affiliation: "Spring 28", contact: "y", studentId: `ZZED${stamp}1` });
    assert.equal(dup.status, 409, "a duplicate student ID is refused");
    const bad = await put(pending.id, { name: "ZZ Pending", affiliation: "not a batch", contact: "y" });
    assert.equal(bad.status, 400, "a non-batch is refused");

    // ---- a finished season can't be edited ----
    await prisma.season.update({ where: { id: season.id }, data: { status: "ARCHIVED" } });
    assert.equal((await put(pending.id, { name: "ZZ Pending", affiliation: "Spring 28", contact: "y" })).status, 409);

    assert.deepEqual(errors, [], "no uncaught page errors");
    console.log("✓ registration edit: admin overwrite at any status, semester → batch, ID locked after approval, player follows, duplicates/closed refused, audited");
  } finally {
    await browser.close();
    await prisma.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: original } });
    await prisma.matchEvent.deleteMany({ where: { match: { seasonId: season.id } } });
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
