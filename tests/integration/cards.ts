// Player cards end to end: organiser rating editor (browser), card APIs
// (validation, clamping, frozen-season guard, cut-out upload checks), form
// bonus from match events, the public gallery and its PNG download.
// Throwaway ZZ season; dev branch only; needs a dev server on :3100.
//
// Run: ALLOW_DB_WRITE_TESTS=1 npm run test:cards
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
  const { createUserSessionToken } = await import("../../lib/userAuth");
  const { findOrCreateFranchise } = await import("../../lib/franchise");

  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN", isActive: true } });
  const token = await createUserSessionToken(admin.id);
  const tournament = await prisma.tournament.findUniqueOrThrow({ where: { slug: "bfl" } });
  const original = tournament.currentSeasonId;
  const stamp = Date.now();
  const season = await prisma.season.create({
    data: { tournamentId: tournament.id, number: 40000 + (stamp % 9000), name: "ZZ Cards", slug: `zz-cards-${stamp}`, year: 2093, status: "ACTIVE", teamFormation: "MANUAL", squadSizeMin: 2, squadSizeMax: 5 },
  });
  await prisma.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: season.id } });
  const team = await prisma.team.create({ data: { seasonId: season.id, name: "ZZ Reds", franchiseId: (await findOrCreateFranchise(tournament.id, "ZZ Reds")).id } });
  const mkPlayer = async (name: string, position: "GK" | "FWD" | null, teamId: string | null, jersey: number) => {
    const person = await prisma.person.create({ data: { name } });
    return prisma.player.create({ data: { seasonId: season.id, personId: person.id, teamId, name, position, jerseyNumber: jersey } });
  };
  const striker = await mkPlayer("ZZ Striker", "FWD", team.id, 9);
  const keeper = await mkPlayer("ZZ Keeper", "GK", team.id, 1);
  const pooled = await mkPlayer("ZZ Pooled", "FWD", null, 0);
  const archivedPlayer = await prisma.player.findFirstOrThrow({ where: { season: { slug: "ix" } } });

  const api = (path: string, method: string, body?: unknown) =>
    fetch(base + path, { method, headers: { Cookie: `user_session=${token}`, ...(body === undefined || body instanceof FormData ? {} : { "Content-Type": "application/json" }) }, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 1000 }, acceptDownloads: true });
  await ctx.addCookies([{ name: "user_session", value: token, domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  const T = { timeout: 30000 };

  try {
    // ---- API rules ----
    assert.equal((await api(`/api/admin/players/${striker.id}/card`, "PATCH", { ratings: { pac: 500, sho: 5, junk: 70 }, photoZoom: 9999, photoX: -999 })).status, 200);
    const clamped = await prisma.player.findUniqueOrThrow({ where: { id: striker.id } });
    assert.deepEqual(clamped.ratings, { pac: 99, sho: 30 }, "ratings are clamped to 30–99 and unknown keys dropped");
    assert.equal(clamped.photoZoom, 220, "zoom is clamped");
    assert.equal(clamped.photoX, -60, "offset is clamped");
    assert.equal((await api(`/api/admin/players/${striker.id}/card`, "PATCH", { cardTier: "mythic" })).status, 400, "unknown tier is rejected");
    assert.equal((await api(`/api/admin/players/${striker.id}/card`, "PATCH", {})).status, 400, "an empty change is rejected");
    assert.equal((await api(`/api/admin/players/${archivedPlayer.id}/card`, "PATCH", { cardTier: "special" })).status, 409, "frozen editions can't be changed");
    assert.equal((await fetch(`${base}/api/admin/players/${striker.id}/card`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 401, "anonymous is refused");

    // cut-out upload: validation always, storage only when R2 exists
    const notPng = new FormData();
    notPng.append("cutout", new Blob(["hello"], { type: "image/png" }), "x.png");
    assert.equal((await api(`/api/admin/players/${striker.id}/cutout`, "POST", notPng)).status, 400, "a fake PNG is rejected by signature");
    const wrongType = new FormData();
    wrongType.append("cutout", new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: "image/jpeg" }), "x.jpg");
    assert.equal((await api(`/api/admin/players/${striker.id}/cutout`, "POST", wrongType)).status, 400, "wrong content type is rejected");
    const goodPng = new FormData();
    goodPng.append("cutout", new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])], { type: "image/png" }), "x.png");
    const up = await api(`/api/admin/players/${striker.id}/cutout`, "POST", goodPng);
    assert.equal(up.status, r2 ? 200 : 503, r2 ? "valid cut-out is stored" : "no R2 locally => clear 503, nothing half-saved");
    if (!r2) assert.equal((await prisma.player.findUniqueOrThrow({ where: { id: striker.id } })).cutoutKey, null);
    assert.equal((await api(`/api/admin/players/${striker.id}/cutout`, "DELETE")).status, 200);

    // ---- editor UI: ratings -> live overall/tier -> save ----
    await page.goto(`${base}/admin/cards`);
    await page.getByText("ZZ Striker").waitFor(T);
    assert.equal(await page.getByText("ZZ Pooled").count() > 0, true, "pool players appear in the editor");
    await page.locator("li", { hasText: "ZZ Striker" }).getByRole("button").first().click();
    for (const [k, v] of [["PAC", 80], ["SHO", 85], ["PAS", 70], ["DRI", 78], ["DEF", 40], ["PHY", 72]] as const) {
      await page.getByLabel(`${k} of ZZ Striker`).fill(String(v));
    }
    // FWD: .2*80 + .3*85 + .1*70 + .25*78 + 0 + .15*72 = 78.8 -> 79 (gold)
    await page.getByText("Overall 79").waitFor(T);
    assert.equal(await page.locator(".pcard--gold").count() > 0, true, "79 renders as a gold card");
    await page.getByRole("button", { name: "Save card" }).click();
    await page.getByText("Saved.").waitFor(T);
    assert.deepEqual((await prisma.player.findUniqueOrThrow({ where: { id: striker.id } })).ratings, { pac: 80, sho: 85, pas: 70, dri: 78, def: 40, phy: 72 });

    // keeper uses keeper stats
    await page.locator("li", { hasText: "ZZ Keeper" }).getByRole("button").first().click();
    await page.getByLabel("DIV of ZZ Keeper").waitFor(T);
    assert.equal(await page.getByLabel("PAC of ZZ Keeper").count(), 0, "a keeper has no PAC rating");

    // ---- form bonus from match events shows up on the public gallery ----
    const rival = await prisma.team.create({ data: { seasonId: season.id, name: "ZZ Blues", franchiseId: (await findOrCreateFranchise(tournament.id, "ZZ Blues")).id } });
    const m = await prisma.match.create({ data: { seasonId: season.id, round: "LEAGUE", homeTeamId: team.id, awayTeamId: rival.id, status: "FINISHED", homeScore: 3 } });
    for (let i = 0; i < 3; i++) await prisma.matchEvent.create({ data: { matchId: m.id, type: "GOAL", teamId: team.id, playerId: striker.id, groupId: `zz-${i}` } });

    await page.goto(`${base}/cards`);
    await page.getByLabel("Download ZZ Striker's card as an image").waitFor(T);
    assert.equal(await page.getByLabel("Download ZZ Pooled's card as an image").count(), 0, "unassigned players aren't on the public gallery");
    const strikerCard = page.locator("figure", { hasText: "ZZ Reds" }).filter({ hasText: "ZZ STRIKER" });
    assert.equal((await strikerCard.locator(".pcard__ovr").innerText()).trim(), "82", "79 base + 3 form goals");
    assert.equal((await strikerCard.locator(".pcard__form").innerText()).trim(), "+3");
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), strikerCard.getByRole("button", { name: /Download/ }).click()]);
    const file = await download.path();
    const head = fs.readFileSync(file!).subarray(0, 8);
    assert.deepEqual([...head], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "the download is a real PNG");
    assert.ok(fs.statSync(file!).size > 5000, "the PNG isn't empty");
    assert.match(download.suggestedFilename(), /ZZ-Striker-card\.png$/);

    // filters
    await page.getByLabel("Position").selectOption("GK");
    assert.equal(await page.locator("figure").count(), 1, "position filter keeps only the keeper");

    assert.deepEqual(pageErrors, [], "no uncaught page errors");
    console.log("✓ cards: ratings editor, API validation/guards, form bonus, public gallery, PNG download");
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
  void keeper;
  void pooled;
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
