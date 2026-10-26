/**
 * Forgiving "HH:MM" parsing for the time fields. Browsers' native time inputs
 * are fiddly to type into, so these fields are plain text and tidy what the
 * organiser typed: 5pm, 5:30 pm, 1730, 17.30, 9 → 17:00, 17:30, 17:30, 17:30, 09:00.
 * Returns null when the text isn't a time.
 */
export function parseTimeText(raw: string): string | null {
  const t = raw.trim().toLowerCase().replace(/\s+/g, "");
  const m = /^(\d{1,2})(?:[:.](\d{2})|(\d{2}))?(am|pm)?$/.exec(t);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? m[3] ?? 0);
  if (m[4] === "pm" && h < 12) h += 12;
  if (m[4] === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
