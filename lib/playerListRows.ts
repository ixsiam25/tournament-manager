import { batchInfo } from "@/lib/batch";
import { semesterRank, type PlayerListRow } from "@/lib/playerListPdf";

/** The semester column: "Alumni", the semester number, or "New" for a batch that hasn't started. */
export function semesterCell(affiliation: string | null | undefined, meaning: "entry" | "graduation" = "graduation"): string {
  const info = batchInfo(affiliation, new Date(), meaning);
  if (!info.valid) return "-";
  if (info.status === "alumni") return "Alumni";
  if (info.status === "incoming") return "New";
  return String(info.semester);
}

/** Alumni first, then 8th semester down to 1st; A–Z inside each semester. */
export function sortPlayerRows(rows: PlayerListRow[]): PlayerListRow[] {
  return [...rows].sort((a, b) => semesterRank(b.semester) - semesterRank(a.semester) || a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
}

/** The red notes under the title, built from what is actually on the list. */
export function listNotes(rows: PlayerListRow[], placedTeams: string[], auction: boolean): string[] {
  const notes: string[] = [];
  const hasCaptains = rows.some((r) => r.kind === "captain");
  const hasPlaced = rows.some((r) => r.kind === "placed");
  if (hasCaptains) notes.push("**Players in green boxes are captains**");
  if (hasPlaced) notes.push(`**Players in red boxes are already placed${placedTeams.length ? ` (${placedTeams.join(", ")})` : ""}**`);
  if (auction && (hasCaptains || hasPlaced)) notes.push("**These players will not be available for bidding**");
  return notes;
}
