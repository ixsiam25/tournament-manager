// The applicant Excel list: numbered, grouped by status (approved → pending → rejected), A–Z within
// each, one sheet per status, "x only" downloads, and the same file imports back.
// Throwaway ZZ season; dev/test branch only. Run: ALLOW_DB_WRITE_TESTS=1 npm run test:export
import assert from "node:assert/strict";
import { config } from "dotenv";
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
  const { batchLabelForSemester } = await import("../../lib/batch");
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN", isActive: true } });
  const cookie = { Cookie: `user_session=${await createUserSessionToken(admin.id)}` };
  const tournament = await prisma.tournament.findUniqueOrThrow({ where: { slug: "bfl" } });
  const original = tournament.currentSeasonId;
  const stamp = Date.now();
  const season = await prisma.season.create({
    data: { tournamentId: tournament.id, number: 9600 + (stamp % 90), name: "ZZ Export Season", slug: `zz-exp-${stamp}`, year: 2080, status: "ACTIVE", registrationOpen: true, registrationSelfServeEnabled: true, registrationExcelImportEnabled: true },
  });
  await prisma.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: season.id } });
  const mk = (name: string, status: "PENDING" | "APPROVED" | "REJECTED", i: number) =>
    prisma.registration.create({ data: { seasonId: season.id, name, affiliation: batchLabelForSemester(2 + (i % 5)), contact: "090", studentId: `ZZEX${stamp}${i}`, position: "MID", source: "SELF_SERVE", status } });
  // created in a scrambled order on purpose
  await mk("ZZ Yara", "REJECTED", 1);
  await mk("ZZ Bela", "PENDING", 2);
  await mk("ZZ Zed", "APPROVED", 3);
  await mk("ZZ Amir", "APPROVED", 4);
  await mk("ZZ Cara", "PENDING", 5);
  await mk("ZZ Xan", "REJECTED", 6);

  const get = async (q = "") => XLSX.read(Buffer.from(await (await fetch(`${base}/api/admin/registrations/export${q}`, { headers: cookie })).arrayBuffer()));
  try {
    const wb = await get();
    assert.deepEqual(wb.SheetNames, ["All applicants", "Approved (2)", "Pending (2)", "Rejected (2)"], "one overall sheet plus one per status");
    const all = XLSX.utils.sheet_to_json<Record<string, string | number>>(wb.Sheets["All applicants"]);
    assert.deepEqual(all.map((r) => r["Name"]), ["ZZ Amir", "ZZ Zed", "ZZ Bela", "ZZ Cara", "ZZ Xan", "ZZ Yara"], "approved first, then pending, then rejected — A–Z inside each");
    assert.deepEqual(all.map((r) => r["No."]), [1, 2, 3, 4, 5, 6], "numbered 1…n");
    assert.deepEqual(all.map((r) => r["Status"]), ["Approved", "Approved", "Pending", "Pending", "Rejected", "Rejected"]);
    const pending = XLSX.utils.sheet_to_json<Record<string, string | number>>(wb.Sheets["Pending (2)"]);
    assert.deepEqual(pending.map((r) => [r["No."], r["Name"]]), [[1, "ZZ Bela"], [2, "ZZ Cara"]], "each status sheet restarts at 1");

    const only = await get("?status=approved");
    assert.deepEqual(only.SheetNames, ["Approved"]);
    const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(only.Sheets["Approved"]);
    assert.deepEqual(rows.map((r) => [r["No."], r["Name"]]), [[1, "ZZ Amir"], [2, "ZZ Zed"]]);
    assert.equal((await fetch(`${base}/api/admin/registrations/export?status=nonsense`, { headers: cookie })).status, 400);

    // the same file imports back (the "No." column is skipped)
    await prisma.registration.deleteMany({ where: { seasonId: season.id } });
    const buf = XLSX.write(only, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const fd = new FormData();
    fd.append("file", new Blob([new Uint8Array(buf)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "list.xlsx");
    const imp = await fetch(`${base}/api/admin/registrations/import`, { method: "POST", headers: cookie, body: fd });
    assert.equal(imp.status, 201, await imp.clone().text());
    assert.deepEqual((await prisma.registration.findMany({ where: { seasonId: season.id }, orderBy: { name: "asc" } })).map((r) => r.name), ["ZZ Amir", "ZZ Zed"], "re-imported");
    console.log("✓ applicant export: numbered, grouped by status then A–Z, per-status sheets, filtered downloads, re-importable");
  } finally {
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
