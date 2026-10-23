// Compares the SQL all-time stats against the frozen-snapshot reference.
// Read-only. Run: npm run test:stats (dev branch after rehydrating Season IX).
import assert from "node:assert/strict";
import { config } from "dotenv";
config({ path: process.env.TEST_ENV_FILE ?? ".env.local" });

async function main() {
  const { getLeagueStats, getLeagueStatsFromSnapshots } = await import("../../lib/leagueStats");
  const { prisma } = await import("../../lib/db");
  const sql = await getLeagueStats();
  const ref = await getLeagueStatsFromSnapshots();
  console.log("sql     :", JSON.stringify(sql));
  console.log("snapshot:", JSON.stringify(ref));
  assert.deepEqual(sql, ref);
  console.log("✓ SQL all-time stats equal the snapshot reference");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
