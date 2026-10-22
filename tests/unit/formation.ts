// Pure-logic tests for lib/formation.ts. Run: npm run test:formation
import assert from "node:assert/strict";
import { balancedDeal, mulberry32, snakeTeamIndex, teamOnTheClock, type DealTeam, type PoolPlayer, type Pos } from "../../lib/formation";

// Snake order: 0,1,2,2,1,0,0,1,2
assert.deepEqual(Array.from({ length: 9 }, (_, i) => snakeTeamIndex(3, i)), [0, 1, 2, 2, 1, 0, 0, 1, 2]);
assert.throws(() => snakeTeamIndex(0, 0));

const positions: (Pos | null)[] = ["GK", "DEF", "DEF", "MID", "MID", "FWD", "FWD", null];
const pool: PoolPlayer[] = Array.from({ length: 32 }, (_, i) => ({
  id: `p${i}`,
  name: `P${i}`,
  position: positions[i % positions.length],
  rating: 50 + (i % 7) * 5,
}));
const teams: DealTeam[] = ["A", "B", "C", "D"].map((n) => ({ id: n, name: n, count: 0, max: 8 }));

// Everyone placed, nobody over capacity, deterministic for a seed.
const deal = balancedDeal(pool, teams, mulberry32(42));
assert.equal(deal.assignments.size, 32);
assert.equal(deal.leftover.length, 0);
const per = (id: string) => [...deal.assignments.values()].filter((t) => t === id).length;
for (const t of teams) assert.equal(per(t.id), 8, `team ${t.id} should get an even share`);
const again = balancedDeal(pool, teams, mulberry32(42));
assert.deepEqual([...again.assignments], [...deal.assignments], "same seed => same deal");
const other = balancedDeal(pool, teams, mulberry32(43));
assert.notDeepEqual([...other.assignments], [...deal.assignments], "different seed => different deal");

// Positions are spread: with 4 GKs and 4 teams, each team gets exactly one.
const gkPerTeam = teams.map((t) => pool.filter((p) => p.position === "GK" && deal.assignments.get(p.id) === t.id).length);
assert.deepEqual(gkPerTeam, [1, 1, 1, 1]);

// Strength is balanced: total rating per team stays within a small band.
const strength = teams.map((t) => pool.filter((p) => deal.assignments.get(p.id) === t.id).reduce((s, p) => s + (p.rating ?? 0), 0));
assert.ok(Math.max(...strength) - Math.min(...strength) <= 35, `strength spread too wide: ${strength}`);

// Capacity: existing players count, overflow is reported not dropped.
const tight = balancedDeal(pool.slice(0, 10), [{ id: "A", name: "A", count: 5, max: 8 }, { id: "B", name: "B", count: 7, max: 8 }], mulberry32(1));
assert.equal(tight.assignments.size, 4);
assert.equal(tight.leftover.length, 6);
const full = balancedDeal(pool.slice(0, 3), [{ id: "A", name: "A", count: 8, max: 8 }], mulberry32(1));
assert.equal(full.leftover.length, 3);

// Draft: team on the clock follows the snake and skips full teams.
const state = { kind: "DRAFT" as const, order: ["A", "B", "C"], picks: [] as { playerId: string; teamId: string }[] };
assert.equal(teamOnTheClock(state, new Map(), 5), "A");
state.picks.push({ playerId: "x", teamId: "A" }, { playerId: "y", teamId: "B" }, { playerId: "z", teamId: "C" });
assert.equal(teamOnTheClock(state, new Map(), 5), "C", "round 2 starts from the end");
assert.equal(teamOnTheClock(state, new Map([["C", 5]]), 5), "B", "full team is skipped");
assert.equal(teamOnTheClock(state, new Map([["A", 5], ["B", 5], ["C", 5]]), 5), null, "nobody has room");

console.log("✓ formation: snake order, balanced deal (even, positional, seeded, capacity-aware) and draft clock");
