"use client";

import { useEffect, useState } from "react";
import { cardFileName, downloadDataUrl } from "@/lib/cardImage";

/**
 * The thank-you card: the story-size image plus the quickest ways to post it.
 * Websites can't post to Instagram on someone's behalf, so the best route is the
 * phone's share sheet (which lists Instagram Stories, WhatsApp, …) or saving the
 * image and opening Instagram.
 */
export function StoryShare({ image, name, seasonName }: { image: string; name: string; seasonName: string }) {
  const [canShare, setCanShare] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const site = typeof window === "undefined" ? "" : window.location.host;
  const caption = `I'm in! ⚽ ${seasonName} — get your own player card at ${site}/register`;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- capability checks need the browser
    setIsMobile(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
    setCanShare(typeof navigator.share === "function" && typeof navigator.canShare === "function");
  }, []);

  async function toFile(): Promise<File> {
    const blob = await (await fetch(image)).blob();
    return new File([blob], cardFileName(name, "story"), { type: "image/png" });
  }

  async function share() {
    setNote(null);
    try {
      const file = await toFile();
      if (navigator.canShare({ files: [file] })) await navigator.share({ files: [file], text: caption });
      else setNote("Your browser can't share images directly — use Download instead.");
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) setNote("Couldn't open the share menu — use Download instead.");
    }
  }

  async function copyCaption() {
    await navigator.clipboard?.writeText(caption).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 text-center" data-testid="story-share">
      <p className="text-lg font-bold">Share your card</p>
      <p className="mb-4 text-sm text-muted-foreground">Post it on your story and tag the league.</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- a generated data URL */}
      <img src={image} alt="Your player card, story size" className="mx-auto mb-5 w-52 rounded-xl shadow-xl" />
      <div className="flex flex-col items-stretch gap-2 sm:mx-auto sm:max-w-xs">
        {canShare && (
          <button type="button" onClick={share} className="rounded-full bg-gradient-to-r from-[#833ab4] via-[#fd1d1d] to-[#fcb045] px-6 py-3 text-sm font-bold text-white shadow-md">
            📲 Share to Instagram, WhatsApp…
          </button>
        )}
        <button type="button" onClick={() => downloadDataUrl(image, cardFileName(name, "story"))} className="rounded-full bg-pitch px-6 py-3 text-sm font-bold text-white">
          ⬇ Download for stories
        </button>
        <a href={isMobile ? "instagram://story-camera" : "https://www.instagram.com/"} target={isMobile ? undefined : "_blank"} rel="noreferrer" className="rounded-full border border-line px-6 py-3 text-sm font-bold hover:bg-background">
          Open Instagram {isMobile ? "story camera" : ""} ↗
        </a>
        <button type="button" onClick={copyCaption} className="text-sm font-medium text-muted-foreground underline">
          {copied ? "Caption copied ✓" : "Copy a caption to paste"}
        </button>
      </div>
      {note && <p className="mt-3 text-xs text-live">{note}</p>}
      <p className="mt-4 text-xs text-muted-foreground">
        Instagram doesn&rsquo;t let websites post for you: download the image, open your story, and add it from your photos
        {canShare ? " — or use the share button, which lists Instagram Stories directly." : "."}
      </p>
    </section>
  );
}
