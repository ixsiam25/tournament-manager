import { getStore } from "@netlify/blobs";

const PHOTO_STORE_NAME = "player-photos";
const SEASON_ARCHIVE_STORE_NAME = "season-archives";

/**
 * On Netlify, blob context is injected automatically for Next.js route
 * handlers (via @netlify/plugin-nextjs), so `getStore(name)` just works in
 * production. Local `next dev` has no such context, so we fall back to
 * explicit API-access config there (NETLIFY_SITE_ID + NETLIFY_API_TOKEN in
 * .env.local).
 */
function getNamedStore(name: string) {
  if (process.env.NETLIFY_SITE_ID && process.env.NETLIFY_API_TOKEN) {
    return getStore({
      name,
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_API_TOKEN,
    });
  }
  return getStore(name);
}

export function getPhotoStore() {
  return getNamedStore(PHOTO_STORE_NAME);
}

/** Frozen `Season.resultsJson` copies (Stage 1 backfill, Stage 4.1 rollover)
 * — a second backup independent of the DB, same reasoning as the existing
 * Google Sheets sync in `lib/sheetsSync.ts`. */
export function getSeasonArchiveStore() {
  return getNamedStore(SEASON_ARCHIVE_STORE_NAME);
}
