// The player list PDF (BFL format): title + version stamp, red notes, Name | Semester | Position | Photo,
// grouped by semester (Alumni first, then 8 → 1), captains marked (C) with a legend, per-status downloads.
// Throwaway ZZ season; dev/test branch only. Run: ALLOW_DB_WRITE_TESTS=1 npm run test:export
import assert from "node:assert/strict";
import { config } from "dotenv";
import { pdfText } from "./_pdf";
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
  const { findOrCreateFranchise } = await import("../../lib/franchise");
  const { batchLabelForSemester } = await import("../../lib/batch");
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN", isActive: true } });
  const cookie = { Cookie: `user_session=${await createUserSessionToken(admin.id)}` };
  const tournament = await prisma.tournament.findUniqueOrThrow({ where: { slug: "bfl" } });
  const original = tournament.currentSeasonId;
  const stamp = Date.now();
  const season = await prisma.season.create({
    data: { tournamentId: tournament.id, number: 9600 + (stamp % 90), name: "ZZ Export Season", slug: `zz-exp-${stamp}`, year: 2080, status: "ACTIVE", teamFormation: "AUCTION", registrationOpen: true, registrationSelfServeEnabled: true },
  });
  await prisma.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: season.id } });
  const team = await prisma.team.create({ data: { seasonId: season.id, name: "ZZ Export FC", franchiseId: (await findOrCreateFranchise(tournament.id, "ZZ Export FC")).id } });
  const mk = async (name: string, i: number, status: "PENDING" | "APPROVED" | "REJECTED", semester: number) => {
    const reg = await prisma.registration.create({ data: { seasonId: season.id, name, affiliation: batchLabelForSemester(semester), contact: "090", studentId: `ZZEX${stamp}${i}`, position: "MID", source: "SELF_SERVE", status } });
    if (status === "APPROVED") await approveRegistration(reg, season);
    return reg;
  };
  // created scrambled on purpose
  await mk("ZZ Yara", 1, "REJECTED", 3);
  await mk("ZZ Bela", 2, "PENDING", 4);
  await mk("ZZ Zed", 3, "APPROVED", 5);
  await mk("ZZ Amir", 4, "APPROVED", 8);
  await mk("ZZ Cara", 5, "APPROVED", 5);
  await mk("ZZ Old", 6, "APPROVED", 11); // alumni
  const captain = await prisma.player.findFirstOrThrow({ where: { seasonId: season.id, name: "ZZ Cara" } });
  await prisma.player.update({ where: { id: captain.id }, data: { teamId: team.id, isCaptain: true, jerseyNumber: 1 } });

  const get = async (q = "") => {
    const res = await fetch(`${base}/api/admin/registrations/export${q}`, { headers: cookie });
    return { res, text: res.ok ? pdfText(Buffer.from(await res.arrayBuffer())) : "" };
  };
  try {
    const { res, text } = await get();
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/pdf");
    assert.match(res.headers.get("content-disposition") ?? "", /bfl-player-list-zz-exp-.*\.pdf/);
    assert.ok(text.includes("ZZ Export Season") && /\(Player list v\d\d\.\d\d-\d\d:\d\d\)/.test(text), "title and version stamp");
    assert.ok(text.includes("**Players in green boxes are captains**") && text.includes("**These players will not be available for bidding**"), "legend for captains / not biddable");
    for (const h of ["Name", "Semester", "Position"]) assert.ok(text.includes(h), `${h} column`);
    // approved only by default; Alumni first, then 8, then 5 (A–Z inside); captains marked (C)
    const order = ["ZZ Old", "ZZ Amir", "ZZ Cara (C)", "ZZ Zed"].map((n) => text.indexOf(n));
    assert.ok(order.every((i) => i > -1), "all approved players are listed");
    assert.deepEqual([...order].sort((a, b) => a - b), order, "Alumni, then semester 8, then 5 — A–Z inside a semester");
    assert.ok(!text.includes("ZZ Bela") && !text.includes("ZZ Yara"), "pending/rejected aren't in the player list");
    assert.ok(text.includes("Alumni") && text.includes("Midfielder"), "semester and position words");

    const pending = (await get("?status=pending")).text;
    assert.ok(pending.includes("Pending applications") && pending.includes("ZZ Bela") && !pending.includes("ZZ Zed"));
    const rejected = (await get("?status=rejected")).text;
    assert.ok(rejected.includes("ZZ Yara") && !rejected.includes("ZZ Bela"));
    const all = (await get("?status=all")).text;
    for (const n of ["ZZ Yara", "ZZ Bela", "ZZ Zed", "ZZ Amir", "ZZ Old"]) assert.ok(all.includes(n), `everyone: ${n}`);
    assert.equal((await get("?status=nonsense")).res.status, 400);
    assert.equal((await fetch(`${base}/api/admin/registrations/export`)).status, 401);
    console.log("✓ player list PDF: BFL format, version stamp, notes, semester order, captains (C), status filters");
  } finally {
    await prisma.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: original } });
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
