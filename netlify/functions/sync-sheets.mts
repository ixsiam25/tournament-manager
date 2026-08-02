import type { Config } from "@netlify/functions";
import { syncStandingsToGoogleSheets } from "../../lib/sheetsSync";

// Runs on a schedule (see `config` below) to push current standings and
// player stats into the "BFL Season IX — Live Backup" Google Sheet, so
// there's a readable snapshot available if the site or its database goes
// down mid-tournament. Deliberately not triggered from any user-facing
// request — a slow or failing Google API call here must never affect
// someone using the live site.
async function handler() {
  try {
    await syncStandingsToGoogleSheets();
    return new Response("ok");
  } catch (error) {
    // Scheduled functions have no one waiting on the response, so log and
    // let the next run try again rather than throwing.
    console.error("sync-sheets failed:", error);
    return new Response("sync failed, see function logs", { status: 500 });
  }
}

export default handler;

export const config: Config = {
  // Every 3 minutes, all day, every day. Cheap enough to just leave running
  // rather than trying to detect "is a tournament happening right now".
  schedule: "*/3 * * * *",
};
