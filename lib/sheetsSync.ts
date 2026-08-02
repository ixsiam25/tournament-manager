import { getStandings } from "./standings";
import { getTopScorers, getTopAssists } from "./playerStats";
import { writeSheetValues, clearSheetRanges, type SheetValueWrite } from "./googleSheets";

// Generous ceiling on how many data rows to clear before each write, well
// above anything this tournament will realistically produce (8 teams, ~56
// players) -- just insurance against stale trailing rows from a previous,
// longer list.
const MAX_ROWS = 65;

function nowJst(): string {
  return new Date().toLocaleString("en-GB", { timeZone: "Asia/Tokyo" });
}

/**
 * Pushes the current league standings and top scorers/assists into the
 * "BFL Season IX — Live Backup" Google Sheet, so there's a readable
 * snapshot available even if the site or its database is unreachable.
 * Called on a schedule (see netlify/functions/sync-sheets.mts) -- never
 * from a request a visitor is waiting on, since a slow or failing Google
 * API call here must not affect the live site.
 */
export async function syncStandingsToGoogleSheets(): Promise<void> {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error("GOOGLE_SHEETS_SPREADSHEET_ID is not set");

  const [standings, scorers, assists] = await Promise.all([getStandings(), getTopScorers(), getTopAssists()]);
  const timestamp = `Last synced: ${nowJst()} JST`;

  await clearSheetRanges(spreadsheetId, [
    `Standings!A5:J${5 + MAX_ROWS}`,
    `'Player standings'!A6:D${6 + MAX_ROWS}`,
    `'Player standings'!G6:J${6 + MAX_ROWS}`,
  ]);

  const standingsRows = standings.map((row, i) => [
    String(i + 1),
    row.teamName,
    String(row.played),
    String(row.won),
    String(row.drawn),
    String(row.lost),
    String(row.goalsFor),
    String(row.goalsAgainst),
    String(row.goalDifference),
    String(row.points),
  ]);
  const scorerRows = scorers.map((s, i) => [String(i + 1), s.playerName, s.teamName, String(s.count)]);
  const assistRows = assists.map((s, i) => [String(i + 1), s.playerName, s.teamName, String(s.count)]);

  const writes: SheetValueWrite[] = [
    { range: "Standings!A2", values: [[timestamp]] },
    { range: "'Player standings'!A2", values: [[timestamp]] },
  ];
  if (standingsRows.length > 0) writes.push({ range: "Standings!A5", values: standingsRows });
  if (scorerRows.length > 0) writes.push({ range: "'Player standings'!A6", values: scorerRows });
  if (assistRows.length > 0) writes.push({ range: "'Player standings'!G6", values: assistRows });

  await writeSheetValues(spreadsheetId, writes);
}
