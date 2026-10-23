// Pure-logic tests for lib/batch.ts. Run: npm run test:batch
import assert from "node:assert/strict";
import { batchInfo, formatBatch, parseBatch, termOfDate } from "../../lib/batch";

// Parsing: many spellings, one canonical form.
for (const s of ["Fall 24", "fall'24", "FALL-24", "Fall2024", "24 Fall", "2024 Fall", "F24", "autumn 24", "  fall   24 "]) {
  assert.deepEqual(parseBatch(s), { term: "FALL", year: 2024 }, `"${s}"`);
}
for (const s of ["Spring 25", "spring2025", "S25", "sp 25", "2025 spring"]) {
  assert.deepEqual(parseBatch(s), { term: "SPRING", year: 2025 }, `"${s}"`);
}
for (const s of ["", "  ", "Winter 24", "Fall", "24", "Fall 1999", "Fall 2100", "Sem 3", "Fall 24 extra", null, undefined]) assert.equal(parseBatch(s as string), null, `"${s}" is not a batch`);
assert.equal(formatBatch({ term: "FALL", year: 2027 }), "Fall 27");
assert.equal(formatBatch({ term: "SPRING", year: 2005 }), "Spring 05");

// The calendar: Spring Apr–Aug, Fall Sep–Mar (Jan–Mar belong to the previous year's Fall).
assert.deepEqual(termOfDate(new Date(2026, 3, 1)), { term: "SPRING", year: 2026 });
assert.deepEqual(termOfDate(new Date(2026, 7, 31)), { term: "SPRING", year: 2026 });
assert.deepEqual(termOfDate(new Date(2026, 8, 1)), { term: "FALL", year: 2026 });
assert.deepEqual(termOfDate(new Date(2026, 11, 31)), { term: "FALL", year: 2026 });
assert.deepEqual(termOfDate(new Date(2027, 0, 15)), { term: "FALL", year: 2026 });
assert.deepEqual(termOfDate(new Date(2027, 2, 31)), { term: "FALL", year: 2026 });

// Season IX ground truth (4 Aug 2026, Spring 2026 term): the real teams' semesters.
const ix = new Date(2026, 7, 4);
const sem = (label: string, on = ix) => {
  const i = batchInfo(label, on);
  return i.valid ? i.semester : "invalid";
};
assert.equal(sem("Spring 26"), 1, "Koshai FC was 1st");
assert.equal(sem("Fall 25"), 2, "Fall 25 was 2nd");
assert.equal(sem("Fall 24"), 4, "Dilly Dally was 4th");
assert.equal(sem("Spring 23"), 7, "the 7th-semester team");

// Today-ish (Oct 2026 = Fall 2026 term).
const oct = new Date(2026, 9, 23);
assert.equal(sem("Fall 26", oct), 1);
assert.equal(sem("Spring 26", oct), 2);
assert.equal(sem("Spring 24", oct), 6);
assert.equal(sem("Spring 23", oct), 8, "a batch in its 8th and last semester is still a student");
assert.ok(batchInfo("Fall 22", oct).valid && (batchInfo("Fall 22", oct) as { status: string }).status === "alumni", "one term later it is alumni");
const alum = batchInfo("Spring 22", oct);
assert.ok(alum.valid && alum.status === "alumni" && alum.text === "Alumni" && alum.semester === null, "after 4 years: alumni");
const future = batchInfo("Fall 27", oct);
assert.ok(future.valid && future.status === "incoming" && future.text === "Starts Fall 2027", "a batch that hasn't started yet is incoming");

// Boundary: the term rolls over on 1 September.
assert.equal(sem("Fall 25", new Date(2026, 7, 31)), 2);
assert.equal(sem("Fall 25", new Date(2026, 8, 1)), 3);

// Labels read the same whichever spelling was typed, and wording is human.
const t = batchInfo("fall'25", ix);
assert.ok(t.valid && t.label === "Fall 25" && t.text === "2nd semester");
assert.deepEqual(batchInfo("nonsense", ix), { valid: false });

// "Graduation" meaning: the label is the graduating term (8th semester).
const gradNow = batchInfo("Fall 26", oct, "graduation");
assert.ok(gradNow.valid && gradNow.status === "student" && gradNow.semester === 8, "graduating this term = 8th semester");
const gradFuture = batchInfo("Fall 27", oct, "graduation");
assert.ok(gradFuture.valid && gradFuture.status === "student" && gradFuture.semester === 6, "Fall 27 graduates two terms from now (Spring 27, Fall 27): 6th semester");
const gradPast = batchInfo("Spring 24", oct, "graduation");
assert.ok(gradPast.valid && gradPast.status === "alumni", "a past graduation term = alumni");

console.log("✓ batch: parsing, APU calendar, semester numbers (matches Season IX), alumni/incoming, graduation meaning");
