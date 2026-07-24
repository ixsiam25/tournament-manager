import fs from "node:fs";
import dotenv from "dotenv";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

// tsx doesn't load .env files automatically the way Next.js does, so load it
// explicitly (same fallback logic as prisma.config.ts).
dotenv.config({ path: fs.existsSync(".env.local") ? ".env.local" : ".env" });

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL ?? "" });
const prisma = new PrismaClient({ adapter });

// BFL Season VIII — real teams, managers, and 6-player squads (5-a-side).
// First player listed in each squad is the captain. Positions are left
// unassigned except where known (e.g. a squad's named goalkeeper); admin can
// fill in the rest via /admin/players. photoUrl/logoUrl point at
// public/players and public/logos, cropped from the team's official BFL
// roster posters and FIFA-card-style player cards.
const TEAMS: {
  name: string;
  shortName: string;
  managerName: string;
  logoUrl: string;
  players: { name: string; position?: "GK" | "DEF" | "MID" | "FWD"; photoSlug: string }[];
}[] = [
  {
    name: "FC Protichobi",
    shortName: "FCP",
    managerName: "Nafisa Tanha",
    logoUrl: "/logos/fc-protichobi.jpg",
    players: [
      { name: "Hossain Desu", photoSlug: "hossain-desu" },
      { name: "Abdul Tahsin Rahat", photoSlug: "abdul-tahsin-rahat" },
      { name: "Khairul Islam Rafi", photoSlug: "khairul-islam-rafi" },
      { name: "Shimul Al Imran", photoSlug: "shimul-al-imran" },
      { name: "Ratul", photoSlug: "ratul" },
      { name: "Rohan", photoSlug: "rohan" },
    ],
  },
  {
    name: "Banglar Bagh",
    shortName: "BB",
    managerName: "Madhurzo Rahman",
    logoUrl: "/logos/banglar-bagh.jpg",
    players: [
      { name: "Shafiul Alam Ruhin", photoSlug: "shafiul-alam-ruhin" },
      { name: "Iftekhar Zahan Siam", photoSlug: "iftekhar-zahan-siam" },
      { name: "Mostafizur Heemel", photoSlug: "mostafizur-heemel" },
      { name: "Zahidul Sajid", photoSlug: "zahidul-sajid" },
      { name: "Muhaimin", photoSlug: "muhaimin" },
      { name: "Ramim", photoSlug: "ramim" },
    ],
  },
  {
    name: "Beppu Passers",
    shortName: "BP",
    managerName: "Saadia Zeba",
    logoUrl: "/logos/beppu-passers.jpg",
    players: [
      { name: "Shahrukh Ali", position: "GK", photoSlug: "shahrukh-ali" },
      { name: "Muktadir Rahat", photoSlug: "muktadir-rahat" },
      { name: "Shoriful Islam", photoSlug: "shoriful-islam" },
      { name: "Sayeed Rana", photoSlug: "sayeed-rana" },
      { name: "Arman Gaffar", photoSlug: "arman-gaffar" },
      { name: "Abtahee Siam", photoSlug: "abtahee-siam" },
    ],
  },
  {
    name: "Chingri Maach",
    shortName: "CM",
    managerName: "Prithika Mehek",
    logoUrl: "/logos/chingri-maach.jpg",
    players: [
      { name: "Zuhair Rahman", photoSlug: "zuhair-rahman" },
      { name: "Nur Anzim", photoSlug: "nur-anzim" },
      { name: "Akib Aditya", photoSlug: "akib-aditya" },
      { name: "Auvik", photoSlug: "auvik" },
      { name: "Tahseen", photoSlug: "tahseen" },
      { name: "Syed Hozaifa", photoSlug: "syed-hozaifa" },
    ],
  },
  {
    name: "Goal Diggers",
    shortName: "GD",
    managerName: "Naisa Tabassum",
    logoUrl: "/logos/goal-diggers.jpg",
    players: [
      { name: "Sakib", photoSlug: "sakib" },
      { name: "Wasim Ashraf", photoSlug: "wasim-ashraf" },
      { name: "Golam Momit Dip", photoSlug: "golam-momit-dip" },
      { name: "Tanvir Chowdhhury", photoSlug: "tanvir-chowdhhury" },
      { name: "Yadin Manjur", photoSlug: "yadin-manjur" },
      { name: "Sagor Khan", photoSlug: "sagor-khan" },
    ],
  },
  {
    name: "BAF FC",
    shortName: "BAF",
    managerName: "Sidrath Zannah",
    logoUrl: "/logos/baf-fc.jpg",
    players: [
      { name: "Mahfuj Mahi", photoSlug: "mahfuj-mahi" },
      { name: "M Mahadi Fahim", photoSlug: "m-mahadi-fahim" },
      { name: "Mihan Nafee", photoSlug: "mihan-nafee" },
      { name: "Tanvir Siddik", photoSlug: "tanvir-siddik" },
      { name: "Nishad Ahmed", photoSlug: "nishad-ahmed" },
      { name: "Zaidul Islam Joha", photoSlug: "zaidul-islam-joha" },
    ],
  },
  {
    name: "Son of Pitches",
    shortName: "SOP",
    managerName: "Labiba Haque",
    logoUrl: "/logos/son-of-pitches.jpg",
    players: [
      { name: "Abir Abrar", photoSlug: "abir-abrar" },
      { name: "Habib RK Ornob", photoSlug: "habib-rk-ornob" },
      { name: "Mostafa Habibul", photoSlug: "mostafa-habibul" },
      { name: "Sheak Rafid", photoSlug: "sheak-rafid" },
      { name: "Gular Tazim", photoSlug: "gular-tazim" },
      { name: "Zahid Islam", photoSlug: "zahid-islam" },
    ],
  },
  {
    name: "Cha Champions",
    shortName: "CC",
    managerName: "Rumaisa Chy",
    logoUrl: "/logos/cha-champions.jpg",
    players: [
      { name: "Kazi Rafid", photoSlug: "kazi-rafid" },
      { name: "Mahmud Ujjal", photoSlug: "mahmud-ujjal" },
      { name: "Sharif Mashrafi", photoSlug: "sharif-mashrafi" },
      { name: "Shafi Ebne Mozammel", photoSlug: "shafi-ebne-mozammel" },
      { name: "Sanjeed Ahmed", photoSlug: "sanjeed-ahmed" },
      { name: "Romeo", photoSlug: "romeo" },
    ],
  },
];

