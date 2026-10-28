import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { getCurrentSeason } from "@/lib/currentSeason";

// Built per request so the preview always shows the current season (and whether applications are open).
export const dynamic = "force-dynamic";
export const alt = "Bangladesh Football League";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const dataUrl = async (file: string, mime: string) => `data:${mime};base64,${(await readFile(path.join(process.cwd(), "public", file))).toString("base64")}`;

export default async function OpenGraphImage() {
  let name = "Bangladesh Football League";
  let line = "League standings, fixtures and live scores";
  try {
    const season = await getCurrentSeason();
    if (season) {
      name = season.name;
      if (season.status === "ACTIVE" && season.registrationOpen && season.registrationSelfServeEnabled) line = "Applications open — register to play";
    }
  } catch {
    /* defaults */
  }
  const [marble, logo] = await Promise.all([dataUrl("card/marble.jpg", "image/jpeg"), dataUrl("logo.jpg", "image/jpeg")]);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#1a0709", color: "#f3dd9c" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={marble} alt="" width={1200} height={630} style={{ position: "absolute", inset: 0, width: 1200, height: 630, objectFit: "cover" }} />
        <div style={{ position: "absolute", left: 0, top: 0, width: 1200, height: 630, display: "flex", backgroundColor: "rgba(10,3,5,0.66)" }} />
        <div style={{ position: "relative", display: "flex", alignItems: "center", padding: "0 80px", width: "100%" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt="" width={300} height={300} style={{ borderRadius: 32, marginRight: 64 }} />
          <div style={{ display: "flex", flexDirection: "column", width: 700 }}>
            <div style={{ fontSize: 30, letterSpacing: 8, color: "rgba(255,255,255,0.75)", textTransform: "uppercase" }}>Bangladesh Football League</div>
            <div style={{ fontSize: name.length <= 14 ? 100 : name.length <= 22 ? 72 : 54, fontWeight: 800, lineHeight: 1.1, marginTop: 18, color: "#f3dd9c" }}>{name}</div>
            <div style={{ fontSize: 38, marginTop: 28, color: "#ffffff" }}>{line}</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
