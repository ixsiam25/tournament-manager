import fs from "node:fs";
import dotenv from "dotenv";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

// tsx doesn't load .env files automatically the way Next.js does, so load it
// explicitly (same fallback logic as prisma.config.ts).
dotenv.config({ path: fs.existsSync(".env.local") ? ".env.local" : ".env" });

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL ?? "" });
const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// BFL Season IX — 4 August 2026, 8 teams, 5-a-side.
//
// Teams and squads come straight from the "Inter-Batch Football Tournament
// Registration (Responses)" form. Each team is one APU semester/batch, and the
// person who filled the form is the batch representative (stored as
// managerName) — except Molom Bahini, who named a separate manager.
//
// Slot letters a–h below drive the fixture grid further down; they are just
// scheduling labels, not seedings.
// ---------------------------------------------------------------------------

type Slot = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h";

const TEAMS: {
  slot: Slot;
  name: string;
  shortName: string;
  semester: string;
  managerName: string;
  players: { name: string; position?: "GK" | "DEF" | "MID" | "FWD"; isCaptain?: boolean }[];
}[] = [
  {
    slot: "a",
    name: "Molom Bahini",
    shortName: "MLB",
    semester: "5th",
    managerName: "Jannat Jannatul Fardous",
    players: [
      { name: "Habibul Mostafa Bishal", isCaptain: true },
      { name: "Mirza Samir", position: "FWD" },
      { name: "Teezad Tabriz", position: "MID" },
      { name: "Shad MD S.A.B", position: "DEF" },
      { name: "Nahid Tanvir Hasan", position: "GK" },
      { name: "Abir Abrar", position: "FWD" },
      { name: "Ahmed Habib", position: "FWD" },
      { name: "Shuaib Tahsin", position: "DEF" },
    ],
  },
  {
    slot: "b",
    name: "Big Banana FC",
    shortName: "BBF",
    semester: "4th",
    managerName: "Mashrafi Sharif Md",
    players: [
      { name: "Sharif Mashrafi", position: "MID", isCaptain: true },
      { name: "Wasimul Foij Sakib", position: "MID" },
      { name: "Shahrukh Ali Chowdhury", position: "GK" },
      { name: "Mahadi Fahim", position: "GK" },
      { name: "Wasim Ashraf", position: "FWD" },
      { name: "Mir Nafis Ali", position: "DEF" },
      { name: "Mottaquin Tahsin", position: "DEF" },
    ],
  },
  {
    slot: "c",
    name: "Koshai-7",
    shortName: "KS7",
    semester: "1st",
    managerName: "Heemel Mostafizur Rahman",
    players: [
      { name: "Milhan Nafee", position: "DEF", isCaptain: true },
      { name: "Sagor", position: "DEF" },
      { name: "Romeo", position: "MID" },
      { name: "Huzaifa", position: "MID" },
      { name: "Heemel", position: "MID" },
      { name: "Zoha", position: "MID" },
      { name: "Yusha", position: "GK" },
    ],
  },
  {
    slot: "d",
    name: "GENJAM-101",
    shortName: "GJ1",
    semester: "6th",
    managerName: "Siam Mohammad Iftekhar Zahan",
    players: [
      { name: "Siam" },
      { name: "Sheak" },
      { name: "Ujjal", isCaptain: true },
      { name: "Dip" },
      { name: "Shaman" },
      { name: "Zuhair" },
      { name: "Rahat" },
      { name: "Usman" },
    ],
  },
  {
    slot: "e",
    name: "কমিটির টীম",
    shortName: "KMT",
    semester: "3rd",
    managerName: "Md Shafiul Alam Ruhin",
    players: [
      { name: "Md Shafiul Alam Ruhin", position: "DEF" },
      { name: "Shoriful Islam", position: "DEF" },
      { name: "Kazi Rafid Mostakin", position: "MID" },
      { name: "Mahfuz Mahi", position: "FWD", isCaptain: true },
      { name: "Shafi Ahmed", position: "GK" },
      { name: "Fulmia Sheikh", position: "FWD" },
    ],
  },
  {
    // Form marked no captain, so the batch representative (Rana Md Sayeed
    // Bin, listed in the squad as "Sayeed") takes the armband.
    slot: "f",
    name: "Fall 25",
    shortName: "F25",
    semester: "2nd",
    managerName: "Rana Md Sayeed Bin",
    players: [
      { name: "Manjur Yadin", position: "FWD" },
      { name: "Sayeed", position: "FWD", isCaptain: true },
      { name: "Adnan", position: "MID" },
      { name: "Tanvir Siddik", position: "DEF" },
      { name: "Arafat", position: "DEF" },
      { name: "Muhaimin", position: "GK" },
    ],
  },
  {
    slot: "g",
    name: "৭ এ ৭ FC",
    shortName: "7A7",
    semester: "7th",
    managerName: "Hossain Desu",
    players: [
      { name: "Hossain", isCaptain: true },
      { name: "Abdul Tahsin" },
      { name: "Auvik", position: "FWD" },
      { name: "Tanvir Chowdhury", position: "FWD" },
      { name: "Habib Khan", position: "DEF" },
      { name: "Tahsin Rohan", position: "DEF" },
      { name: "Shimul", position: "DEF" },
    ],
  },
  {
    // Form named a "Representative", not a captain — the representative
    // takes the armband.
    slot: "h",
    name: "The Bottleneck",
    shortName: "TBN",
    semester: "3rd",
    managerName: "MD Zahidul Islam",
    players: [
      { name: "MD Zahidul Islam", position: "MID", isCaptain: true },
      { name: "Arifur Rahman Adit", position: "FWD" },
      { name: "Nyeeb Islam", position: "DEF" },
      { name: "Muhammad Arman", position: "DEF" },
      { name: "Mahim", position: "GK" },
      { name: "Zahidul Sajid", position: "DEF" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Schedule — 4 August 2026, kickoff 17:00 JST.
//
// 7 min per game + 3 min buffer = one 10-minute slot. Single round-robin:
// every team plays all 7 others (28 league games), then the top 4 of the table
// go to the semis (BFL's own bracket: 1v3 and 2v4) and on to the final.
//
// Field 2 is only available for the 18:00–19:00 hour, so that hour runs the 12
// "intra-block" games (the abcd round-robin plus the efgh round-robin) two at a
// time. Every other game is on Field 1.
//
// Rest: no team ever plays two slots back to back. Inside the 18:00 hour the
// two blocks alternate, so abcd play at :00/:20/:40 and efgh at :10/:30/:50.
// The 17:50 and 19:00 slots are deliberately empty — they are the changeover
// either side of the two-field hour, and without them a team would roll
// straight out of one game into the next.
// ---------------------------------------------------------------------------

const FIELD_1 = "Field 1";
const FIELD_2 = "Field 2";

/** Kickoff time on 2026-08-04, given as JST (UTC+9). */
function jst(time: string): Date {
  return new Date(`2026-08-04T${time}:00+09:00`);
}

const LEAGUE_SCHEDULE: { time: string; venue: string; home: Slot; away: Slot }[] = [
  // Block 1 — Field 1 only. One game each for all eight teams.
  { time: "17:00", venue: FIELD_1, home: "a", away: "e" },
  { time: "17:10", venue: FIELD_1, home: "b", away: "f" },
  { time: "17:20", venue: FIELD_1, home: "c", away: "g" },
  { time: "17:30", venue: FIELD_1, home: "d", away: "h" },
  { time: "17:40", venue: FIELD_1, home: "a", away: "f" },
  // 17:50 — changeover, Field 2 goes live.

  // Block 2 — both fields, 18:00–19:00. abcd and efgh alternate slots.
  { time: "18:00", venue: FIELD_1, home: "a", away: "b" },
  { time: "18:00", venue: FIELD_2, home: "c", away: "d" },
  { time: "18:10", venue: FIELD_1, home: "e", away: "f" },
  { time: "18:10", venue: FIELD_2, home: "g", away: "h" },
  { time: "18:20", venue: FIELD_1, home: "a", away: "c" },
  { time: "18:20", venue: FIELD_2, home: "b", away: "d" },
  { time: "18:30", venue: FIELD_1, home: "e", away: "g" },
  { time: "18:30", venue: FIELD_2, home: "f", away: "h" },
  { time: "18:40", venue: FIELD_1, home: "a", away: "d" },
  { time: "18:40", venue: FIELD_2, home: "b", away: "c" },
  { time: "18:50", venue: FIELD_1, home: "e", away: "h" },
  { time: "18:50", venue: FIELD_2, home: "f", away: "g" },
  // 19:00 — break, Field 2 goes back.

  // Block 3 — Field 1 only, the 11 remaining cross games. Ordered so that
  // every team gets at least one empty slot, and usually three, between games.
  { time: "19:10", venue: FIELD_1, home: "b", away: "e" },
  { time: "19:20", venue: FIELD_1, home: "c", away: "h" },
  { time: "19:30", venue: FIELD_1, home: "d", away: "f" },
  { time: "19:40", venue: FIELD_1, home: "a", away: "g" },
  { time: "19:50", venue: FIELD_1, home: "b", away: "h" },
  { time: "20:00", venue: FIELD_1, home: "c", away: "f" },
  { time: "20:10", venue: FIELD_1, home: "d", away: "e" },
  { time: "20:20", venue: FIELD_1, home: "a", away: "h" },
  { time: "20:30", venue: FIELD_1, home: "b", away: "g" },
  { time: "20:40", venue: FIELD_1, home: "c", away: "e" },
  { time: "20:50", venue: FIELD_1, home: "d", away: "g" },
];

const KNOCKOUT_SCHEDULE: {
  round: "SEMIFINAL" | "FINAL";
  label: string;
  time: string;
  venue: string;
}[] = [
  // 21:00 is left empty so whoever played the 20:50 league game gets a rest
  // before a semi. The final sits two slots after SF2 for the same reason.
  { round: "SEMIFINAL", label: "Semifinal 1 (1st vs 3rd)", time: "21:10", venue: FIELD_1 },
  { round: "SEMIFINAL", label: "Semifinal 2 (2nd vs 4th)", time: "21:20", venue: FIELD_1 },
  { round: "FINAL", label: "Final", time: "21:40", venue: FIELD_1 },
];

// ---------------------------------------------------------------------------

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Fails the seed if any team is booked twice in one slot or plays two
 * consecutive 10-minute slots. Cheap insurance against a hand-edit to
 * LEAGUE_SCHEDULE quietly breaking the rest guarantee.
 */
function assertRestGuarantee() {
  const bySlot = new Map<string, Slot[]>();
  for (const g of LEAGUE_SCHEDULE) {
    const list = bySlot.get(g.time) ?? [];
    list.push(g.home, g.away);
    bySlot.set(g.time, list);
  }

  const times = [...bySlot.keys()].sort();
  for (const time of times) {
    const teams = bySlot.get(time)!;
    const dupe = teams.find((t, i) => teams.indexOf(t) !== i);
    if (dupe) throw new Error(`Team "${dupe}" is booked twice in the ${time} slot`);
  }

  for (let i = 1; i < times.length; i++) {
    if (toMinutes(times[i]) - toMinutes(times[i - 1]) > 10) continue; // gap slot breaks the chain
    const clash = bySlot.get(times[i])!.filter((t) => bySlot.get(times[i - 1])!.includes(t));
    if (clash.length > 0) {
      throw new Error(
        `Team(s) "${clash.join(", ")}" play back-to-back at ${times[i - 1]} and ${times[i]}`,
      );
    }
  }
}

/** Fails the seed unless every pair of teams meets exactly once. */
function assertSingleRoundRobin() {
  const seen = new Set<string>();
  for (const g of LEAGUE_SCHEDULE) {
    const key = [g.home, g.away].sort().join("-");
    if (seen.has(key)) throw new Error(`Duplicate fixture: ${key}`);
    seen.add(key);
  }
  const expected = (TEAMS.length * (TEAMS.length - 1)) / 2;
  if (seen.size !== expected) {
    throw new Error(`Expected ${expected} league fixtures, schedule has ${seen.size}`);
  }
}

async function main() {
  assertSingleRoundRobin();
  assertRestGuarantee();

  console.log("Clearing previous season...");
  // Order matters: events and predictions reference matches/teams/players.
  await prisma.matchEvent.deleteMany();
  await prisma.prediction.deleteMany();
  await prisma.championPrediction.deleteMany();
  await prisma.match.deleteMany();
  await prisma.player.deleteMany();
  await prisma.team.deleteMany();

  console.log("Seeding teams and players...");
  const teamBySlot = new Map<Slot, { id: string }>();
  for (const t of TEAMS) {
    const team = await prisma.team.create({
      data: {
        name: t.name,
        shortName: t.shortName,
        managerName: t.managerName,
        players: {
          create: t.players.map((p, i) => ({
            name: p.name,
            jerseyNumber: i + 1,
            position: p.position ?? null,
            isCaptain: p.isCaptain ?? false,
          })),
        },
      },
    });
    teamBySlot.set(t.slot, team);
  }

  console.log(`Creating ${LEAGUE_SCHEDULE.length} league fixtures...`);
  let matchNumber = 1;
  for (const g of LEAGUE_SCHEDULE) {
    const homeTeam = teamBySlot.get(g.home);
    const awayTeam = teamBySlot.get(g.away);
    if (!homeTeam || !awayTeam) throw new Error(`Unknown slot in fixture: ${g.home} vs ${g.away}`);
    await prisma.match.create({
      data: {
        round: "LEAGUE",
        label: `Match ${matchNumber}`,
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        scheduledAt: jst(g.time),
        venue: g.venue,
        status: "SCHEDULED",
      },
    });
    matchNumber++;
  }

  console.log("Creating semifinal + final placeholders (teams TBD)...");
  for (const k of KNOCKOUT_SCHEDULE) {
    await prisma.match.create({
      data: {
        round: k.round,
        label: k.label,
        scheduledAt: jst(k.time),
        venue: k.venue,
        status: "SCHEDULED",
      },
    });
  }

  const playerCount = TEAMS.reduce((sum, t) => sum + t.players.length, 0);
  console.log(
    `Seeded ${TEAMS.length} teams, ${playerCount} players, ${LEAGUE_SCHEDULE.length} league matches, ${KNOCKOUT_SCHEDULE.length} knockout matches.`,
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
