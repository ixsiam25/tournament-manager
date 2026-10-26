import { CARD_H, CARD_W } from "@/lib/cardGeometry";
import { drawCard, loadCardFonts, loadImage, type CardSpec } from "@/lib/cardCanvas";

export type { CardSpec };

const STORY = { w: 1080, h: 1920 };

/**
 * The card drawn straight onto a canvas — no screenshotting of the page, so it
 * comes out the same in every browser. Transparent background, 3x size.
 */
export async function cardPng(spec: CardSpec): Promise<string> {
  await loadCardFonts();
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W * 3;
  canvas.height = CARD_H * 3;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  await drawCard(ctx, spec, 0, 0, canvas.width);
  return canvas.toDataURL("image/png");
}

/** The card on a 1080×1920 marble background — the size social media stories use. */
export async function storyPng(spec: CardSpec, { title, subtitle }: { title: string; subtitle: string }, opts: { strictPhoto?: boolean } = {}): Promise<string> {
  await loadCardFonts();
  await document.fonts.load('800 64px "Cinzel"').catch(() => {});
  const canvas = document.createElement("canvas");
  canvas.width = STORY.w;
  canvas.height = STORY.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");

  try {
    const marble = await loadImage("/card/marble.jpg");
    const k = Math.max(STORY.w / marble.width, STORY.h / marble.height);
    ctx.drawImage(marble, (STORY.w - marble.width * k) / 2, (STORY.h - marble.height * k) / 2, marble.width * k, marble.height * k);
  } catch {
    ctx.fillStyle = "#3a0b14";
    ctx.fillRect(0, 0, STORY.w, STORY.h);
  }
  // darken, then a vignette and a soft spotlight so the card stands out
  ctx.fillStyle = "rgba(12,3,5,0.55)";
  ctx.fillRect(0, 0, STORY.w, STORY.h);
  const vignette = ctx.createRadialGradient(STORY.w / 2, 960, 300, STORY.w / 2, 960, 1250);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(5,1,2,0.8)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, STORY.w, STORY.h);
  const glow = ctx.createRadialGradient(STORY.w / 2, 960, 40, STORY.w / 2, 960, 640);
  glow.addColorStop(0, "rgba(255,214,140,0.28)");
  glow.addColorStop(1, "rgba(255,214,140,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, STORY.w, STORY.h);

  const cardW = 780;
  const cardH = Math.round((CARD_H / CARD_W) * cardW);
  await drawCard(ctx, spec, (STORY.w - cardW) / 2, (STORY.h - cardH) / 2 + 20, cardW, opts);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#f3dd9c";
  ctx.font = "800 64px Cinzel, Georgia, serif";
  ctx.fillText(title.toUpperCase(), STORY.w / 2, 260);
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font = "500 40px Oswald, system-ui, sans-serif";
  ctx.fillText(subtitle, STORY.w / 2, 330);
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = "500 36px Oswald, system-ui, sans-serif";
  ctx.fillText(window.location.host, STORY.w / 2, STORY.h - 150);
  return canvas.toDataURL("image/png");
}

export function downloadDataUrl(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}

export const cardFileName = (name: string, suffix: string) => `${(name.trim() || "player").replace(/[^\p{L}\p{N}]+/gu, "-")}-${suffix}.png`;

/**
 * `storyPng` with patience: if an image or font isn't ready yet it waits and tries
 * again (up to `attempts` times), and only gives up on the photo as a last resort,
 * so the page that follows never shows an empty card.
 */
export async function storyPngWithRetry(spec: CardSpec, text: { title: string; subtitle: string }, attempts = 4): Promise<string | null> {
  for (let i = 1; i <= attempts; i++) {
    try {
      return await storyPng(spec, text, { strictPhoto: i < attempts });
    } catch {
      if (i === attempts) break;
      await new Promise((r) => setTimeout(r, 400 * i));
    }
  }
  return null;
}
