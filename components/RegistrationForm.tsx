"use client";

import { useEffect, useState } from "react";
import { ApplicationForm } from "@/components/ApplicationForm";
import { StoryShare } from "@/components/StoryShare";
import { FORMATION_OPTIONS, formationLabel } from "@/lib/formationLabels";
import { DEFAULT_APPLICATION_CONFIG, type ApplicationConfig } from "@/lib/applicationConfig";

/** Public "apply to play" experience: loads the season's form configuration,
 * shows the card-building form, and on success hands the applicant their
 * private edit link. */
export function RegistrationForm() {
  const [checking, setChecking] = useState(true);
  const [open, setOpen] = useState(false);
  const [seasonName, setSeasonName] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<string | null>(null);
  const [formation, setFormation] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [cap, setCap] = useState<number | null>(null);
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
        setFormation(body.formation ?? null);
        setFull(!!body.full);
        setCap(body.cap ?? null);
        if (body.config) setConfig(body.config);
        setChecking(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  if (checking) return <p className="text-muted-foreground">Loading…</p>;

  if (full) {
    return (
      <div className="rounded-3xl border border-line bg-surface p-8 text-center" data-testid="applications-full">
        <p className="text-4xl" aria-hidden>
          🎟️
        </p>
        <h1 className="mt-3 text-xl font-bold">Applications are full</h1>
        <p className="mt-1 text-muted-foreground">
          {seasonName ?? "This season"} has reached its limit{cap ? ` of ${cap} applications` : ""}. Follow the BFL group for updates — if a place opens up, the form will reopen.
        </p>
      </div>
    );
  }

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
        {story ? (
          <StoryShare image={story} name={sharedName} seasonName={seasonName ?? ""} />
        ) : (
          <p className="rounded-2xl border border-line bg-surface p-4 text-center text-sm text-muted-foreground">
            Your application is in. We couldn&rsquo;t prepare your share image just now — once you&rsquo;re approved, your card will be on the Cards page, where you can download it.
          </p>
        )}
        <section className="rounded-2xl border border-line bg-surface p-5 text-sm">
          <h2 className="mb-3 text-base font-bold">What happens next</h2>
          <ol className="space-y-3">
            <li>
              <b>1.</b> Save the edit link for later, and feel free to share your player card.
            </li>
            <li>
              <b>2.</b> The organizer will review and approve your application.
            </li>
            <li>
              <b>3.</b> Teams will be formed based on the formation system for this season:
              {formation && formation !== "UNDECIDED" ? (
                <span className="mt-1 block rounded-lg bg-pitch/10 px-3 py-2 font-medium">{formationLabel(formation)} — {FORMATION_OPTIONS.find((o) => o.key === formation)?.blurb}</span>
              ) : (
                <>
                  <span className="mt-1 block text-muted-foreground">The organizers choose once applications close. The options are:</span>
                  <ul className="mt-1 space-y-0.5 pl-4">
                    {FORMATION_OPTIONS.map((o) => (
                      <li key={o.key} className="list-disc">
                        <b>{o.label}</b> — {o.blurb}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </li>
            <li>
              <b>4.</b> You will be notified about the updates in the BFL group.
            </li>
          </ol>
        </section>
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
        {deadline && <Deadline deadline={deadline} />}
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

/** The closing date, loud on purpose: a gold banner with the date and how long is left. */
function Deadline({ deadline }: { deadline: string }) {
  const [now] = useState(() => Date.now());
  const date = new Date(deadline);
  const ms = date.getTime() - now;
  const days = Math.ceil(ms / 86_400_000);
  const left = ms <= 0 ? "closing now" : days <= 1 ? "closes within a day" : `${days} days left`;
  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl bg-amber-300 px-5 py-3 text-[#3a0b14] shadow-md" data-testid="deadline">
      <span className="text-2xl" aria-hidden>
        ⏰
      </span>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] opacity-80">Apply before</p>
        <p className="text-xl font-black leading-tight sm:text-2xl">{date.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</p>
      </div>
      <span className="ml-auto rounded-full bg-[#3a0b14] px-3 py-1 text-xs font-bold text-amber-200">{left}</span>
    </div>
  );
}
