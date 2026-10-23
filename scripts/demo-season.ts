// A throwaway demo edition on the DEV branch so the whole system can be tried by
// hand, starting where a real season starts: just created, applications open,
// team formation undecided, 22 applications (several batches, incl. alumni) waiting.
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
    await prisma.franchise.deleteMany({ where: { teams: { none: {} }, tournamentId: tournament.id, name: { in: ["Spring 25", "Fall 24", "Spring 24", "Fall 23", "Spring 23", "Alumni"] } } });
    console.log(`Demo season removed; the site shows ${previous?.name ?? "no season"} again.`);
    return;
  }

  if (mode !== "up") throw new Error("Usage: demo-season.ts up|down");
  if (existing) return console.log("The demo season already exists (run demo:down first to rebuild it).");

  const max = await prisma.season.aggregate({ _max: { number: true } });
  // The state a brand-new season is in right after the organiser creates it:
  // applications open, team formation NOT chosen yet, no teams.
  const season = await prisma.season.create({
    data: {
      tournamentId: tournament.id,
      number: (max._max.number ?? 9) + 1,
      name: "BFL Season X (demo)",
      slug: SLUG,
      year: 2026,
      status: "ACTIVE",
      teamFormation: "UNDECIDED",
      squadSizeMin: 3,
      squadSizeMax: 6,
      registrationOpen: true,
      registrationSelfServeEnabled: true,
      registrationExcelImportEnabled: true,
    },
  });
  await prisma.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: season.id } });

  // 22 applications already submitted, spread over intake batches (current
  // students in different semesters, plus alumni) — all still PENDING review.
  const names = ["Rafi Hasan", "Tanvir Alam", "Nusrat Jahan", "Imran Khan", "Sadia Noor", "Hasan Mahmud", "Mim Akter", "Arif Rahman", "Joy Das", "Lamia Sultana", "Rony Mia", "Tisha Roy", "Fahim Ahmed", "Nadia Islam", "Shuvo Paul", "Tania Begum", "Mehedi Hasan", "Rupa Chowdhury", "Sakib Khan", "Anika Tabassum", "Zayed Karim", "Orpita Das"];
  const batches = ["Fall 25", "Fall 25", "Fall 25", "Fall 25", "Spring 25", "Spring 25", "Spring 25", "Fall 24", "Fall 24", "Fall 24", "Fall 24", "Spring 24", "Spring 24", "Spring 24", "Fall 23", "Fall 23", "Fall 23", "Spring 23", "Spring 23", "Spring 21", "Spring 21", "Fall 19"];
  const positions = ["FWD", "MID", "DEF", "GK", "MID", "DEF", "FWD", "MID", "DEF", "FWD", "MID", "DEF", "GK", "MID", "FWD", "DEF", "MID", "FWD", "DEF", "MID", "FWD", "GK"] as const;
  for (const [i, name] of names.entries()) {
    await prisma.registration.create({
      data: { seasonId: season.id, name, affiliation: batches[i], contact: "demo", studentId: `DEMO${String(i + 1).padStart(3, "0")}`, position: positions[i], source: "SELF_SERVE", status: "PENDING" },
    });
  }
  console.log(`Demo ready: "${season.name}" — applications OPEN, team formation not chosen yet, 22 applications waiting (several batches + alumni), no teams.`);
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
