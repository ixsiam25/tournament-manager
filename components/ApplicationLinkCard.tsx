"use client";

import { useEffect, useState } from "react";

/**
 * The public sign-up link, ready to copy and share. Shown wherever the
 * organiser is while applications are open, so it is never hard to find.
 */
export function ApplicationLinkCard({ deadline, headline }: { deadline?: string | null; headline?: string }) {
  const [url, setUrl] = useState("/register");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the origin is only known in the browser
    setUrl(`${window.location.origin}/register`);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* the field is selectable as a fallback */
    }
  }

  return (
    <section data-testid="application-link" className="rounded-2xl border-2 border-pitch bg-pitch/5 p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-pitch">{headline ?? "Applications are open"}</p>
      <h2 className="mt-1 text-lg font-bold">Share this link with players</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Anyone with the link can apply
        {deadline ? ` until ${new Date(deadline).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}` : ""}. It stays here until you close applications.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input readOnly value={url} aria-label="Application link" onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-lg border border-line bg-background px-3 py-2 text-sm" />
        <button type="button" onClick={copy} className="rounded-full bg-pitch px-5 py-2 text-sm font-bold text-white">
          {copied ? "Copied ✓" : "Copy link"}
        </button>
        <a href="/register" target="_blank" rel="noreferrer" className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:bg-surface">
          Preview the form ↗
        </a>
      </div>
    </section>
  );
}
