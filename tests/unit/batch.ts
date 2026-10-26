// Pure-logic tests for lib/batch.ts. Run: npm run test:batch
import assert from "node:assert/strict";
import { batchInfo, batchLabelForSemester, formatBatch, parseBatch, termOfDate } from "../../lib/batch";

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

// The calendar: Spring Apr–Sep, Fall Oct–Mar (Jan–Mar belong to the previous year's Fall).
assert.deepEqual(termOfDate(new Date(2026, 3, 1)), { term: "SPRING", year: 2026 });
assert.deepEqual(termOfDate(new Date(2026, 8, 30)), { term: "SPRING", year: 2026 });
assert.deepEqual(termOfDate(new Date(2026, 9, 1)), { term: "FALL", year: 2026 });
assert.deepEqual(termOfDate(new Date(2026, 11, 31)), { term: "FALL", year: 2026 });
assert.deepEqual(termOfDate(new Date(2027, 0, 15)), { term: "FALL", year: 2026 });
assert.deepEqual(termOfDate(new Date(2027, 2, 31)), { term: "FALL", year: 2026 });

// Season IX ground truth (4 Aug 2026, Spring 2026 term), read with the "entry" meaning: the real teams' semesters.
const ix = new Date(2026, 7, 4);
const sem = (label: string, on = ix) => {
  const i = batchInfo(label, on, "entry");
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
assert.equal((batchInfo("Fall 22", oct, "entry") as { status: string }).status, "alumni", "one term later it is alumni");
const alum = batchInfo("Spring 22", oct, "entry");
assert.ok(alum.valid && alum.status === "alumni" && alum.text === "Alumni" && alum.semester === null, "after 4 years: alumni");
const future = batchInfo("Fall 27", oct, "entry");
assert.ok(future.valid && future.status === "incoming" && future.text === "Starts Fall 2027", "a batch that hasn't started yet is incoming");

// Boundary: the term rolls over on 1 October.
assert.equal(sem("Fall 25", new Date(2026, 8, 30)), 2);
assert.equal(sem("Fall 25", new Date(2026, 9, 1)), 3);

// Labels read the same whichever spelling was typed, and wording is human.
const t = batchInfo("fall'25", ix, "entry");
assert.ok(t.valid && t.label === "Fall 25" && t.text === "2nd semester");
assert.deepEqual(batchInfo("nonsense", ix, "entry"), { valid: false });

// The DEFAULT meaning: the label is the term the batch GRADUATES in, after its 8th semester.
// Today = 23 Oct 2026, i.e. the Fall 2026 term (Oct 2026 - Mar 2027).
const grad = (label: string) => {
  const i = batchInfo(label, oct);
  return i.valid ? (i.status === "student" ? i.semester : i.status) : "invalid";
};
assert.equal(grad("Spring 27"), 8, "Spring 27 graduates March 2027: its 8th (last) semester is this one");
assert.equal(grad("Fall 27"), 7);
assert.equal(grad("Spring 28"), 6);
assert.equal(grad("Fall 28"), 5);
assert.equal(grad("Spring 29"), 4);
assert.equal(grad("Fall 29"), 3);
assert.equal(grad("Spring 30"), 2);
assert.equal(grad("Fall 30"), 1, "the newest batch is in its 1st semester");
assert.equal(grad("Spring 31"), "incoming", "a batch that graduates 9+ terms from now hasn't started");
const notStarted = batchInfo("Spring 31", oct);
assert.ok(notStarted.valid && notStarted.text === "Starts Spring 2027");
assert.equal(grad("Fall 26"), "alumni", "graduated in September");
assert.equal(grad("Spring 26"), "alumni", "a past graduation term is alumni");
// the term rolls over on 1 October for graduation batches too
assert.equal((batchInfo("Spring 27", new Date(2026, 8, 30)) as { semester: number }).semester, 7, "30 Sep: still the Spring term");
assert.equal((batchInfo("Spring 27", new Date(2026, 9, 1)) as { semester: number }).semester, 8, "1 Oct: the Fall term has begun");

// batchLabelForSemester is the exact inverse (keeps demo/test data valid on any day).
for (const meaning of ["graduation", "entry"] as const) {
  for (const d of [new Date(2026, 9, 23), new Date(2027, 1, 10), new Date(2028, 5, 1)]) {
    for (let n = 1; n <= 8; n++) {
      const info = batchInfo(batchLabelForSemester(n, d, meaning), d, meaning);
      assert.ok(info.valid && info.status === "student" && info.semester === n, `${meaning} ${n} on ${d.toDateString()}`);
    }
    const old = batchInfo(batchLabelForSemester(9, d, meaning), d, meaning);
    assert.ok(old.valid && old.status === "alumni", "semester 9 is alumni");
  }
}
assert.equal(batchLabelForSemester(6, new Date(2026, 9, 23)), "Spring 28");
assert.equal(batchLabelForSemester(2, new Date(2026, 7, 4), "entry"), "Fall 25");

console.log("✓ batch: parsing, APU calendar, semesters (graduation default; entry matches Season IX), alumni/incoming, inverse helper");
