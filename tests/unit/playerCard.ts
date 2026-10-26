// Pure-logic tests for lib/playerCard.ts. Run: npm run test:card
import assert from "node:assert/strict";
import { buildCardModel, computeOverall, formBonus, sanitizeRatings, tierFor, statKeysFor } from "../../lib/playerCard";

// Keys differ for keepers.
assert.deepEqual(statKeysFor("GK"), ["div", "han", "kic", "ref", "spe", "pos"]);
assert.deepEqual(statKeysFor("FWD"), ["pac", "sho", "pas", "dri", "def", "phy"]);
assert.deepEqual(statKeysFor(null), statKeysFor("MID"));

// Position-weighted overall (same worked example as the architecture prototype).
const r = { pac: 78, sho: 80, pas: 70, dri: 76, def: 40, phy: 68 };
assert.equal(computeOverall("FWD", r), 76); // .2*78 + .3*80 + .1*70 + .25*76 + 0 + .15*68 = 75.8
assert.equal(computeOverall("DEF", r), 58); // 57.5 rounds up
assert.equal(computeOverall(null, r), Math.round((78 + 80 + 70 + 76 + 40 + 68) / 6));
// Incomplete ratings => no overall rather than a wrong one.
assert.equal(computeOverall("FWD", { pac: 78 }), null);
assert.equal(computeOverall("GK", { div: 70, han: 70, kic: 70, ref: 70, spe: 70, pos: 70 }), 70);

// Sanitising: clamp, drop junk, ignore keys that belong to the other group.
assert.deepEqual(sanitizeRatings({ pac: 150, sho: "12", pas: "x", div: 80 }, "FWD"), { pac: 99, sho: 30 });
assert.deepEqual(sanitizeRatings(null, "FWD"), {});
assert.deepEqual(sanitizeRatings({ div: 80, pac: 70 }, "GK"), { div: 80 });

// Tiers, with an organiser override winning.
assert.equal(tierFor(59), "bronze");
assert.equal(tierFor(60), "silver");
assert.equal(tierFor(74), "silver");
assert.equal(tierFor(75), "gold");
assert.equal(tierFor(null), "gold");
assert.equal(tierFor(50, "special"), "special");
assert.equal(tierFor(50, "nonsense"), "bronze");

// Form bonus: +1/goal, +1/2 per assist, capped at 5, none for keepers.
assert.equal(formBonus("FWD", { goals: 0, assists: 0 }), 0);
assert.equal(formBonus("FWD", { goals: 2, assists: 1 }), 2);
assert.equal(formBonus("MID", { goals: 10, assists: 10 }), 5);
assert.equal(formBonus("GK", { goals: 9, assists: 9 }), 0);

// Card model: bonus can lift the tier mid-edition, and caps at 99.
const m = buildCardModel({ position: "FWD", ratings: { pac: 74, sho: 74, pas: 74, dri: 74, def: 74, phy: 74 }, stats: { goals: 3, assists: 0 } });
assert.equal(m.base, 74);
assert.equal(m.bonus, 3);
assert.equal(m.overall, 77);
assert.equal(m.tier, "gold", "form bonus lifts a 74 into gold");
const capped = buildCardModel({ position: "FWD", ratings: { pac: 99, sho: 99, pas: 99, dri: 99, def: 99, phy: 99 }, stats: { goals: 9, assists: 0 } });
assert.equal(capped.overall, 99);
const unrated = buildCardModel({ position: "MID", ratings: null });
assert.equal(unrated.overall, 89, "unrated cards carry the default rating");
assert.equal(unrated.stats.every((s) => s.value === 89), true);
assert.equal(unrated.bonus, 0, "no bonus on an unrated card");

console.log("✓ playerCard: weights, overall, tiers, sanitising, form bonus and card model");