// The official BFL Season VIII single round-robin (28 matches — every team
// plays every other team once), by team name, in fixture order.
const LEAGUE_FIXTURES: [string, string][] = [
  ["FC Protichobi", "Banglar Bagh"],
  ["Beppu Passers", "Chingri Maach"],
  ["Goal Diggers", "BAF FC"],
  ["Son of Pitches", "Cha Champions"],
  ["Beppu Passers", "Banglar Bagh"],
  ["FC Protichobi", "Chingri Maach"],
  ["Goal Diggers", "Son of Pitches"],
  ["BAF FC", "Cha Champions"],
  ["Banglar Bagh", "Chingri Maach"],
  ["FC Protichobi", "Beppu Passers"],
  ["Cha Champions", "Goal Diggers"],
  ["Son of Pitches", "BAF FC"],
  ["Banglar Bagh", "Goal Diggers"],
  ["BAF FC", "FC Protichobi"],
  ["Beppu Passers", "Son of Pitches"],
  ["Chingri Maach", "Cha Champions"],
  ["BAF FC", "Banglar Bagh"],
  ["FC Protichobi", "Goal Diggers"],
  ["Chingri Maach", "Son of Pitches"],
  ["Beppu Passers", "Cha Champions"],
  ["Banglar Bagh", "Son of Pitches"],
  ["FC Protichobi", "Cha Champions"],
  ["Beppu Passers", "Goal Diggers"],
  ["Chingri Maach", "BAF FC"],
  ["Banglar Bagh", "Cha Champions"],
  ["FC Protichobi", "Son of Pitches"],
  ["Beppu Passers", "BAF FC"],
  ["Chingri Maach", "Goal Diggers"],
];

async function main() {
  console.log("Seeding teams and players...");
  const teamByName = new Map<string, { id: string }>();
  for (const t of TEAMS) {
    const team = await prisma.team.create({
      data: {
        name: t.name,
        shortName: t.shortName,
        managerName: t.managerName,
        logoUrl: t.logoUrl,
        players: {
          create: t.players.map((p, i) => ({
            name: p.name,
            jerseyNumber: i + 1,
            position: p.position ?? null,
            isCaptain: i === 0,
            photoUrl: `/players/${p.photoSlug}.jpg`,
          })),
        },
      },
    });
    teamByName.set(t.name, team);
  }

  console.log("Creating league fixtures (single round-robin, 28 matches)...");
  let matchNumber = 1;
  for (const [home, away] of LEAGUE_FIXTURES) {
    const homeTeam = teamByName.get(home);
    const awayTeam = teamByName.get(away);
    if (!homeTeam || !awayTeam) throw new Error(`Unknown team in fixture: ${home} vs ${away}`);
    await prisma.match.create({
      data: {
        round: "LEAGUE",
        label: `Match ${matchNumber}`,
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        status: "SCHEDULED",
      },
    });
    matchNumber++;
  }

  console.log("Creating semifinal + final placeholders (teams TBD)...");
  await prisma.match.create({
    data: { round: "SEMIFINAL", label: "Semifinal 1 (1st vs 3rd)", status: "SCHEDULED" },
  });
  await prisma.match.create({
    data: { round: "SEMIFINAL", label: "Semifinal 2 (2nd vs 4th)", status: "SCHEDULED" },
  });
  await prisma.match.create({
    data: { round: "FINAL", label: "Final", status: "SCHEDULED" },
  });

  const playerCount = TEAMS.reduce((sum, t) => sum + t.players.length, 0);
  console.log(
    `Seeded ${TEAMS.length} teams, ${playerCount} players, ${matchNumber - 1} league matches, 2 semifinals, 1 final.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
