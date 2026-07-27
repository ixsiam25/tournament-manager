import { getStore } from "@netlify/blobs";

const STORE_NAME = "player-photos";

/**
 * On Netlify, blob context is injected automatically for Next.js route
 * handlers (via @netlify/plugin-nextjs), so `getStore(STORE_NAME)` just
 * works in production. Local `next dev` has no such context, so we fall
 * back to explicit API-access config there (NETLIFY_SITE_ID +
 * NETLIFY_API_TOKEN in .env.local).
 */
export function getPhotoStore() {
  if (process.env.NETLIFY_SITE_ID && process.env.NETLIFY_API_TOKEN) {
    return getStore({
      name: STORE_NAME,
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_API_TOKEN,
    });
  }
  return getStore(STORE_NAME);
}
