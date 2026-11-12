import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { getObject } from "@/lib/mediaStore";

export type PlayerListRow = {
  name: string;
  /** "Alumni", or the semester number */
  semester: string;
  position: string | null;
  imageUrl: string | null;
  kind: "normal" | "captain" | "placed";
};
export type PlayerListInput = {
  /** e.g. "BFL Season X" */
  title: string;
  /** e.g. "Player list" / "Pending applications" */
  subtitle: string;
  /** red bold lines under the title */
  notes: string[];
  rows: PlayerListRow[];
};

const POSITION_WORDS: Record<string, string> = { GK: "Goal Keeper", DEF: "Defender", MID: "Midfielder", FWD: "Forward" };
export const positionWord = (p: string | null | undefined) => (p ? (POSITION_WORDS[p] ?? p) : "");

/** Standard PDF fonts only cover Latin-1; anything else is shown as "?" rather than failing. */
const safe = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

/** "05.06-11:41" — day.month-hour:minute in Japan time, the version stamp printed on the list. */
export function versionStamp(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `v${get("day")}.${get("month")}-${get("hour")}:${get("minute")}`;
}

/** Semester column sort key: Alumni first, then 8 → 1, then anything else. */
export const semesterRank = (s: string) => (/alumni/i.test(s) ? 100 : /^\d+$/.test(s) ? Number(s) : -1);

async function imageBytes(url: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  try {
    if (url.startsWith("/api/photos/")) {
      const obj = await getObject(url.slice("/api/photos/".length));
      return obj ? { bytes: obj.data, type: obj.contentType } : null;
    }
    if (url.startsWith("/photos/") || url.startsWith("/players/")) {
      const bytes = await readFile(path.join(process.cwd(), "public", url));
      return { bytes: new Uint8Array(bytes), type: url.endsWith(".png") ? "image/png" : "image/jpeg" };
    }
  } catch {
    /* no picture */
  }
  return null;
}

/** A JPEG cropped to the photo cell's shape (faces sit near the top, so crop from there). */
async function cellPhoto(url: string, w: number, h: number): Promise<{ bytes: Uint8Array; type: string } | null> {
  const raw = await imageBytes(url);
  if (!raw) return null;
  try {
    const sharp = (await import("sharp")).default;
    const out = await sharp(Buffer.from(raw.bytes)).resize(w, h, { fit: "cover", position: "top" }).jpeg({ quality: 74 }).toBuffer();
    return { bytes: new Uint8Array(out), type: "image/jpeg" };
  } catch {
    return raw.type === "image/webp" ? null : raw;
  }
}

/**
 * The BFL player list: a title block (green) with the version stamp and red notes, then a
 * Name | Semester | Position | Photo table — captains in green rows, players already placed
 * with a team in red rows, everyone else on alternating white/grey rows.
 */
export async function buildPlayerListPdf(input: PlayerListInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const W = 595.28;
  const H = 841.89;
  const COLS = [168, 82, 108, 122];
  const TABLE_W = COLS.reduce((a, b) => a + b, 0);
  const X0 = (W - TABLE_W) / 2;
  const ROW_H = 100;
  const HEAD_H = 34;
  const TOP = H - 50;
  const BOTTOM = 46;
  const grid = rgb(0.85, 0.85, 0.85);
  const green = rgb(0.15, 0.33, 0.07);
  const red = rgb(1, 0, 0);
  const FILL = { captain: rgb(0.416, 0.659, 0.31), placed: rgb(0.878, 0.4, 0.4), even: rgb(0.973, 0.976, 0.98), odd: rgb(1, 1, 1) };

  // pictures, a handful at a time
  const pics = new Map<number, PDFImage | null>();
  const queue = input.rows.map((r, i) => [r, i] as const);
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        const [r, i] = job;
        const t = r.imageUrl ? await cellPhoto(r.imageUrl, Math.round(COLS[3] * 3), ROW_H * 3) : null;
        try {
          pics.set(i, t ? (t.type === "image/png" ? await doc.embedPng(t.bytes) : await doc.embedJpg(t.bytes)) : null);
        } catch {
          pics.set(i, null);
        }
      }
    }),
  );

  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;
  const centered = (p: PDFPage, s: string, cx: number, yy: number, size: number, f: PDFFont, color = rgb(0, 0, 0)) => {
    const t = safe(s);
    p.drawText(t, { x: cx - f.widthOfTextAtSize(t, size) / 2, y: yy, size, font: f, color });
  };
  const wrap = (s: string, maxW: number, size: number): string[] => {
    const words = safe(s).split(/\s+/);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) <= maxW || !cur) cur = next;
      else {
        lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    return lines.slice(0, 3);
  };
  const box = (p: PDFPage, x: number, top: number, w: number, h: number, fill?: ReturnType<typeof rgb>) =>
    p.drawRectangle({ x, y: top - h, width: w, height: h, color: fill, borderColor: grid, borderWidth: 0.8 });

  function newPage() {
    page = doc.addPage([W, H]);
    pages.push(page);
    y = TOP;
  }
  newPage();

  // title block
  const notes = input.notes;
  const titleH = 62 + notes.length * 11 + 18;
  box(page, X0, y, TABLE_W, titleH);
  centered(page, input.title, W / 2, y - 30, 17, bold, green);
  centered(page, `(${input.subtitle} ${versionStamp()})`, W / 2, y - 50, 17, bold, green);
  notes.forEach((n, i) => centered(page, n, W / 2, y - 76 - i * 11, 7.5, bold, red));
  y -= titleH;

  // header row
  const headers = ["Name", "Semester", "Position", ""];
  let hx = X0;
  headers.forEach((h, i) => {
    box(page, hx, y, COLS[i], HEAD_H, rgb(1, 1, 1));
    if (h) centered(page, h, hx + COLS[i] / 2, y - HEAD_H / 2 - 4, 11, bold);
    hx += COLS[i];
  });
  y -= HEAD_H;

  input.rows.forEach((r, i) => {
    if (y - ROW_H < BOTTOM) newPage();
    const fill = r.kind === "captain" ? FILL.captain : r.kind === "placed" ? FILL.placed : i % 2 === 0 ? FILL.odd : FILL.even;
    let cx = X0;
    const values = [r.kind === "captain" ? `${r.name} (C)` : r.name, r.semester, positionWord(r.position)];
    values.forEach((v, c) => {
      box(page, cx, y, COLS[c], ROW_H, fill);
      const lines = c === 0 ? wrap(v, COLS[0] - 20, 11) : [safe(v)];
      lines.forEach((ln, li) => centered(page, ln, cx + COLS[c] / 2, y - ROW_H / 2 + ((lines.length - 1) / 2 - li) * 14 - 4, 11, font));
      cx += COLS[c];
    });
    box(page, cx, y, COLS[3], ROW_H, fill);
    const pic = pics.get(i);
    if (pic) page.drawImage(pic, { x: cx + 0.5, y: y - ROW_H + 0.5, width: COLS[3] - 1, height: ROW_H - 1 });
    y -= ROW_H;
  });

  pages.forEach((p, i) => p.drawText(`Page ${i + 1} of ${pages.length}`, { x: W - 90, y: 22, size: 8, font, color: rgb(0.5, 0.5, 0.5) }));
  return doc.save();
}
