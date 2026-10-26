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
  return toPng(card, { pixelRatio: 3, cacheBust: true });
}

/**
 * The card placed on a 1080×1920 branded background — the size social media
 * stories use — so it can be posted as-is.
 */
export async function storyPng(card: HTMLElement, { title, subtitle }: { title: string; subtitle: string }): Promise<string> {
  const img = await loadImage(await cardPng(card));
  const canvas = document.createElement("canvas");
  canvas.width = STORY.w;
  canvas.height = STORY.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");

  const bg = ctx.createLinearGradient(0, 0, STORY.w, STORY.h);
  bg.addColorStop(0, "#7a1128");
  bg.addColorStop(0.55, "#2a0d16");
  bg.addColorStop(1, "#0f0b0a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, STORY.w, STORY.h);
  // soft spotlight behind the card
  const glow = ctx.createRadialGradient(STORY.w / 2, 930, 60, STORY.w / 2, 930, 720);
  glow.addColorStop(0, "rgba(255,255,255,0.22)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, STORY.w, STORY.h);

  const cardW = 800;
  const cardH = Math.round((img.height / img.width) * cardW);
  ctx.drawImage(img, (STORY.w - cardW) / 2, (STORY.h - cardH) / 2 + 20, cardW, cardH);

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 64px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.fillText(title.toUpperCase(), STORY.w / 2, 260);
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = "500 40px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.fillText(subtitle, STORY.w / 2, 330);
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = "600 36px system-ui, -apple-system, 'Segoe UI', sans-serif";
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
