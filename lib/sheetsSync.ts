import { getStandings } from "./standings";
import { getTopScorers, getTopAssists } from "./playerStats";
import { writeSheetValues, type SheetValueWrite } from "./googleSheets";

// Generous ceiling on how many data rows this tournament will realistically
// produce (8 teams, ~56 players). Every write is padded out to exactly this
// many rows (see `padRows`) so a shorter list than last sync (e.g. after an
// admin resets a match) overwrites stale trailing rows in the *same* write,
// rather than relying on a separate clear step beforehand -- a clear
// followed by a write that fails used to leave the sheet blank until the
// next successful run.
const MAX_ROWS = 65;
const STANDINGS_COLS = 10;
const PLAYER_COLS = 4;

function nowJst(): string {
  return new Date().toLocaleString("en-GB", { timeZone: "Asia/Tokyo" });
}

/** Pads `rows` out to a fixed `MAX_ROWS` height with blank rows, so writing
 * this block always overwrites any longer list left over from a previous
 * sync -- no separate clear call needed. */
function padRows(rows: string[][], cols: number): string[][] {
  const blank = Array(cols).fill("");
  const padded = rows.slice(0, MAX_ROWS);
  while (padded.length < MAX_ROWS) padded.push(blank);
  return padded;
}

/**
 * Pushes the current league standings and top scorers/assists into the
 * "bfl manager backup" Google Sheet, so there's a readable snapshot
 * available even if the site or its database is unreachable. Called on a
 * schedule (see netlify/functions/sync-sheets.mts) -- never from a request
 * a visitor is waiting on, since a slow or failing Google API call here
 * must not affect the live site.
 */
export async function syncStandingsToGoogleSheets(): Promise<void> {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error("GOOGLE_SHEETS_SPREADSHEET_ID is not set");

  const [standings, scorers, assists] = await Promise.all([getStandings(), getTopScorers(), getTopAssists()]);

  // A DB hiccup (a transient connection error surfaced as an empty result
  // rather than a thrown one, say) must never blank a sheet that already
  // has real data in it -- bail and let the next scheduled run try again.
  if (standings.length === 0) {
    console.error(
      "sync-sheets: getStandings() returned zero rows -- skipping write so a DB hiccup can't blank real data",
    );
    return;
  }

  const timestamp = `Last synced: ${nowJst()} JST`;

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

  console.log(
    `sync-sheets: writing ${standingsRows.length} standings row(s), ${scorerRows.length} scorer row(s), ${assistRows.length} assist row(s)`,
  );

  const writes: SheetValueWrite[] = [
    { range: "Standings!A2", values: [[timestamp]] },
    { range: "'Player standings'!A2", values: [[timestamp]] },
    { range: "Standings!A5", values: padRows(standingsRows, STANDINGS_COLS) },
    { range: "'Player standings'!A6", values: padRows(scorerRows, PLAYER_COLS) },
    { range: "'Player standings'!G6", values: padRows(assistRows, PLAYER_COLS) },
  ];

  await writeSheetValues(spreadsheetId, writes);
}
