import { CARD_H, CARD_W, PHOTO_CLIP, PHOTO_WINDOW } from "@/lib/cardGeometry";

export type CardSpec = {
  name: string;
  position: string | null;
  /** "6TH SEM", "ALUMNI", "NEW" or null */
  semester: string | null;
  stats: { label: string; value: number | null }[];
  imageUrl: string | null;
  isCutout: boolean;
  framing: { zoom: number; x: number; y: number };
  footer?: string;
};

const GOLD = "#f3dd9c";
const SERIF = '"Cinzel", Georgia, serif';
const SANS = '"Oswald", "Arial Narrow", sans-serif';

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image failed to load: ${src.slice(0, 60)}`));
    img.src = src;
  });
}

/** Wait for the card fonts so the canvas text isn't drawn in a fallback face. */
export async function loadCardFonts() {
  await Promise.all([
    document.fonts.load('800 16px "Cinzel"'),
    document.fonts.load('600 17px "Oswald"'),
    document.fonts.load('500 11px "Oswald"'),
  ]).catch(() => {});
}

type TextOpts = { font: string; color?: string; align?: CanvasTextAlign; spacing?: number; alpha?: number; maxWidth?: number };

/** Draws text and returns its width in card pixels. */
function text(ctx: CanvasRenderingContext2D, s: number, str: string, x: number, y: number, o: TextOpts): number {
  ctx.save();
  ctx.font = o.font.replace(/(\d+(?:\.\d+)?)px/, (_, n) => `${Number(n) * s}px`);
  ctx.fillStyle = o.color ?? GOLD;
  ctx.textAlign = o.align ?? "left";
  ctx.textBaseline = "middle";
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 2 * s;
  ctx.shadowOffsetY = 1 * s;
  const spacing = (o.spacing ?? 0) * s;
  if ("letterSpacing" in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${spacing}px`;
  let out = str;
  if (o.maxWidth) {
    const max = o.maxWidth * s;
    while (out.length > 1 && ctx.measureText(out).width > max) out = out.slice(0, -1);
  }
  const width = ctx.measureText(out).width / s;
  ctx.fillText(out, x * s, y * s);
  ctx.restore();
  return width;
}

/** Draws the card (art layers + photo + text) with its top-left corner at (ox, oy), `width` px wide. */
export async function drawCard(ctx: CanvasRenderingContext2D, spec: CardSpec, ox: number, oy: number, width: number, opts: { strictPhoto?: boolean } = {}) {
  const s = width / CARD_W;
  const [base, top, photo] = await Promise.all([
    loadImage("/card/base.png"),
    loadImage("/card/top.png"),
    spec.imageUrl ? loadImage(spec.imageUrl).catch((e) => { if (opts.strictPhoto) throw e; return null; }) : Promise.resolve(null),
  ]);
  ctx.save();
  ctx.translate(ox, oy);
  ctx.drawImage(base, 0, 0, CARD_W * s, CARD_H * s);

  if (photo) {
    const W = PHOTO_WINDOW;
    ctx.save();
    ctx.beginPath();
    PHOTO_CLIP.forEach(([px, py], i) => (i === 0 ? ctx.moveTo((W.x + px) * s, (W.y + py) * s) : ctx.lineTo((W.x + px) * s, (W.y + py) * s)));
    ctx.closePath();
    ctx.clip();
    const z = spec.framing.zoom / 100;
    const bw = W.w * z;
    const bh = W.h * z;
    const bx = W.x + W.w / 2 + spec.framing.x - bw / 2;
    const by = W.y + W.h / 2 + spec.framing.y - bh / 2;
    const k = spec.isCutout ? Math.min(bw / photo.width, bh / photo.height) : Math.max(bw / photo.width, bh / photo.height);
    const dw = photo.width * k;
    const dh = photo.height * k;
    const dx = bx + (bw - dw) / 2;
    const dy = spec.isCutout ? by + bh - dh : by + (bh - dh) / 2; // cut-outs sit on the bottom edge
    ctx.drawImage(photo, dx * s, dy * s, dw * s, dh * s);
    ctx.restore();
  }

  ctx.drawImage(top, 0, 0, CARD_W * s, CARD_H * s);

  // left strip: position between the gold rules, semester underneath
  text(ctx, s, spec.position ?? "—", 50.5, 152, { font: `600 17px ${SANS}`, align: "center", spacing: 1 });
  const sem = spec.semester ? /^(\d+)(ST|ND|RD|TH) SEM$/.exec(spec.semester) : null;
  if (sem) {
    text(ctx, s, sem[1], 50.5, 190, { font: `600 30px ${SANS}`, align: "center" });
    text(ctx, s, `${sem[2]} SEM`, 50.5, 211, { font: `500 9px ${SANS}`, align: "center", spacing: 1.2 });
  } else {
    text(ctx, s, spec.semester ?? "—", 50.5, 190, { font: `600 12px ${SANS}`, align: "center", spacing: 1 });
  }

  text(ctx, s, (spec.name.trim() || "Your name").toUpperCase(), 115, 233, { font: `800 16px ${SERIF}`, align: "center", spacing: 1, maxWidth: 202 });

  // stats: two columns split by the gold divider at x = 115
  const rows = [259, 281, 303];
  spec.stats.slice(0, 6).forEach((st, i) => {
    const row = rows[i % 3];
    const left = i < 3;
    const value = String(st.value ?? "—");
    if (left) {
      const w = text(ctx, s, st.label, 106, row, { font: `500 11px ${SANS}`, align: "right", spacing: 0.9 });
      text(ctx, s, value, 106 - w - 5, row, { font: `600 14px ${SANS}`, color: "#fff3cc", align: "right" });
    } else {
      const w = text(ctx, s, value, 124, row, { font: `600 14px ${SANS}`, color: "#fff3cc", align: "left" });
      text(ctx, s, st.label, 124 + w + 5, row, { font: `500 11px ${SANS}`, align: "left", spacing: 0.9 });
    }
  });

  if (spec.footer) text(ctx, s, spec.footer.toUpperCase(), 115, 326.5, { font: `500 6.5px ${SANS}`, align: "center", spacing: 0.9, alpha: 0.75, maxWidth: 106 });
  ctx.restore();
}
