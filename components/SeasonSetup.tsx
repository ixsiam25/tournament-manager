"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { SetupStep } from "@/lib/seasonProgress";
import { ApplicationLinkCard } from "@/components/ApplicationLinkCard";

type Overview = { season: { id: string; name: string; status: string; registrationOpen: boolean; registrationSelfServeEnabled: boolean; applicationDeadline: string | null } | null; steps: SetupStep[] };

/** The season's checklist: where it is now and the next thing to do. */
export function SeasonSetup() {
  const [data, setData] = useState<Overview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the query string is only readable in the browser
    setJustCreated(new URLSearchParams(window.location.search).get("created") === "1");
  }, []);

  const load = useCallback(async () => {
    setData(await (await fetch("/api/admin/season/overview")).json());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    load();
  }, [load]);

  async function run(action: "openRegistration" | "closeRegistration") {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/season/active", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registrationOpen: action === "openRegistration" }),
    });
    setBusy(false);
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "That didn't work");
    await load();
  }

  if (!data) return <p className="text-muted-foreground">Loading…</p>;
  if (!data.season)
    return (
      <p className="rounded-lg border border-line bg-surface p-5">
        There&apos;s no season yet. <Link href="/admin/season/rollover" className="font-bold text-pitch underline">Create the first one</Link>.
      </p>
    );

  if (data.season.status === "ARCHIVED")
    return (
      <div className="space-y-4" data-testid="season-archived">
        <div className="rounded-2xl border border-pitch bg-pitch/5 p-5 ring-2 ring-pitch/20">
          <p className="text-lg font-bold">
            {data.season.name} <span className="ml-2 rounded-full bg-line px-2 py-0.5 text-[10px] uppercase">archived</span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">This season is finished and kept as a read-only record. Start the next one when you&apos;re ready.</p>
          <Link href="/admin/season/rollover" className="mt-4 inline-block rounded-full bg-pitch px-5 py-2 text-sm font-bold text-white">
            Create a new season
          </Link>
        </div>
      </div>
    );

  return (
    <div className="space-y-4">
      <p className="text-lg font-bold">
        {data.season.name} <span className="ml-2 rounded-full bg-line px-2 py-0.5 text-[10px] uppercase">{data.season.status.toLowerCase()}</span>
      </p>
      {error && <p className="text-sm text-live">{error}</p>}
      {justCreated && <p className="rounded-xl bg-pitch px-4 py-3 text-sm font-bold text-white" role="status">✓ {data.season.name} is created.{data.season.registrationOpen ? " Applications are open — share the link below." : " Open applications below when you are ready."}</p>}
      {data.season.registrationOpen && data.season.registrationSelfServeEnabled && <ApplicationLinkCard deadline={data.season.applicationDeadline} />}
      <p className="flex gap-4 text-sm">
        <Link href="/admin/season/details" className="font-medium text-pitch underline">Edit season details</Link>
        <Link href="/admin/season/rollover" className="font-medium text-pitch underline">Create a new season</Link>
      </p>
      <ol className="space-y-3">
        {data.steps.map((s, i) => (
          <li
            key={s.key}
            data-step={s.key}
            data-status={s.status}
            className={
              "rounded-2xl border p-4 " +
              (s.status === "current" ? "border-pitch bg-pitch/5 ring-2 ring-pitch/20" : s.status === "done" ? "border-line bg-surface opacity-80" : "border-line bg-surface")
            }
          >
            <div className="flex items-start gap-3">
              <span
                className={
                  "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-black " +
                  (s.status === "done" ? "bg-pitch text-white" : s.status === "current" ? "border-2 border-pitch text-pitch" : "border border-line text-muted-foreground")
                }
                aria-label={s.status}
              >
                {s.status === "done" ? "✓" : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-bold">{s.title}</h2>
                <p className="text-sm text-muted-foreground">{s.detail}</p>
                {s.actions.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {s.actions.map((a) =>
                      a.href ? (
                        <Link key={a.label} href={a.href} className={a.primary ? "rounded-full bg-pitch px-4 py-1.5 text-sm font-bold text-white" : "text-sm font-medium text-pitch underline"}>
                          {a.label}
                        </Link>
                      ) : (
                        <button
                          key={a.label}
                          disabled={busy}
                          onClick={() => run(a.action!)}
                          className={a.primary ? "rounded-full bg-pitch px-4 py-1.5 text-sm font-bold text-white disabled:opacity-40" : "text-sm font-medium text-pitch underline disabled:opacity-40"}
                        >
                          {a.label}
                        </button>
                      ),
                    )}
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
