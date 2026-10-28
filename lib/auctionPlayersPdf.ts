import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { getObject } from "@/lib/mediaStore";

export type PdfPlayer = { name: string; position: string | null; semester: string | null; imageUrl: string | null };
export type PdfCaptain = { team: string; name: string };
export type PdfInput = {
  seasonName: string;
  players: PdfPlayer[];
  captains: PdfCaptain[];
  rules: { basePrice: number; bidIncrement: number; budgetPerTeam: number };
};

const POS_ORDER = ["GK", "DEF", "MID", "FWD"] as const;
const POS_LABEL: Record<string, string> = { GK: "Goalkeepers", DEF: "Defenders", MID: "Midfielders", FWD: "Forwards", NONE: "Position not set" };

/** Standard PDF fonts only cover Latin-1; anything else is shown as "?" rather than failing. */
const safe = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

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
    /* fall through: no picture */
  }
  return null;
}

/** Small square JPEG thumbnail (keeps the PDF light); falls back to the original bytes. */
async function thumbnail(url: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  const raw = await imageBytes(url);
  if (!raw) return null;
  try {
    const sharp = (await import("sharp")).default;
    const out = await sharp(Buffer.from(raw.bytes)).resize(200, 200, { fit: "cover", position: "top" }).jpeg({ quality: 72 }).toBuffer();
    return { bytes: new Uint8Array(out), type: "image/jpeg" };
  } catch {
    return raw.type === "image/webp" ? null : raw;
  }
}

/** The "players available for bidding" handout: a clean list with a picture for everyone. */
export async function buildAuctionPlayersPdf(input: PdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  // pictures, fetched a handful at a time
  const pictures = new Map<number, PDFImage | null>();
  const queue = input.players.map((p, i) => [p, i] as const);
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        const [p, i] = job;
        const t = p.imageUrl ? await thumbnail(p.imageUrl) : null;
        try {
          pictures.set(i, t ? (t.type === "image/png" ? await doc.embedPng(t.bytes) : await doc.embedJpg(t.bytes)) : null);
        } catch {
          pictures.set(i, null);
        }
      }
    }),
  );

  const W = 595.28;
  const H = 841.89;
  const M = 40;
  const ROW = 56;
  const ink = rgb(0.1, 0.08, 0.07);
  const muted = rgb(0.45, 0.4, 0.37);
  const maroon = rgb(0.48, 0.07, 0.16);
  const line = rgb(0.88, 0.85, 0.8);
  let page: PDFPage;
  let y = 0;
  const pages: PDFPage[] = [];

  const text = (p: PDFPage, s: string, x: number, yy: number, size: number, f: PDFFont = font, color = ink) => p.drawText(safe(s), { x, y: yy, size, font: f, color });

  function newPage(first = false) {
    page = doc.addPage([W, H]);
    pages.push(page);
    page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: maroon });
    y = H - M - 8;
    if (first) {
      text(page, "AUCTION PLAYERS LIST", M, y - 16, 20, bold, maroon);
      text(page, input.seasonName, M, y - 36, 12, font, ink);
      text(page, `${input.players.length} players available for bidding  -  ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`, M, y - 52, 9.5, font, muted);
      text(page, `Base price ${input.rules.basePrice}  -  bid increment ${input.rules.bidIncrement}  -  budget per team ${input.rules.budgetPerTeam}`, M, y - 66, 9.5, font, muted);
      y -= 86;
    } else {
      text(page, `Auction players list - ${input.seasonName}`, M, y - 6, 9, font, muted);
      y -= 24;
    }
  }

  const ensure = (needed: number) => {
    if (y - needed < M + 20) newPage();
  };

  newPage(true);

  if (input.captains.length > 0) {
    ensure(40 + input.captains.length * 14);
    text(page!, "TEAM CAPTAINS (already placed - not up for bidding)", M, y - 10, 9.5, bold, maroon);
    y -= 22;
    for (const c of input.captains) {
      text(page!, c.team, M, y - 8, 10, bold);
      text(page!, c.name, M + 170, y - 8, 10, font);
      y -= 14;
    }
    y -= 10;
  }

  const groups = [...POS_ORDER, "NONE"] as const;
  let number = 0;
  for (const g of groups) {
    const list = input.players.map((p, i) => ({ p, i })).filter(({ p }) => (g === "NONE" ? !p.position || !POS_ORDER.includes(p.position as (typeof POS_ORDER)[number]) : p.position === g)).sort((a, b) => a.p.name.localeCompare(b.p.name));
    if (list.length === 0) continue;
    ensure(30 + ROW);
    page!.drawRectangle({ x: M, y: y - 20, width: W - 2 * M, height: 20, color: rgb(0.96, 0.93, 0.9) });
    text(page!, `${POS_LABEL[g].toUpperCase()}  (${list.length})`, M + 8, y - 14, 9.5, bold, maroon);
    y -= 26;
    for (const { p, i } of list) {
      ensure(ROW);
      number++;
      const top = y;
      text(page!, String(number), M + 4, top - 30, 9, font, muted);
      const pic = pictures.get(i);
      const size = 46;
      if (pic) page!.drawImage(pic, { x: M + 28, y: top - size - 3, width: size, height: size });
      else {
        page!.drawRectangle({ x: M + 28, y: top - size - 3, width: size, height: size, color: rgb(0.93, 0.9, 0.87) });
        text(page!, (p.name.trim()[0] ?? "?").toUpperCase(), M + 28 + 18, top - 33, 18, bold, muted);
      }
      text(page!, p.name, M + 88, top - 22, 12.5, bold);
      text(page!, p.semester ?? "", M + 88, top - 38, 9.5, font, muted);
      if (p.position) text(page!, p.position, W - M - 60, top - 28, 12, bold, maroon);
      page!.drawLine({ start: { x: M, y: top - ROW + 2 }, end: { x: W - M, y: top - ROW + 2 }, thickness: 0.5, color: line });
      y -= ROW;
    }
    y -= 6;
  }

  pages.forEach((p, i) => text(p, `Page ${i + 1} of ${pages.length}`, W - M - 52, 20, 8, font, muted));
  return doc.save();
}
