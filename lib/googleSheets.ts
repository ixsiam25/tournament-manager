import crypto from "node:crypto";

// Minimal service-account JWT auth for the Google Sheets API v4, written
// against Node's built-in crypto/fetch rather than the `googleapis` package
// -- that package is large and this only ever needs two endpoints (token
// exchange + values:batchUpdate/batchClear). No dependency on `@/` path
// aliases anywhere in this file (or its callers in lib/standings.ts,
// lib/playerStats.ts, lib/db.ts) so it can run standalone inside a Netlify
// Function, which doesn't get Next.js's alias resolution.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

function base64url(input: string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAccessToken(): Promise<string> {
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  // Netlify's env var UI (and most others) can't hold literal newlines, so
  // the key is stored with escaped "\n" sequences and unescaped here.
  const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) {
    throw new Error("GOOGLE_SHEETS_CLIENT_EMAIL / GOOGLE_SHEETS_PRIVATE_KEY are not set");
  }

  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(
    JSON.stringify({ iss: clientEmail, scope: SHEETS_SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }),
  )}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer
    .sign(privateKey)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { access_token: string };
  return body.access_token;
}

export type SheetValueWrite = { range: string; values: string[][] };

/** Writes each `range` -> `values` pair in one batch call. */
export async function writeSheetValues(spreadsheetId: string, data: SheetValueWrite[]): Promise<void> {
  if (data.length === 0) return;
  const token = await getAccessToken();
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ valueInputOption: "RAW", data }),
  });
  if (!res.ok) throw new Error(`Sheets values:batchUpdate failed: ${res.status} ${await res.text()}`);
}

/** Clears each range first -- run before writeSheetValues so a shorter list
 * than last sync (e.g. after an admin resets a match) never leaves stale
 * trailing rows behind. */
export async function clearSheetRanges(spreadsheetId: string, ranges: string[]): Promise<void> {
  if (ranges.length === 0) return;
  const token = await getAccessToken();
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchClear`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ranges }),
  });
  if (!res.ok) throw new Error(`Sheets values:batchClear failed: ${res.status} ${await res.text()}`);
}
