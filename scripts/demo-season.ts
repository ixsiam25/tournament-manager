// A throwaway demo edition on the DEV branch so the whole system can be tried by
// hand: registration open, 4 teams (reusing Season IX franchises), 20 approved
// applicants in the pool, a few pending applications.
//
//   npm run demo:up     create it and make it the current edition
//   npm run demo:down   delete it and point the site back at the previous edition
//
// Refuses to run against anything that isn't the dev branch.
import fs from "node:fs";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const SLUG = "demo-x";

async function main() {
  const mode = process.argv[2];
  const { prisma } = await import("../lib/db");
  const prod = dotenv.parse(fs.existsSync(".env.prod.local") ? fs.readFileSync(".env.prod.local") : "");
  const host = (u?: string) => u?.match(/@([^/?]+)/)?.[1]?.replace("-pooler", "");
  if (host(process.env.DATABASE_URL) && host(process.env.DATABASE_URL) === host(prod.DATABASE_URL)) {
    throw new Error("DATABASE_URL points at the PRODUCTION database — the demo only runs on the dev branch.");
  }

  const tournament = await prisma.tournament.findUniqueOrThrow({ where: { slug: "bfl" } });
  const existing = await prisma.season.findUnique({ where: { slug: SLUG } });

  if (mode === "down") {
    if (!existing) return console.log("No demo season to remove.");
    const previous = await prisma.season.findFirst({ where: { slug: { not: SLUG } }, orderBy: [{ status: "asc" }, { number: "desc" }] });
    await prisma.matchEvent.deleteMany({ where: { match: { seasonId: existing.id } } });
    await prisma.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: previous?.id ?? null } });
    await prisma.season.delete({ where: { id: existing.id } });
    await prisma.person.deleteMany({ where: { identifiers: { some: { value: { startsWith: "DEMO" } } } } });
    console.log(`Demo season removed; the site shows ${previous?.name ?? "no season"} again.`);
    return;
  }

  if (mode !== "up") throw new Error("Usage: demo-season.ts up|down");
  if (existing) return console.log("The demo season already exists (run demo:down first to rebuild it).");

  const max = await prisma.season.aggregate({ _max: { number: true } });
  const season = await prisma.season.create({
    data: {
      tournamentId: tournament.id,
      number: (max._max.number ?? 9) + 1,
      name: "BFL Season X (demo)",
      slug: SLUG,
      year: 2026,
      status: "ACTIVE",
      teamFormation: "BALANCED_RANDOM",
      squadSizeMin: 5,
      squadSizeMax: 7,
      targetTeamCount: 4,
      registrationOpen: true,
      registrationSelfServeEnabled: true,
      registrationExcelImportEnabled: true,
    },
  });
  await prisma.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: season.id } });

  // Teams reuse existing franchises so continuity from Season IX is visible.
  const franchises = await prisma.franchise.findMany({ where: { tournamentId: tournament.id }, orderBy: { name: "asc" }, take: 4 });
  for (const f of franchises) await prisma.team.create({ data: { seasonId: season.id, franchiseId: f.id, name: f.name, shortName: f.shortName } });

  const photos = fs.readdirSync("public/photos").filter((f) => f.startsWith("cmrx") && f.endsWith(".jpg"));
  const names = ["Rafi Hasan", "Tanvir Alam", "Nusrat Jahan", "Imran Khan", "Sadia Noor", "Hasan Mahmud", "Mim Akter", "Arif Rahman", "Joy Das", "Lamia Sultana", "Rony Mia", "Tisha Roy", "Fahim Ahmed", "Nadia Islam", "Shuvo Paul", "Tania Begum", "Mehedi Hasan", "Rupa Chowdhury", "Sakib Khan", "Anika Tabassum"];
  const positions = ["FWD", "MID", "DEF", "GK", "MID", "DEF", "FWD", "MID", "DEF", "FWD", "MID", "DEF", "GK", "MID", "FWD", "DEF", "MID", "FWD", "DEF", "MID"] as const;
  const { approveRegistration } = await import("../lib/registrationApproval");
  for (const [i, name] of names.entries()) {
    const reg = await prisma.registration.create({
      data: { seasonId: season.id, name, affiliation: i % 2 ? "Sem 3" : "Sem 5", contact: "demo", studentId: `DEMO${String(i + 1).padStart(3, "0")}`, position: positions[i], source: "ADMIN_MANUAL", status: "APPROVED" },
    });
    await approveRegistration(reg, season);
  }
  await prisma.player.updateMany({ where: { seasonId: season.id }, data: { photoUrl: `/photos/${photos[0]}` } });
  for (const [i, name] of ["Pending Person One", "Pending Person Two", "Pending Person Three"].entries()) {
    await prisma.registration.create({
      data: { seasonId: season.id, name, affiliation: "Sem 3", contact: "demo", studentId: `DEMOP${i + 1}`, position: positions[i], source: "SELF_SERVE", status: "PENDING" },
    });
  }
  console.log(`Demo ready: "${season.name}" — 4 teams, 20 players in the pool, 3 pending applications, registration open.`);
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
