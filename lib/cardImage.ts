import { toPng } from "html-to-image";

const STORY = { w: 1080, h: 1920 };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image failed to load"));
    img.src = src;
  });
}

/** The card itself as a transparent PNG (3x for crispness). */
export async function cardPng(card: HTMLElement): Promise<string> {
  // Make sure every layer (frame art, photo) is decoded, and render once to warm up:
  // the first html-to-image render often comes out without its images.
  await Promise.all([...card.querySelectorAll("img")].map((i) => i.decode().catch(() => {})));
  await document.fonts.ready.catch(() => {});
  // no cacheBust: it appends ?timestamp to every image URL, which breaks blob: previews
  await toPng(card, { pixelRatio: 1 }).catch(() => {});
  return toPng(card, { pixelRatio: 3 });
}

/**
 * The card placed on a 1080×1920 branded background — the size social media
 * stories use — so it can be posted as-is.
 */
export async function storyPng(card: HTMLElement, { title, subtitle }: { title: string; subtitle: string }): Promise<string> {
  await Promise.all([document.fonts.load('800 64px "Cinzel"'), document.fonts.load('600 40px "Oswald"')]).catch(() => {});
  const img = await loadImage(await cardPng(card));
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
  const cardH = Math.round((img.height / img.width) * cardW);
  ctx.drawImage(img, (STORY.w - cardW) / 2, (STORY.h - cardH) / 2 + 20, cardW, cardH);

  ctx.textAlign = "center";
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
