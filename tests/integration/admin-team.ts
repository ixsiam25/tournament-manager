// Admin onboarding + safety: invitation links, approval of joiners, the main admin can't be
// deactivated/demoted, the last active admin can't be removed, applicant Excel backup,
// photo on manual add, highlighted deadline and the "what happens next" copy.
// Throwaway ZZ data; dev/test branch only. Run: ALLOW_DB_WRITE_TESTS=1 npm run test:adminteam
import assert from "node:assert/strict";
import fs from "node:fs";
import { config } from "dotenv";
import { chromium } from "playwright-core";
import * as XLSX from "xlsx";
config({ path: process.env.TEST_ENV_FILE ?? ".env.local" });

if (process.env.ALLOW_DB_WRITE_TESTS !== "1") {
  console.log("skipped: set ALLOW_DB_WRITE_TESTS=1 (dev/test branch only)");
  process.exit(0);
}
const base = process.env.SMOKE_BASE_URL ?? "http://localhost:3100";

async function main() {
  const { prisma } = await import("../../lib/db");
  const { createUserSessionToken } = await import("../../lib/userAuth");
  const { hashPassword } = await import("../../lib/passwords");
  const stamp = Date.now();

  // the main admin = the earliest ADMIN; make sure the flag exists on the test branch
  const owner = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN", isActive: true }, orderBy: { createdAt: "asc" } });
  await prisma.user.update({ where: { id: owner.id }, data: { isOwner: true } });
  const token = await createUserSessionToken(owner.id);
  const cookie = { Cookie: `user_session=${token}`, "Content-Type": "application/json" };
  const api = (p: string, method = "GET", body?: unknown, headers: Record<string, string> = cookie) => fetch(base + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });

  const tournament = await prisma.tournament.findUniqueOrThrow({ where: { slug: "bfl" } });
  const originalPointer = tournament.currentSeasonId;
  const season = await prisma.season.create({
    data: {
      tournamentId: tournament.id, number: 9500 + (stamp % 400), name: "ZZ Team Season", slug: `zz-team-${stamp}`, year: 2083, status: "ACTIVE",
      registrationOpen: true, registrationSelfServeEnabled: true, squadSizeMin: 2, squadSizeMax: 5, applicationDeadline: new Date(Date.now() + 3 * 86_400_000),
    },
  });
  await prisma.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: season.id } });
  const extraAdmin = await prisma.user.create({ data: { name: "ZZ Second Admin", username: `zz-admin-${stamp}`, passwordHash: await hashPassword("secret123"), role: "ADMIN" } });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 1300 }, acceptDownloads: true });
  await ctx.addCookies([{ name: "user_session", value: token, domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const T = { timeout: 30000 };

  try {
    // ---- main admin is protected ----
    const deact = await api(`/api/admin/users/${owner.id}`, "PATCH", { isActive: false });
    assert.equal(deact.status, 400, "the main admin can't be deactivated");
    assert.match((await deact.json()).error, /main admin/i);
    assert.equal((await api(`/api/admin/users/${owner.id}`, "PATCH", { role: "SCORER" })).status, 400, "…or demoted");
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).isActive, true);
    // another admin can be deactivated while the main admin remains
    assert.equal((await api(`/api/admin/users/${extraAdmin.id}`, "PATCH", { isActive: false })).status, 200);
    await api(`/api/admin/users/${extraAdmin.id}`, "PATCH", { isActive: true });

    // ---- invitation → join → pending → approve ----
    await page.goto(`${base}/admin/users`);
    await page.getByTestId("invite-section").waitFor(T);
    await page.getByText("Main admin", { exact: true }).first().waitFor(T); // the main admin is labelled
    await page.getByLabel("Invitation role").selectOption("SCORER");
    await page.getByRole("button", { name: "Create invitation link" }).click();
    const link = await page.getByLabel("Invitation link").inputValue();
    assert.match(link, /\/admin\/join\/[A-Za-z0-9_-]{20,}$/);

    const joiner = await browser.newContext({ viewport: { width: 600, height: 900 } });
    const jp = await joiner.newPage();
    await jp.goto(link.replace(/^https?:\/\/[^/]+/, base));
    await jp.getByLabel("Your name").fill("ZZ New Scorer");
    await jp.getByLabel("Username").fill(`zz-new-${stamp}`);
    await jp.getByLabel("Password").fill("welcome1");
    await jp.getByRole("button", { name: "Create my profile" }).click();
    await jp.getByTestId("join-done").waitFor(T);

    // the link works once
    await jp.goto(link.replace(/^https?:\/\/[^/]+/, base));
    await jp.getByTestId("join-invalid").waitFor(T);
    const pending = await prisma.user.findUniqueOrThrow({ where: { username: `zz-new-${stamp}` } });
    assert.deepEqual([pending.isActive, pending.pendingApproval, pending.role], [false, true, "SCORER"], "joiners wait for approval");
    const loginBefore = await fetch(`${base}/api/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: `zz-new-${stamp}`, password: "welcome1" }) });
    assert.equal(loginBefore.status, 403);
    assert.match((await loginBefore.json()).error, /waiting for an admin/);

    await page.reload();
    await page.getByTestId("pending-users").waitFor(T);
    await page.getByLabel(`Role for zz-new-${stamp}`).selectOption("ADMIN");
    await page.getByTestId("pending-users").getByRole("button", { name: "Approve" }).click();
    await page.getByTestId("pending-users").waitFor({ state: "detached", ...T });
    const approved = await prisma.user.findUniqueOrThrow({ where: { id: pending.id } });
    assert.deepEqual([approved.isActive, approved.pendingApproval, approved.role], [true, false, "ADMIN"], "approved, role adjusted");
    const loginAfter = await fetch(`${base}/api/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: `zz-new-${stamp}`, password: "welcome1" }) });
    assert.equal(loginAfter.status, 200, "can log in once approved");

    // revoked / bogus links are refused
    const inv = await (await api("/api/admin/invites", "POST", { role: "SCORER", note: "ZZ revoke me" })).json();
    await api(`/api/admin/invites/${inv.id}`, "DELETE");
    assert.equal((await api(`/api/admin/join/${inv.token}`, "POST", { name: "x", username: "zzzz", password: "123456" }, { "Content-Type": "application/json" })).status, 410, "a revoked invite can't be used");
    assert.equal((await api("/api/admin/join/not-a-token", "POST", { name: "x", username: "zzzz", password: "123456" }, { "Content-Type": "application/json" })).status, 410);
    assert.equal((await fetch(`${base}/api/admin/invites`)).status, 401, "creating invites needs an admin login");
    // decline removes a pending joiner
    const inv2 = await (await api("/api/admin/invites", "POST", { role: "SCORER" })).json();
    assert.equal((await api(`/api/admin/join/${inv2.token}`, "POST", { name: "ZZ Decline", username: `zz-dec-${stamp}`, password: "123456" }, { "Content-Type": "application/json" })).status, 201);
    const dec = await prisma.user.findUniqueOrThrow({ where: { username: `zz-dec-${stamp}` } });
    assert.equal((await api(`/api/admin/users/${dec.id}/approve`, "DELETE")).status, 200);
    assert.equal(await prisma.user.count({ where: { id: dec.id } }), 0, "declined joiner is removed");

    // ---- applicant list backup ----
    const reg = await prisma.registration.create({ data: { seasonId: season.id, name: "ZZ Export Person", affiliation: "Spring 28", contact: "090", studentId: `ZZEXP${stamp}`, position: "FWD", source: "SELF_SERVE", status: "PENDING" } });
    await page.goto(`${base}/admin/registrations`);
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.getByTestId("export-applicants").click()]);
    assert.match(dl.suggestedFilename(), /^bfl-applicants-zz-team-.*\.xlsx$/);
    const file = `/tmp/zz-export-${stamp}.xlsx`;
    await dl.saveAs(file);
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(XLSX.readFile(file).Sheets["Applicants"]);
    fs.rmSync(file, { force: true });
    const row = rows.find((r) => r["Name"] === "ZZ Export Person");
    assert.ok(row, "the applicant is in the file");
    assert.deepEqual([row!["Affiliation"], row!["Position"], row!["Student ID"], row!["Status"], row!["Current semester"]], ["Spring 28", "FWD", `ZZEXP${stamp}`, "PENDING", "6th semester"], "columns match the import template + extras");
    assert.equal((await fetch(`${base}/api/admin/registrations/export`)).status, 401, "export needs an admin login");

    // ---- manual add with a photo ----
    const photo = fs.readdirSync("public/photos").find((f) => f.endsWith(".jpg"));
    assert.ok(photo, "a sample photo exists");
    const form = page.locator("form", { hasText: "Add (auto-approved)" });
    await form.getByPlaceholder("Name").fill("ZZ Manual Photo");
    await form.getByLabel("Batch term").selectOption("FALL");
    await form.getByLabel("Batch year").selectOption("2028");
    await form.getByPlaceholder("Contact").fill("090-0000");
    await form.locator('input[type="file"]').setInputFiles(`public/photos/${photo}`);
    await form.getByRole("button", { name: "Add (auto-approved)" }).click();
    await page.getByText(/Added with photo/).waitFor({ timeout: 240000 });
    const added = await prisma.registration.findFirstOrThrow({ where: { seasonId: season.id, name: "ZZ Manual Photo" } });
    const player = await prisma.player.findFirstOrThrow({ where: { seasonId: season.id, personId: added.personId! } });
    assert.ok(player.photoUrl, "the photo is saved on the player card");

    // ---- application page: highlighted deadline + new next-steps copy ----
    const pub = await (await browser.newContext({ viewport: { width: 1100, height: 1300 } })).newPage();
    await pub.goto(`${base}/register`);
    await pub.getByTestId("deadline").waitFor(T);
    assert.match(await pub.getByTestId("deadline").innerText(), /Apply before[\s\S]*days left/i);
    await pub.getByLabel("Name", { exact: true }).fill("ZZ Next Steps");
    await pub.getByLabel("Current semester").selectOption("3");
    await pub.getByLabel("Contact").fill("x");
    await pub.getByLabel("Student ID").fill(`ZZNS${stamp}`);
    await pub.getByRole("button", { name: "Submit application" }).click();
    await pub.getByText("What happens next").waitFor(T);
    const next = await pub.getByText("What happens next").locator("..").innerText();
    for (const t of ["Save the edit link for later, and feel free to share your player card.", "The organizer will review and approve your application.", "Teams will be formed based on the formation system for this season", "Snake draft", "Auction", "You will be notified about the updates in the BFL group."]) assert.ok(next.includes(t), `next steps mention: ${t}`);

    assert.deepEqual(errors, [], "no uncaught page errors");
    console.log("✓ admin team: invites + approval, main admin protected, Excel backup, manual-add photo, deadline + next-steps copy");
  } finally {
    await browser.close();
    await prisma.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: originalPointer } });
    await prisma.adminInvite.deleteMany({ where: { OR: [{ note: { startsWith: "ZZ" } }, { usedBy: { username: { startsWith: "zz-" } } }, { createdBy: { id: owner.id } }] } });
    await prisma.user.deleteMany({ where: { username: { startsWith: "zz-" } } });
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
