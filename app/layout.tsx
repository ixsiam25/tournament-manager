import type { Metadata } from "next";
import { Geist, Geist_Mono, Anton } from "next/font/google";
import { noFlashThemeScript } from "@/components/ThemeToggle";
import { getCurrentSeason } from "@/lib/currentSeason";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const anton = Anton({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://bfl.online.zahan.jp";

/** Titles and link-preview (Facebook, Messenger, WhatsApp…) text follow the current season, so they never go stale. */
export async function generateMetadata(): Promise<Metadata> {
  let name = "Bangladesh Football League";
  let open = false;
  try {
    const season = await getCurrentSeason();
    if (season) {
      name = season.name;
      open = season.status === "ACTIVE" && season.registrationOpen && season.registrationSelfServeEnabled;
    }
  } catch {
    /* fall back to the league name */
  }
  const description = open ? `Applications are open for ${name} — register to play and get your own player card.` : `${name}: league standings, fixtures, and live scores.`;
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: name, template: `%s · ${name}` },
    description,
    openGraph: { title: name, description, siteName: "Bangladesh Football League", type: "website" },
    twitter: { card: "summary_large_image", title: name, description },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${anton.variable} h-full antialiased`}
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;800&family=Oswald:wght@500;600&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: noFlashThemeScript }} />
        <noscript>
          {/* Scroll-reveal elements ship with opacity:0 baked into the HTML.
              Without JS nothing ever animates them in, so show them outright. */}
          <style>{`[data-reveal]{opacity:1!important;transform:none!important}`}</style>
        </noscript>
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">{children}</body>
    </html>
  );
}
