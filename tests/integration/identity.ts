// Person identity, student-ID matching, merging and franchise history.
// Writes throwaway "ZZ" rows to DATABASE_URL, so it only runs when explicitly
// allowed (dev branch). Cleans up after itself, even on failure.
//
// Run: ALLOW_DB_WRITE_TESTS=1 npm run test:identity
import assert from "node:assert/strict";
import { config } from "dotenv";
config({ path: ".env.local" });

if (process.env.ALLOW_DB_WRITE_TESTS !== "1") {
  console.log("skipped: set ALLOW_DB_WRITE_TESTS=1 (dev branch only)");
  process.exit(0);
}

async function main() {
  const { prisma } = await import("../../lib/db");
  const id = await import("../../lib/identity");
  const fr = await import("../../lib/franchise");
  const { approveRegistration } = await import("../../lib/registrationApproval");

  const tournament = await prisma.tournament.findUniqueOrThrow({ where: { slug: "bfl" } });
  const stamp = Date.now();
  const sid = (suffix: string) => `ZZ${stamp}${suffix}`;
  const mkSeason = (n: number, formation: "BATCH" | "AUCTION" = "BATCH") =>
    prisma.season.create({
      data: {
        tournamentId: tournament.id,
        number: 80000 + ((stamp + n) % 9000),
        name: `ZZ Identity ${n}`,
        slug: `zz-identity-${stamp}-${n}`,
        year: 2098,
        status: "ACTIVE",
        teamFormation: formation,
        squadSizeMin: 4,
        squadSizeMax: 6,
      },
    });

  const seasons: string[] = [];
  try {
    // 1. Student ID pins a Person; later calls with the same ID reuse it regardless of name.
    const first = await id.findOrCreatePerson({ name: "ZZ Alice", studentId: ` ${sid("a").toLowerCase()} ` });
    assert.equal(first.by, "created");
    const again = await id.findOrCreatePerson({ name: "ZZ Alice Renamed", studentId: sid("a") });
    assert.equal(again.by, "studentId");
    assert.equal(again.personId, first.personId, "same student ID must resolve to the same person");

    // 2. A different person with the same NAME but a different ID is NOT merged by name.
    const other = await id.findOrCreatePerson({ name: "ZZ Alice", studentId: sid("b") });
    assert.notEqual(other.personId, first.personId, "same name + different ID must stay separate");

    // 3. Name-only lookup: unique name reuses, ambiguous name creates a new person.
    const solo = await id.findOrCreatePerson({ name: "ZZ Solo Name" });
    assert.equal((await id.findOrCreatePerson({ name: "zz solo name" })).personId, solo.personId);
    const dupA = await prisma.person.create({ data: { name: "ZZ Twin" } });
    await prisma.person.create({ data: { name: "ZZ Twin" } });
    const twin = await id.findOrCreatePerson({ name: "ZZ Twin" });
    assert.equal(twin.by, "created");
    assert.notEqual(twin.personId, dupA.id, "ambiguous name must not guess");

    // 4. An ID owned by someone else can't be attached elsewhere.
    await assert.rejects(() => id.setStudentId(other.personId, sid("a")), id.IdentityConflictError);
    await id.setStudentId(other.personId, sid("b")); // idempotent on its own owner

    // 5. Approval links by student ID, builds an auction lot once, never duplicates a roster slot.
    const auction = await mkSeason(1, "AUCTION");
    seasons.push(auction.id);
    const reg = await prisma.registration.create({
      data: { seasonId: auction.id, name: "ZZ Alice (form)", affiliation: "ZZ", contact: "x", studentId: sid("a"), source: "SELF_SERVE", status: "APPROVED" },
    });
    const r1 = await approveRegistration(reg, auction);
    assert.equal(r1.personId, first.personId);
    assert.equal(r1.createdPlayer, true);
    const reg2 = await prisma.registration.findUniqueOrThrow({ where: { id: reg.id } });
    const r2 = await approveRegistration(reg2, auction);
    assert.equal(r2.alreadyOnRoster, true);
    assert.equal(r2.createdPlayer, false);
    assert.equal(await prisma.player.count({ where: { seasonId: auction.id, personId: first.personId } }), 1);

    // 6. DB invariant: one roster slot per person per season.
    await assert.rejects(() =>
      prisma.player.create({ data: { seasonId: auction.id, personId: first.personId, name: "ZZ dup", jerseyNumber: 0 } }),
    );

    // 7. Merge moves slots across seasons; refuses when both have a slot in one season.
    const s2 = await mkSeason(2);
    seasons.push(s2.id);
    const f2 = await fr.findOrCreateFranchise(tournament.id, `ZZ Merge FC ${stamp}`);
    const t2 = await prisma.team.create({ data: { seasonId: s2.id, franchiseId: f2.id, name: `ZZ Merge FC ${stamp}` } });
    await prisma.player.create({ data: { seasonId: s2.id, teamId: t2.id, personId: other.personId, name: "ZZ Alice", jerseyNumber: 1 } });
    const moved = await id.mergePersons(first.personId, other.personId);
    assert.equal(moved.players, 1);
    assert.ok(moved.identifiers >= 1);
    assert.equal(await prisma.person.count({ where: { id: other.personId } }), 0, "dropped person must be gone");
    assert.equal(await prisma.player.count({ where: { personId: first.personId } }), 2);
    const rival = await prisma.person.create({ data: { name: "ZZ Rival" } });
    await prisma.player.create({ data: { seasonId: s2.id, teamId: t2.id, personId: rival.id, name: "ZZ Rival", jerseyNumber: 2 } });
    await assert.rejects(() => id.mergePersons(first.personId, rival.id), id.IdentityConflictError);

    // 8. Franchise keeps identity across a rename, with name history.
    await fr.recordTeamRename(f2.id, `ZZ Merge FC ${stamp}`, `ZZ Renamed FC ${stamp}`);
    const renamed = await prisma.franchise.findUniqueOrThrow({ where: { id: f2.id } });
    assert.equal(renamed.name, `ZZ Renamed FC ${stamp}`);
    assert.deepEqual(renamed.names, [`ZZ Merge FC ${stamp}`]);
    // Returning under the same name reuses the franchise instead of forking it.
    assert.equal((await fr.findOrCreateFranchise(tournament.id, `ZZ Renamed FC ${stamp}`)).id, f2.id);

    // 9. Backfill sanity: every real team has a franchise whose name or history includes its name.
    const teams = await prisma.team.findMany({ where: { name: { not: { startsWith: "ZZ " } } }, include: { franchise: true } });
    for (const t of teams) assert.ok(t.franchise.name === t.name || t.franchise.names.includes(t.name), `${t.name} franchise mismatch`);

    console.log("✓ identity: student-ID matching, merge rules, roster uniqueness and franchise history all hold");
  } finally {
    for (const seasonId of seasons) {
      await prisma.matchEvent.deleteMany({ where: { match: { seasonId } } });
      await prisma.season.delete({ where: { id: seasonId } }).catch(() => {});
    }
    await prisma.person.deleteMany({ where: { name: { startsWith: "ZZ " } } });
    await prisma.franchise.deleteMany({ where: { name: { startsWith: "ZZ " } } });
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
