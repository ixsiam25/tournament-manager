import assert from "node:assert/strict";
import { parseTimeText } from "../../lib/timeText";

const cases: [string, string | null][] = [
  ["17:00", "17:00"], ["5pm", "17:00"], ["5:30 pm", "17:30"], ["1730", "17:30"], ["17.30", "17:30"], ["9", "09:00"],
  ["12am", "00:00"], ["12pm", "12:00"], ["24:00", null], ["17:75", null], ["abc", null], ["", null],
];
for (const [input, want] of cases) assert.equal(parseTimeText(input), want, `parse(${JSON.stringify(input)})`);
console.log("✓ timeText: forgiving HH:MM parsing");
