// Auction presentation + handout: poster upload, projector run-of-show (poster → captains →
// let's begin → auction), break/resume from the console, captains not biddable, players PDF.
// Throwaway ZZ season; dev/test branch only. Run: ALLOW_DB_WRITE_TESTS=1 npm run test:auctionshow
import assert from "node:assert/strict";
import fs from "node:fs";
import { inflateSync } from "node:zlib";
import { config } from "dotenv";
import { chromium } from "playwright-core";
config({ path: process.env.TEST_ENV_FILE ?? ".env.local" });

if (process.env.ALLOW_DB_WRITE_TESTS !== "1") {
  console.log("skipped: set ALLOW_DB_WRITE_TESTS=1 (dev/test branch only)");
  process.exit(0);
}
const base = process.env.SMOKE_BASE_URL ?? "http://localhost:3100";

/** All text drawn in a pdf-lib document (its content streams are plain Flate). */
function pdfText(buf: Buffer): string {
  const raw = buf.toString("latin1");
  let out = "";
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      const content = inflateSync(Buffer.from(m[1], "latin1")).toString("latin1");
      // pdf-lib writes shown text as hex strings: <5A5A…> Tj
      for (const t of content.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) out += Buffer.from(t[1], "hex").toString("latin1") + "\n";
    } catch {
      /* image streams etc. */
    }
  }
  return out;
}

