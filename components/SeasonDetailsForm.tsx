"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TimeInput } from "@/components/TimeInput";

type Pitch = { name: string; availabilityStart: string; availabilityEnd: string };
type Details = {
  number: number;
  slug: string;
  name: string;
  year: number;
  targetTeamCount: number | null;
  squadSizeMin: number;
  squadSizeMax: number;
  registrationSelfServeEnabled: boolean;
  registrationExcelImportEnabled: boolean;
  formatConfig: {
    matchFormat: string;
    knockoutStructure: string;
    matchDurationMinutes: number;
    bufferMinutes: number;
    dayStartTime: string;
    pitches: { name: string; availabilityStart?: string | null; availabilityEnd?: string | null }[];
  };
};

const input = "w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch";

/** Edit the open season's settings after creation (formation lives on its own page). */
export function SeasonDetailsForm() {
  const [d, setD] = useState<Details | null>(null);
  const [none, setNone] = useState(false);
  const [pitches, setPitches] = useState<Pitch[]>([]);
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      const body = await (await fetch("/api/admin/season/details")).json();
      if (!body.season) return setNone(true);
      setD(body.season);
      setTarget(body.season.targetTeamCount?.toString() ?? "");
      setPitches(body.season.formatConfig.pitches.map((p: Pitch) => ({ name: p.name, availabilityStart: p.availabilityStart ?? "", availabilityEnd: p.availabilityEnd ?? "" })));
    })();
  }, []);

  if (none) return <p className="rounded-lg border border-line bg-surface p-5 text-sm">There is no open season to edit. Archived seasons are read-only. <Link href="/admin/season" className="font-bold text-pitch underline">Back to Season setup</Link></p>;
  if (!d) return <p className="text-muted-foreground">Loading…</p>;
  const set = (patch: Partial<Details>) => setD((cur) => (cur ? { ...cur, ...patch } : cur));
  const setFmt = (patch: Partial<Details["formatConfig"]>) => setD((cur) => (cur ? { ...cur, formatConfig: { ...cur.formatConfig, ...patch } } : cur));
  const setPitch = (i: number, patch: Partial<Pitch>) => setPitches((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!d) return;
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/admin/season/details", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: d.name,
        year: d.year,
        targetTeamCount: target ? Number(target) : null,
        squadSizeMin: d.squadSizeMin,
        squadSizeMax: d.squadSizeMax,
        registrationSelfServeEnabled: d.registrationSelfServeEnabled,
        registrationExcelImportEnabled: d.registrationExcelImportEnabled,
        formatConfig: { ...d.formatConfig, pitches: pitches.map((p) => ({ name: p.name, availabilityStart: p.availabilityStart || null, availabilityEnd: p.availabilityEnd || null })) },
      }),
    });
    setSaving(false);
    setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: (await res.json().catch(() => ({}))).error ?? "Couldn't save" });
  }

  return (
    <form onSubmit={save} className="space-y-6" data-testid="season-details">
      <section className="rounded-2xl border border-line bg-surface p-6">
        <h2 className="mb-4 font-bold">Basics</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Name" className="col-span-2"><input className={input} value={d.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Year"><input type="number" className={input} value={d.year} onChange={(e) => set({ year: Number(e.target.value) })} /></Field>
          <Field label="Target team count (soft)"><input type="number" className={input} value={target} placeholder="optional" onChange={(e) => setTarget(e.target.value)} /></Field>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Season number ({d.number}) and web address (/{d.slug}) are fixed once created. Team formation is changed on the <Link href="/admin/formation" className="underline">formation page</Link>.</p>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-6">
        <h2 className="mb-4 font-bold">Squad size</h2>
        <div className="grid grid-cols-2 gap-3 sm:w-1/2">
          <Field label="Min per team"><input type="number" className={input} value={d.squadSizeMin} onChange={(e) => set({ squadSizeMin: Number(e.target.value) })} /></Field>
          <Field label="Max per team"><input type="number" className={input} value={d.squadSizeMax} onChange={(e) => set({ squadSizeMax: Number(e.target.value) })} /></Field>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-6">
        <h2 className="mb-1 font-bold">Match format</h2>
        <p className="mb-4 text-xs text-muted-foreground">Used when fixtures are generated; matches already scheduled aren&apos;t moved.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Format" className="col-span-2">
            <select className={input} value={d.formatConfig.matchFormat} onChange={(e) => setFmt({ matchFormat: e.target.value })}>
              <option value="SINGLE_ROUND_ROBIN">Single round robin</option>
              <option value="DOUBLE_ROUND_ROBIN">Double round robin</option>
              <option value="GROUPS_KNOCKOUT">Groups + knockout</option>
            </select>
          </Field>
          <Field label="Knockout" className="col-span-2">
            <select className={input} value={d.formatConfig.knockoutStructure} onChange={(e) => setFmt({ knockoutStructure: e.target.value })}>
              <option value="NONE">None</option>
              <option value="SEMIS_FINAL">Semis + final</option>
              <option value="QUARTERS_SEMIS_FINAL">Quarters + semis + final</option>
            </select>
          </Field>
          <Field label="Match duration (min)"><input type="number" className={input} value={d.formatConfig.matchDurationMinutes} onChange={(e) => setFmt({ matchDurationMinutes: Number(e.target.value) })} /></Field>
          <Field label="Buffer (min)"><input type="number" className={input} value={d.formatConfig.bufferMinutes} onChange={(e) => setFmt({ bufferMinutes: Number(e.target.value) })} /></Field>
          <Field label="Day start time"><TimeInput className={input} value={d.formatConfig.dayStartTime} onChange={(v) => setFmt({ dayStartTime: v })} /></Field>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-6">
        <h2 className="mb-1 font-bold">Pitches</h2>
        <p className="mb-4 text-xs text-muted-foreground">Type times like 17:00 (or 5pm). Leave start/end blank for an all-day pitch.</p>
        <div className="space-y-3">
          {pitches.map((p, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <Field label="Name"><input className={input + " w-32"} value={p.name} onChange={(e) => setPitch(i, { name: e.target.value })} /></Field>
              <Field label="Available from"><TimeInput className={input} placeholder="all day" value={p.availabilityStart} onChange={(v) => setPitch(i, { availabilityStart: v })} /></Field>
              <Field label="Until"><TimeInput className={input} placeholder="all day" value={p.availabilityEnd} onChange={(v) => setPitch(i, { availabilityEnd: v })} /></Field>
              {pitches.length > 1 && <button type="button" onClick={() => setPitches((prev) => prev.filter((_, idx) => idx !== i))} className="rounded-full border border-line px-3 py-2 text-xs font-medium text-muted-foreground">Remove</button>}
            </div>
          ))}
          <button type="button" onClick={() => setPitches((prev) => [...prev, { name: "", availabilityStart: "", availabilityEnd: "" }])} className="rounded-full border border-line px-4 py-1.5 text-xs font-bold">+ Add pitch</button>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-6">
        <h2 className="mb-4 font-bold">Registration channels</h2>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={d.registrationSelfServeEnabled} onChange={(e) => set({ registrationSelfServeEnabled: e.target.checked })} />Public self-serve form (/register)</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={d.registrationExcelImportEnabled} onChange={(e) => set({ registrationExcelImportEnabled: e.target.checked })} />Excel bulk import</label>
          <p className="text-xs text-muted-foreground">Opening/closing registration is on Season setup.</p>
        </div>
      </section>

      <div className="flex items-center gap-4">
        <button type="submit" disabled={saving} className="rounded-full bg-pitch px-6 py-3 text-sm font-bold text-white disabled:opacity-40">{saving ? "Saving…" : "Save changes"}</button>
        {msg && <span className={"text-sm " + (msg.ok ? "text-pitch" : "text-live")} role="status">{msg.text}</span>}
        <Link href="/admin/season" className="text-sm text-muted-foreground underline">Back to Season setup</Link>
      </div>
    </form>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={"block " + (className ?? "")}>
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
