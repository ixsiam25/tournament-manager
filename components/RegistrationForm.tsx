"use client";

import { useEffect, useState } from "react";
import { ApplicationForm } from "@/components/ApplicationForm";
import { cardFileName, downloadDataUrl } from "@/lib/cardImage";
import { DEFAULT_APPLICATION_CONFIG, type ApplicationConfig } from "@/lib/applicationConfig";

/** Public "apply to play" experience: loads the season's form configuration,
 * shows the card-building form, and on success hands the applicant their
 * private edit link. */
export function RegistrationForm() {
  const [checking, setChecking] = useState(true);
  const [open, setOpen] = useState(false);
  const [seasonName, setSeasonName] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<string | null>(null);
  const [config, setConfig] = useState<ApplicationConfig>(DEFAULT_APPLICATION_CONFIG);
  const [editLink, setEditLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [story, setStory] = useState<string | null>(null);
  const [sharedName, setSharedName] = useState("");

  useEffect(() => {
    let ignore = false;
    (async () => {
      const res = await fetch("/api/register");
      const body = await res.json();
      if (!ignore) {
        setOpen(!!body.open);
        setSeasonName(body.seasonName);
        setDeadline(body.deadline);
        if (body.config) setConfig(body.config);
        setChecking(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  if (checking) return <p className="text-muted-foreground">Loading…</p>;

  if (!open) {
    return (
      <div className="rounded-3xl border border-line bg-surface p-8 text-center">
        <p className="text-4xl" aria-hidden>
          ⏳
        </p>
        <h1 className="mt-3 text-xl font-bold">Applications are closed</h1>
        <p className="mt-1 text-muted-foreground">
          Registration isn&apos;t open right now{seasonName ? ` for ${seasonName}` : ""}. Check back later.
        </p>
      </div>
    );
  }

  if (editLink) {
    return (
      <div className="space-y-5">
        <div className="rounded-3xl bg-gradient-to-br from-pitch to-pitch-dark p-7 text-center text-white shadow-lg">
          <p className="text-4xl" aria-hidden>
            ✅
          </p>
          <h2 className="mt-2 text-2xl font-black">You&rsquo;re in the queue!</h2>
          <p className="mt-1 text-white/85">Thanks — your application has been submitted for review.</p>
        </div>
        <div className="space-y-3 rounded-2xl border-2 border-pitch bg-pitch/10 p-5 text-pitch-dark">
          <p className="font-bold">Save your private link</p>
          <p className="text-sm">
            Save this private link. It&rsquo;s the only way to fix your details or photo until the organisers review your
            application — it won&rsquo;t be shown again.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input readOnly value={editLink} aria-label="Your private edit link" className="min-w-0 flex-1 rounded-xl border border-line bg-background px-3 py-2.5 text-xs" />
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard?.writeText(editLink).catch(() => {});
                setCopied(true);
              }}
              className="rounded-full bg-pitch px-5 py-2.5 text-sm font-bold text-white"
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        </div>
        {story && (
          <div className="rounded-2xl border border-line bg-surface p-5 text-center">
            <p className="font-bold">Share your card</p>
            <p className="mb-3 text-sm text-muted-foreground">Post it on your story and tag the league.</p>
            {/* eslint-disable-next-line @next/next/no-img-element -- a generated data URL */}
            <img src={story} alt="Your player card, story size" className="mx-auto mb-4 w-44 rounded-xl shadow-lg" />
            <button
              type="button"
              onClick={() => downloadDataUrl(story, cardFileName(sharedName, "story"))}
              className="rounded-full bg-pitch px-6 py-3 text-sm font-bold text-white"
            >
              ⬇ Download for stories
            </button>
          </div>
        )}
        <ol className="space-y-2 rounded-2xl border border-line bg-surface p-5 text-sm">
          <li className="font-bold">What happens next</li>
          <li>1. The organisers review your application.</li>
          <li>2. If approved, you join the player pool and get your rating.</li>
          <li>3. Teams are formed — you&rsquo;ll be told which one is yours.</li>
        </ol>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#7a1128] via-[#5a0c1d] to-[#1b1412] p-6 text-white shadow-lg sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-white/70">{seasonName || "Bangladesh Football League"}</p>
        <h1 className="mt-2 heading-display text-3xl sm:text-4xl">Register</h1>
        <p className="mt-1 text-white/85">Sign up to play this season — and get your own player card.</p>
        <ol className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
          {["About you", "Your photo", "Check your card & send"].map((t, i) => (
            <li key={t} className="flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] font-black text-[#5a0c1d]">{i + 1}</span>
              {t}
            </li>
          ))}
        </ol>
        {deadline && (
          <p className="mt-4 inline-block rounded-full bg-black/30 px-3 py-1 text-xs">
            ⏰ Applications close {new Date(deadline).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
          </p>
        )}
      </header>
      <ApplicationForm
        config={config}
        seasonName={seasonName ?? ""}
        mode="create"
        submitLabel="Submit application"
        onSubmit={async (fd, extra) => {
          const res = await fetch("/api/register", { method: "POST", body: fd });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) return body.error ?? "Failed to submit";
          setStory(extra.storyPng);
          setSharedName(String(fd.get("name") ?? ""));
          setEditLink(`${window.location.origin}/register/edit/${body.editToken}`);
          return null;
        }}
      />
    </div>
  );
}
