// The organiser's team set-up and review shortcuts, in a real browser:
//  - registrations: click anywhere on a row to select, Select all, Approve selected, Approve all
//  - "Set up the teams": name, short name, logo upload, manager (+login), captain
//  - a captain is placed with the team; in an auction season their lot is closed out
//  - the Season checklist gets a "Set up the teams" step
// Throwaway ZZ seasons; dev/test branch only; needs a dev server. Run: ALLOW_DB_WRITE_TESTS=1 npm run test:teamsetup
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { config } from "dotenv";
import { chromium } from "playwright-core";
config({ path: process.env.TEST_ENV_FILE ?? ".env.local" });

if (process.env.ALLOW_DB_WRITE_TESTS !== "1") {
  console.log("skipped: set ALLOW_DB_WRITE_TESTS=1 (dev/test branch only)");
  process.exit(0);
}
const base = process.env.SMOKE_BASE_URL ?? "http://localhost:3100";
// A valid 1x1 PNG, used as the team logo.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function main() {
  const { prisma } = await import("../../lib/db");
  const { createUserSessionToken } = await import("../../lib/userAuth");
  const { approveRegistration } = await import("../../lib/registrationApproval");

  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN", isActive: true } });
  const token = await createUserSessionToken(admin.id);
  const tournament = await prisma.tournament.findUniqueOrThrow({ where: { slug: "bfl" } });
  const original = tournament.currentSeasonId;
  const stamp = Date.now();
  const seasonIds: string[] = [];
  const mkSeason = async (n: number, formation: "MANUAL" | "AUCTION") => {
    const s = await prisma.season.create({
      data: { tournamentId: tournament.id, number: 4000 + ((stamp + n) % 900), name: `ZZ Team Setup ${n}`, slug: `zz-ts-${stamp}-${n}`, year: 2088, status: "ACTIVE", teamFormation: formation, squadSizeMin: 2, squadSizeMax: 5 },
    });
    seasonIds.push(s.id);
    return s;
  };
  const apply = (seasonId: string, name: string, i: number, status: "PENDING" | "APPROVED") =>
    prisma.registration.create({ data: { seasonId, name, affiliation: "Fall 28", contact: "x", studentId: `ZZTS${stamp}${seasonId.slice(-4)}${i}`, position: "MID", source: "SELF_SERVE", status } });

  const logoPath = path.join(os.tmpdir(), `zz-logo-${stamp}.png`);
  fs.writeFileSync(logoPath, PNG);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 1200 } });
  await ctx.addCookies([{ name: "user_session", value: token, domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const T = { timeout: 30000 };
  const api = (p: string, method: string, body?: unknown) =>
    fetch(base + p, { method, headers: { Cookie: `user_session=${token}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

  try {
    // ================= registrations: row-click select + approve all =================
    const s1 = await mkSeason(1, "MANUAL");
    await prisma.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: s1.id } });
    for (const [i, n] of ["ZZ Reg A", "ZZ Reg B", "ZZ Reg C", "ZZ Reg D", "ZZ Reg E", "ZZ Reg F"].entries()) await apply(s1.id, n, i, "PENDING");

    await page.goto(`${base}/admin/registrations`);
    await page.getByText("ZZ Reg A").waitFor(T);
    const row = (n: string) => page.locator("li", { hasText: n });
    await row("ZZ Reg A").getByText("ZZ Reg A").click(); // click on the NAME, not the checkbox
    assert.equal(await row("ZZ Reg A").getAttribute("aria-selected"), "true", "clicking anywhere on the row selects it");
    await row("ZZ Reg A").getByText("ZZ Reg A").click();
    assert.equal(await row("ZZ Reg A").getAttribute("aria-selected"), "false", "clicking again deselects");
    await row("ZZ Reg B").click({ position: { x: 300, y: 8 } }); // empty space on the row
    await row("ZZ Reg C").getByText("Fall 28").click();
    await page.getByRole("button", { name: "Approve 2 selected" }).click();
    for (let i = 0; i < 40 && (await prisma.registration.count({ where: { seasonId: s1.id, status: "APPROVED" } })) < 2; i++) await new Promise((r) => setTimeout(r, 400));
    assert.equal(await prisma.registration.count({ where: { seasonId: s1.id, status: "APPROVED" } }), 2, "the two clicked rows were approved");
    await page.getByRole("button", { name: "Approve all 4" }).waitFor(T); // the list has refreshed
    await page.getByRole("button", { name: "Select all" }).click();
    await page.getByRole("button", { name: /Approve 4 selected/ }).waitFor(T);
    await page.getByRole("button", { name: "Clear selection" }).click();
    await page.getByRole("button", { name: "Approve all 4" }).click(); // no selection needed (the confirm dialog is accepted)
    for (let i = 0; i < 40 && (await prisma.registration.count({ where: { seasonId: s1.id, status: "APPROVED" } })) < 6; i++) await new Promise((r) => setTimeout(r, 400));
    for (let i = 0; i < 40 && (await prisma.player.count({ where: { seasonId: s1.id } })) < 6; i++) await new Promise((r) => setTimeout(r, 400));
    assert.equal(await prisma.registration.count({ where: { seasonId: s1.id, status: "PENDING" } }), 0, "Approve all clears the whole pending list");
    assert.equal(await prisma.player.count({ where: { seasonId: s1.id, teamId: null } }), 6, "all six are now in the pool");
    // approved rows are not selectable
    await page.getByRole("button", { name: /Approve all/ }).waitFor({ state: "detached", timeout: 30000 }); // nothing left to approve

    // ================= the Season checklist knows about team set-up =================
    await page.goto(`${base}/admin/season`);
    const step = (k: string) => page.locator(`[data-step="${k}"]`);
    await step("teamsetup").waitFor(T);
    assert.equal(await step("teamsetup").getAttribute("data-status"), "current", "team set-up is the next thing to do");
    assert.equal(await step("teams").getAttribute("data-status"), "todo");

    // ================= set up two teams =================
    await page.goto(`${base}/admin/season/teams`);
    await page.getByLabel("Team name").first().waitFor(T);
    const poolNames = (await prisma.player.findMany({ where: { seasonId: s1.id, teamId: null }, orderBy: { name: "asc" } })).map((p) => p);
    const addForm = page.getByRole("form", { name: "New team" });
    await addForm.getByLabel("Team name").fill("ZZ Reds");
    await addForm.getByLabel("Short name").fill("ZR");
    await addForm.locator('input[type="file"]').setInputFiles(logoPath);
    await addForm.getByLabel("Manager name").fill("ZZ Coach Rahim");
    await addForm.getByLabel("Manager login password").fill("sekret-12");
    await addForm.getByLabel("Captain").selectOption(poolNames[0].id);
    await addForm.getByRole("button", { name: "Add team" }).click();
    await page.getByRole("form", { name: "Team ZZ Reds" }).waitFor(T);

    const reds = await prisma.team.findFirstOrThrow({ where: { seasonId: s1.id, name: "ZZ Reds" } });
    assert.equal(reds.shortName, "ZR");
    assert.equal(reds.managerName, "ZZ Coach Rahim");
    assert.ok(reds.logoUrl, "the logo is saved");
    const logoRes = await fetch(reds.logoUrl!.startsWith("http") ? reds.logoUrl! : base + reds.logoUrl!);
    assert.equal(logoRes.status, 200, "and served back");
    assert.equal(logoRes.headers.get("content-type"), "image/png");
    const owner = await prisma.user.findFirstOrThrow({ where: { role: "OWNER", teamId: reds.id } });
    assert.ok(owner.isActive, "the optional manager login exists");
    const cap = await prisma.player.findUniqueOrThrow({ where: { id: poolNames[0].id } });
    assert.equal(cap.teamId, reds.id, "the captain is placed on the team");
    assert.equal(cap.isCaptain, true);
    assert.equal(cap.jerseyNumber, 1);

    // a team with nothing optional filled in is fine too
    const addForm2 = page.getByRole("form", { name: "New team" });
    await addForm2.getByLabel("Team name").fill("ZZ Blues");
    await addForm2.getByRole("button", { name: "Add team" }).click();
    await page.getByRole("form", { name: "Team ZZ Blues" }).waitFor(T);
    const blues = await prisma.team.findFirstOrThrow({ where: { seasonId: s1.id, name: "ZZ Blues" } });
    assert.equal(blues.managerName, null);
    assert.equal(await prisma.user.count({ where: { teamId: blues.id } }), 0, "no manager login unless asked");

    // change the captain: exactly one captain per team, and the old one stays on the squad
    await page.getByRole("form", { name: "Team ZZ Reds" }).getByLabel("Captain").selectOption(poolNames[1].id);
    await page.getByRole("form", { name: "Team ZZ Reds" }).getByRole("button", { name: "Save team" }).click();
    await page.getByRole("form", { name: "Team ZZ Reds" }).getByText("Saved.").waitFor(T);
    const squad = await prisma.player.findMany({ where: { teamId: reds.id }, orderBy: { jerseyNumber: "asc" } });
    assert.deepEqual(squad.map((p) => [p.id, p.isCaptain]), [[poolNames[0].id, false], [poolNames[1].id, true]]);

    // the captain endpoint refuses someone who is already on another team
    const bad = await api(`/api/admin/teams/${blues.id}/captain`, "POST", { playerId: poolNames[0].id });
    assert.equal(bad.status, 409);

    // the checklist moves on
    await page.goto(`${base}/admin/season`);
    await step("teamsetup").waitFor(T);
    assert.equal(await step("teamsetup").getAttribute("data-status"), "done", "two teams exist");

    // ================= auction season: a captain's lot is closed out =================
    const s2 = await mkSeason(2, "AUCTION");
    await prisma.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: s2.id } });
    for (const [i, n] of ["ZZ Auc A", "ZZ Auc B", "ZZ Auc C"].entries()) {
      const reg = await apply(s2.id, n, i, "APPROVED");
      await approveRegistration(reg, s2);
    }
    assert.equal(await prisma.auctionLot.count({ where: { seasonId: s2.id, status: "QUEUED" } }), 3);
    const t2 = await (await api("/api/admin/teams", "POST", { name: "ZZ Auction Team" })).json();
    const auctionCaptain = await prisma.player.findFirstOrThrow({ where: { seasonId: s2.id, name: "ZZ Auc B" } });
    assert.equal((await api(`/api/admin/teams/${t2.team.id}/captain`, "POST", { playerId: auctionCaptain.id })).status, 200);
    const lot = await prisma.auctionLot.findFirstOrThrow({ where: { playerId: auctionCaptain.id } });
    assert.equal(lot.status, "SOLD", "the captain's auction lot is closed out");
    assert.equal(lot.soldPrice, 0, "at no charge");
    assert.equal(await prisma.auctionLot.count({ where: { seasonId: s2.id, status: "QUEUED" } }), 2, "the auction will not offer the captain again");
    // clearing the captain keeps the player on the team
    assert.equal((await api(`/api/admin/teams/${t2.team.id}/captain`, "POST", { playerId: null })).status, 200);
    const after = await prisma.player.findUniqueOrThrow({ where: { id: auctionCaptain.id } });
    assert.equal(after.isCaptain, false);
    assert.equal(after.teamId, t2.team.id);

    // a frozen season can't be edited
    await prisma.season.update({ where: { id: s2.id }, data: { status: "ARCHIVED" } });
    assert.equal((await api(`/api/admin/teams/${t2.team.id}/captain`, "POST", { playerId: auctionCaptain.id })).status, 409);
    await prisma.season.update({ where: { id: s2.id }, data: { status: "ACTIVE" } });

    // the old Teams link still works
    await page.goto(`${base}/admin/teams`);
    await page.waitForURL(/\/admin\/season\/teams/, T);

    assert.deepEqual(errors, [], "no uncaught page errors");
    console.log("✓ team setup: row-click select, select/approve all, logo + manager + captain, auction lot closed out, checklist step");
  } finally {
    await browser.close();
    fs.rmSync(logoPath, { force: true });
    await prisma.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: original } });
    for (const seasonId of seasonIds) {
      await prisma.user.deleteMany({ where: { team: { seasonId } } });
      await prisma.matchEvent.deleteMany({ where: { match: { seasonId } } });
      await prisma.season.delete({ where: { id: seasonId } }).catch((e) => console.error("cleanup", e.message));
    }
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
