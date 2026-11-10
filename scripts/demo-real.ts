// Auction demo built from the REAL Season X applicants.
//
//   npm run demo:real        copy Season X's approved applicants (READ-ONLY from prod) into a
//                            throwaway edition on the DEV branch, with 7 demo teams ready to bid
//   npm run demo:real:down   remove it again
//
// Production is only ever read. Photos are fetched from the public site into
// .local-media/ (the dev photo store, gitignored). Student IDs are replaced with
// DEMOnnn and contacts are not copied. Refuses to write to anything but the dev branch.
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const SLUG = "demo-x";
const SITE = "https://bfl.online.zahan.jp";
const TEAM_NAMES = ["Maroon Tigers", "Gold Rush", "Night Owls", "Blue Storm", "Green Falcons", "Red Comets", "Silver Wolves"];
// Captains are picked from the real pool (non-GK, spread across batches) and placed free.
const CAPTAIN_PICKS = ["Siam", "Nahid Tanvir Hasan", "Fahmid Al Sazid", "Zahidul Sajid", "Auvik", "Md Tanvir Siddik", "Rohan"];

async function main() {
  const mode = process.argv[2] ?? "up";
  const { prisma } = await import("../lib/db");
  const prod = dotenv.parse(fs.readFileSync(".env.prod.local"));
  const host = (u?: string) => u?.match(/@([^/?]+)/)?.[1]?.replace("-pooler", "");
  if (host(process.env.DATABASE_URL) === host(prod.DATABASE_URL)) throw new Error("DATABASE_URL is PRODUCTION — refusing to write.");

  const tournament = await prisma.tournament.findUniqueOrThrow({ where: { slug: "bfl" } });
  const existing = await prisma.season.findUnique({ where: { slug: SLUG } });
  if (existing) {
    const previous = await prisma.season.findFirst({ where: { slug: { not: SLUG } }, orderBy: [{ status: "asc" }, { number: "desc" }] });
    await prisma.matchEvent.deleteMany({ where: { match: { seasonId: existing.id } } });
    await prisma.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: previous?.id ?? null } });
    await prisma.season.delete({ where: { id: existing.id } });
    await prisma.person.deleteMany({ where: { identifiers: { some: { value: { startsWith: "DEMO" } } } } });
    await prisma.franchise.deleteMany({ where: { tournamentId: tournament.id, teams: { none: {} }, name: { in: TEAM_NAMES } } });
    console.log("Previous demo edition removed.");
  }
  if (mode === "down") return;

  // ---- READ-ONLY pull from production ----
  const { PrismaClient } = await import("../lib/generated/prisma/client");
  const { PrismaNeon } = await import("@prisma/adapter-neon");
  const prodDb = new PrismaClient({ adapter: new PrismaNeon({ connectionString: prod.DATABASE_URL }) });
  const src = await prodDb.season.findUniqueOrThrow({ where: { slug: "bfl-x" } });
  const regs = await prodDb.registration.findMany({ where: { seasonId: src.id, status: "APPROVED" }, orderBy: { createdAt: "asc" } });
  await prodDb.$disconnect();

  const max = await prisma.season.aggregate({ _max: { number: true } });
  const season = await prisma.season.create({
    data: {
      tournamentId: tournament.id, number: (max._max.number ?? 10) + 1, name: "BFL Season X (auction demo)", slug: SLUG, year: 2026,
      status: "ACTIVE", teamFormation: "AUCTION", squadSizeMin: src.squadSizeMin, squadSizeMax: src.squadSizeMax, targetTeamCount: src.targetTeamCount,
      registrationOpen: false, registrationSelfServeEnabled: false, registrationExcelImportEnabled: false,
    },
  });
  await prisma.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: season.id } });

  // Photos: public on the live site; stored where the dev photo route looks for them.
  fs.mkdirSync(".local-media", { recursive: true });
  const keys = [...new Set(regs.flatMap((r) => [r.photoKey, r.cutoutKey]).filter((k): k is string => !!k))];
  let got = 0;
  for (const key of keys) {
    const res = await fetch(`${SITE}/api/photos/${key}`);
    if (!res.ok) { console.warn(`photo ${key}: HTTP ${res.status}`); continue; }
    fs.writeFileSync(path.join(".local-media", encodeURIComponent(key)), Buffer.from(await res.arrayBuffer()));
    got++;
  }

  const { approveRegistration } = await import("../lib/registrationApproval");
  for (const [i, r] of regs.entries()) {
    const reg = await prisma.registration.create({
      data: {
        seasonId: season.id, name: r.name, affiliation: r.affiliation, position: r.position, contact: "demo",
        studentId: `DEMO${String(i + 1).padStart(3, "0")}`, photoKey: r.photoKey, cutoutKey: r.cutoutKey,
        photoZoom: r.photoZoom, photoX: r.photoX, photoY: r.photoY, source: "SELF_SERVE", status: "APPROVED",
      },
    });
    await approveRegistration(reg, season);
  }

  // Auction rules + teams. 7 teams x 6 = 42 players: captain free, 5 bought each.
  await prisma.auctionSettings.create({ data: { seasonId: season.id, budgetPerTeam: 1000, basePrice: 50, bidIncrement: 10, stageMode: "POSTER" } });
  const { findOrCreateFranchise } = await import("../lib/franchise");
  const { placePlayerFree } = await import("../lib/auctionService");
  for (const [i, name] of TEAM_NAMES.entries()) {
    const captain = await prisma.player.findFirst({ where: { seasonId: season.id, name: CAPTAIN_PICKS[i] } });
    if (!captain) throw new Error(`Captain "${CAPTAIN_PICKS[i]}" not found among the applicants`);
    const franchise = await findOrCreateFranchise(tournament.id, name);
    const team = await prisma.team.create({ data: { seasonId: season.id, franchiseId: franchise.id, name, shortName: name.split(" ").map((w) => w[0]).join(""), managerName: captain.name } });
    await placePlayerFree({ playerId: captain.id, teamId: team.id, actor: null });
    await prisma.player.update({ where: { id: captain.id }, data: { isCaptain: true } });
  }
  const lots = await prisma.auctionLot.count({ where: { seasonId: season.id, status: "QUEUED" } });
  console.log(`Demo ready: ${regs.length} real applicants, ${got}/${keys.length} photos, ${TEAM_NAMES.length} teams (captains placed), ${lots} players to auction.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => process.exit(0));