async function main() {
  const { prisma } = await import("../../lib/db");
  const { createUserSessionToken } = await import("../../lib/userAuth");
  const { approveRegistration } = await import("../../lib/registrationApproval");
  const { findOrCreateFranchise } = await import("../../lib/franchise");
  const { batchLabelForSemester } = await import("../../lib/batch");
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN", isActive: true } });
  const token = await createUserSessionToken(admin.id);
  const cookie = { Cookie: `user_session=${token}` };
  const tournament = await prisma.tournament.findUniqueOrThrow({ where: { slug: "bfl" } });
  const original = tournament.currentSeasonId;
  const stamp = Date.now();
  const season = await prisma.season.create({
    data: { tournamentId: tournament.id, number: 9800 + (stamp % 190), name: "ZZ Show Season", slug: `zz-show-${stamp}`, year: 2082, status: "ACTIVE", teamFormation: "AUCTION", squadSizeMin: 2, squadSizeMax: 4 },
  });
  const settings = await prisma.auctionSettings.create({ data: { seasonId: season.id, budgetPerTeam: 1000, basePrice: 50, bidIncrement: 10 } });
  await prisma.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: season.id } });
  const mkTeam = async (name: string) => prisma.team.create({ data: { seasonId: season.id, name, franchiseId: (await findOrCreateFranchise(tournament.id, name)).id } });
  const t1 = await mkTeam("ZZ Reds");
  await mkTeam("ZZ Blues");
  const photos = fs.readdirSync("public/photos").filter((f) => f.endsWith(".jpg")).slice(0, 3);
  const names = ["ZZ Captain One", "ZZ Bid Alpha", "ZZ Bid Beta", "ZZ Bid Gamma"];
  for (const [i, name] of names.entries()) {
    const reg = await prisma.registration.create({
      data: { seasonId: season.id, name, affiliation: batchLabelForSemester(3 + i), contact: "x", studentId: `ZZSH${stamp}${i}`, position: (["MID", "GK", "DEF", "FWD"] as const)[i], source: "ADMIN_MANUAL", status: "APPROVED" },
    });
    await approveRegistration(reg, season);
  }
  const players = await prisma.player.findMany({ where: { seasonId: season.id }, orderBy: { name: "asc" } });
  for (const [i, p] of players.entries()) if (photos[i]) await prisma.player.update({ where: { id: p.id }, data: { photoUrl: `/photos/${photos[i]}` } });
  const captain = players.find((p) => p.name === "ZZ Captain One")!;

  const post = (p: string, body?: unknown) => fetch(base + p, { method: "POST", headers: { ...cookie, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const stage = async () => (await (await fetch(`${base}/api/public/auction/stage`, { cache: "no-store" })).json()) as { phase: string; [k: string]: unknown };

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1400 } });
  await ctx.addCookies([{ name: "user_session", value: token, domain: "localhost", path: "/" }]);
  const admPage = await ctx.newPage();
  const projector = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errors: string[] = [];
  admPage.on("pageerror", (e) => errors.push(e.message));
  projector.on("pageerror", (e) => errors.push(e.message));
  const T = { timeout: 30000 };

  try {
    // ---- a captain is placed with the team and is not up for bidding ----
    assert.equal((await post(`/api/admin/teams/${t1.id}/captain`, { playerId: captain.id })).status, 200);
    const lot = await prisma.auctionLot.findUniqueOrThrow({ where: { playerId: captain.id } });
    assert.equal(lot.status, "SOLD", "the captain's lot is closed out");
    assert.equal((await prisma.player.findUniqueOrThrow({ where: { id: captain.id } })).teamId, t1.id);

    // ---- players PDF: pictures, available players only, captains listed separately ----
    const pdfRes = await fetch(`${base}/api/admin/auction/players-pdf`, { headers: cookie });
    assert.equal(pdfRes.status, 200);
    assert.equal(pdfRes.headers.get("content-type"), "application/pdf");
    const pdf = Buffer.from(await pdfRes.arrayBuffer());
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    const text = pdfText(pdf);
    for (const n of ["ZZ Bid Alpha", "ZZ Bid Beta", "ZZ Bid Gamma"]) assert.ok(text.includes(n), `${n} is in the PDF`);
    assert.ok(text.includes("ZZ Captain One"), "the captain is listed in the captains section");
    assert.ok(text.includes("not up for bidding"), "captains are marked as not up for bidding");
    assert.ok(text.includes("3 players available for bidding"), "the count excludes the captain");
    assert.ok((pdf.toString("latin1").match(/\/Subtype\s*\/Image/g) ?? []).length >= 1, "pictures are embedded");
    assert.equal((await fetch(`${base}/api/admin/auction/players-pdf`)).status, 401, "needs an admin login");

    // ---- poster upload + run of show through the API ----
    const noPoster = await post("/api/admin/auction/stage", { mode: "POSTER" });
    assert.equal(noPoster.status, 409, "needs a poster first");
    const fd = new FormData();
    const bytes = fs.readFileSync(`public/photos/${photos[0]}`);
    fd.append("poster", new Blob([bytes], { type: "image/jpeg" }), "poster.jpg");
    const up = await fetch(`${base}/api/admin/auction/poster`, { method: "POST", headers: cookie, body: fd });
    assert.equal(up.status, 200, await up.clone().text());

    for (const [mode, phase] of [["POSTER", "poster"], ["CAPTAINS", "captains"], ["BEGIN", "begin"], ["LIVE", "between"], ["BREAK", "poster"]] as const) {
      assert.equal((await post("/api/admin/auction/stage", { mode })).status, 200, mode);
      const s = await stage();
      assert.equal(s.phase, phase, `${mode} → ${phase}`);
      assert.ok(!/budget|remaining|squad/i.test(JSON.stringify(s)), "the projector state carries no budgets or squads");
      if (mode === "BREAK") assert.equal(s.onBreak, true);
      if (mode === "POSTER") assert.equal(s.onBreak, false);
      if (mode === "CAPTAINS") {
        const caps = s.captains as { teamName: string; name: string }[];
        assert.deepEqual(caps.map((c) => [c.teamName, c.name]), [["ZZ Blues", ""], ["ZZ Reds", "ZZ Captain One"]], "every team appears, with its captain");
      }
    }

    // ---- the console drives the projector (UI) ----
    await projector.goto(`${base}/stage/auction`);
    await admPage.goto(`${base}/admin/auction`);
    const panel = admPage.getByTestId("presentation");
    await panel.waitFor(T);
    await panel.getByRole("button", { name: "▶ Resume the auction" }).click();
    await panel.getByRole("button", { name: /Take a break/ }).waitFor(T);
    await panel.getByRole("button", { name: /Take a break/ }).click();
    await projector.getByTestId("stage-poster").waitFor(T);
    await projector.getByTestId("stage-break").waitFor(T);
    await panel.getByRole("button", { name: "▶ Resume the auction" }).click();
    await projector.getByTestId("stage-poster").waitFor({ state: "detached", ...T });
    await panel.getByRole("button", { name: "Restart the intro" }).click();
    await projector.getByTestId("stage-poster").waitFor(T);
    await panel.getByRole("button", { name: /Next: captains/ }).click();
    await projector.getByTestId("stage-captains").waitFor(T);
    assert.match(await projector.getByTestId("stage-captains").innerText(), /zz reds/i);
    await panel.getByRole("button", { name: /Next: let.s begin/i }).click();
    await projector.getByTestId("stage-begin").waitFor(T);
    await panel.getByRole("button", { name: /Start the auction/ }).click();
    await projector.getByTestId("stage-begin").waitFor({ state: "detached", ...T });
    assert.equal((await prisma.auctionSettings.findUniqueOrThrow({ where: { id: settings.id } })).stageMode, "LIVE");

    assert.deepEqual(errors, [], "no uncaught page errors");
    console.log("✓ auction show: captains excluded, players PDF with pictures, poster → captains → let's begin → auction, break/resume");
  } finally {
    await browser.close();
    await prisma.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: original } });
    await prisma.matchEvent.deleteMany({ where: { match: { seasonId: season.id } } });
    await prisma.season.delete({ where: { id: season.id } }).catch((e) => console.error("cleanup", e.message));
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
