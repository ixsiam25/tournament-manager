// Removes every leftover throwaway "ZZ" row (seasons slugged zz-*, people, franchises,
// identifiers, audit lines) left behind by an interrupted test run. Safe on any
// branch: it only touches rows the tests themselves create.
//   npm run test:clean            (dev branch)
//   sh scripts/on-test-branch.sh npm run test:clean   (test branch)
import dotenv from "dotenv";
dotenv.config({ path: process.env.TEST_ENV_FILE ?? ".env.local" });

async function main() {
  const { prisma } = await import("../lib/db");
  const seasons = await prisma.season.findMany({ where: { slug: { startsWith: "zz-" } }, select: { id: true, slug: true } });
  const tournament = await prisma.tournament.findUniqueOrThrow({ where: { slug: "bfl" } });
  if (seasons.some((s) => s.id === tournament.currentSeasonId)) {
    const fallback = await prisma.season.findFirst({ where: { slug: { not: { startsWith: "zz-" } } }, orderBy: [{ status: "asc" }, { number: "desc" }] });
    await prisma.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: fallback?.id ?? null } });
  }
  for (const s of seasons) {
    await prisma.matchEvent.deleteMany({ where: { match: { seasonId: s.id } } });
    await prisma.season.delete({ where: { id: s.id } });
  }
  const people = await prisma.person.deleteMany({ where: { name: { startsWith: "ZZ " } } });
  const franchises = await prisma.franchise.deleteMany({ where: { name: { startsWith: "ZZ " } } });
  const audits = await prisma.auditLog.deleteMany({ where: { summary: { contains: "ZZ " } } });
  console.log(`removed ${seasons.length} season(s), ${people.count} people, ${franchises.count} franchise(s), ${audits.count} audit line(s)`);
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
