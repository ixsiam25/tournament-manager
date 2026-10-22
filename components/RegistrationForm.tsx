"use client";

import { useEffect, useState } from "react";
import { ApplicationForm } from "@/components/ApplicationForm";
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
      <p className="rounded-block-lg border border-line bg-surface p-5 text-muted-foreground">
        Registration isn&apos;t open right now{seasonName ? ` for ${seasonName}` : ""}. Check back later.
      </p>
    );
  }

  if (editLink) {
    return (
      <div className="max-w-xl space-y-4 rounded-block-lg border-2 border-pitch bg-pitch/10 p-5 text-pitch-dark">
        <p className="font-bold">Thanks — your application has been submitted for review.</p>
        <p className="text-sm">
          Save this private link. It&rsquo;s the only way to fix your details or photo until the organisers review your
          application — it won&rsquo;t be shown again.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input readOnly value={editLink} aria-label="Your private edit link" className="min-w-0 flex-1 rounded-lg border border-line bg-background px-3 py-2 text-xs" />
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard?.writeText(editLink).catch(() => {});
              setCopied(true);
            }}
            className="rounded-full bg-pitch px-4 py-2 text-xs font-bold text-white"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {deadline && (
        <p className="mb-4 text-sm text-muted-foreground">
          Applications close {new Date(deadline).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}.
        </p>
      )}
      <ApplicationForm
        config={config}
        seasonName={seasonName ?? ""}
        mode="create"
        submitLabel="Submit application"
        onSubmit={async (fd) => {
          const res = await fetch("/api/register", { method: "POST", body: fd });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) return body.error ?? "Failed to submit";
          setEditLink(`${window.location.origin}/register/edit/${body.editToken}`);
          return null;
        }}
      />
    </div>
  );
}
