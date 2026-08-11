"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePasswordConfirm } from "@/components/PasswordConfirm";

type Status = {
  activeSeason: { id: string; number: number; name: string } | null;
  preflight: { ok: boolean; liveMatchCount: number; unfinishedMatchCount: number; unresolvedDrawCount: number } | null;
  nextSeasonNumber: number;
};

type Pitch = { name: string; availabilityStart: string; availabilityEnd: string };

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * ADMIN-only wizard: freeze the current active season (if any), then open
 * the next one via the format questionnaire. Wiping live tables is only
 * ever possible *after* a season has been archived — see
 * `lib/seasonRollover.ts`.
 */
export function SeasonRolloverWizard() {
  const router = useRouter();
  const { confirmWithPassword, modal } = usePasswordConfirm();

  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [freezing, setFreezing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [number, setNumber] = useState(1);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [teamFormation, setTeamFormation] = useState<"BATCH" | "AUCTION">("BATCH");
  const [targetTeamCount, setTargetTeamCount] = useState("");
  const [squadSizeMin, setSquadSizeMin] = useState(6);
  const [squadSizeMax, setSquadSizeMax] = useState(8);
  const [matchFormat, setMatchFormat] = useState<"SINGLE_ROUND_ROBIN" | "DOUBLE_ROUND_ROBIN" | "GROUPS_KNOCKOUT">(
    "SINGLE_ROUND_ROBIN",
  );
  const [knockoutStructure, setKnockoutStructure] = useState<"NONE" | "SEMIS_FINAL" | "QUARTERS_SEMIS_FINAL">(
    "SEMIS_FINAL",
  );
  const [matchDurationMinutes, setMatchDurationMinutes] = useState(7);
  const [bufferMinutes, setBufferMinutes] = useState(3);
  const [dayStartTime, setDayStartTime] = useState("17:00");
  const [pitches, setPitches] = useState<Pitch[]>([{ name: "Field 1", availabilityStart: "", availabilityEnd: "" }]);
  const [registrationSelfServeEnabled, setRegistrationSelfServeEnabled] = useState(true);
  const [registrationExcelImportEnabled, setRegistrationExcelImportEnabled] = useState(true);
  const [opening, setOpening] = useState(false);

  async function loadStatus() {
    const res = await fetch("/api/admin/season/rollover/status");
    const body: Status = await res.json();
    setStatus(body);
    setNumber(body.nextSeasonNumber);
    setLoading(false);
  }

  useEffect(() => {
    let ignore = false;
    (async () => {
      const res = await fetch("/api/admin/season/rollover/status");
      const body: Status = await res.json();
      if (!ignore) {
        setStatus(body);
        setNumber(body.nextSeasonNumber);
        setLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  // Auto-fill the slug from the name until the admin edits it directly —
  // derived during render (React's own recommended pattern for "reset
  // state when a value changes") rather than in an effect, which would
  // call setState synchronously in the effect body.
  const [prevName, setPrevName] = useState(name);
  if (name !== prevName) {
    setPrevName(name);
    if (!slugTouched) setSlug(slugify(name));
  }

  async function handleFreeze() {
    const confirmed = await confirmWithPassword(
      `Freeze "${status?.activeSeason?.name}"? This locks in the final results permanently — the next step (opening a new season) will then wipe live teams/players/fixtures.`,
    );
    if (!confirmed) return;
    setFreezing(true);
    setError(null);
    const res = await fetch("/api/admin/season/rollover/freeze", { method: "POST" });
    setFreezing(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to freeze season");
      return;
    }
    loadStatus();
  }

  function addPitch() {
    setPitches((prev) => [...prev, { name: "", availabilityStart: "", availabilityEnd: "" }]);
  }
  function updatePitch(i: number, patch: Partial<Pitch>) {
    setPitches((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }
  function removePitch(i: number) {
    setPitches((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleOpen(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Season name is required");
      return;
    }
    if (pitches.some((p) => !p.name.trim())) {
      setError("Every pitch needs a name");
      return;
    }
    const confirmed = await confirmWithPassword(
      `Open "${name}" as the new active season? This wipes every current team, player and fixture — only safe once the previous season is frozen.`,
    );
    if (!confirmed) return;

    setOpening(true);
    const res = await fetch("/api/admin/season/rollover/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        number,
        name,
        slug,
        year,
        teamFormation,
        targetTeamCount: targetTeamCount ? Number(targetTeamCount) : null,
        squadSizeMin,
        squadSizeMax,
        registrationSelfServeEnabled,
        registrationExcelImportEnabled,
        formatConfig: {
          matchFormat,
          knockoutStructure,
          matchDurationMinutes,
          bufferMinutes,
          dayStartTime,
          pitches: pitches.map((p) => ({
            name: p.name,
            availabilityStart: p.availabilityStart || null,
            availabilityEnd: p.availabilityEnd || null,
          })),
        },
      }),
    });
    setOpening(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to open season");
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  if (loading || !status) return <p className="text-muted">Loading…</p>;

  return (
    <div>
      {modal}
      <h1 className="mb-6 heading-display text-2xl">Season Rollover</h1>
      {error && <p className="mb-4 text-sm text-live">{error}</p>}

      {status.activeSeason ? (
        <section className="mb-8 rounded-2xl border border-line bg-surface p-6">
          <h2 className="mb-1 font-bold">Step 1 — Freeze &quot;{status.activeSeason.name}&quot;</h2>
          <p className="mb-4 text-sm text-muted">
            Locks in the final results permanently. You can&apos;t open a new season until this is done.
          </p>
          {status.preflight && !status.preflight.ok && (
            <ul className="mb-4 space-y-1 text-sm text-live">
              {status.preflight.liveMatchCount > 0 && <li>{status.preflight.liveMatchCount} match(es) still LIVE</li>}
              {status.preflight.unfinishedMatchCount > 0 && (
                <li>{status.preflight.unfinishedMatchCount} match(es) not yet FINISHED</li>
              )}
              {status.preflight.unresolvedDrawCount > 0 && (
                <li>{status.preflight.unresolvedDrawCount} knockout draw(s) not resolved</li>
              )}
            </ul>
          )}
          <button
            onClick={handleFreeze}
            disabled={freezing || !status.preflight?.ok}
            className="rounded-full bg-pitch px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            {freezing ? "Freezing…" : "Freeze season"}
          </button>
        </section>
      ) : (
        <form onSubmit={handleOpen} className="space-y-6">
          <section className="rounded-2xl border border-line bg-surface p-6">
            <h2 className="mb-4 font-bold">Season basics</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Number">
                <input
                  type="number"
                  value={number}
                  onChange={(e) => setNumber(Number(e.target.value))}
                  className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
                />
              </Field>
              <Field label="Year">
                <input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
                />
              </Field>
              <Field label="Name" className="col-span-2 sm:col-span-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. BFL Season X"
                  className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
                />
              </Field>
              <Field label="Slug" className="col-span-2 sm:col-span-2">
                <input
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value);
                    setSlugTouched(true);
                  }}
                  placeholder="e.g. x"
                  className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
                />
              </Field>
              <Field label="Team formation" className="col-span-2">
                <select
                  value={teamFormation}
                  onChange={(e) => setTeamFormation(e.target.value as "BATCH" | "AUCTION")}
                  className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
                >
                  <option value="BATCH">Batch (semester teams)</option>
                  <option value="AUCTION">Auction</option>
                </select>
              </Field>
              <Field label="Target team count (soft)">
                <input
                  type="number"
                  value={targetTeamCount}
                  onChange={(e) => setTargetTeamCount(e.target.value)}
                  placeholder="optional"
                  className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
                />
              </Field>
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-6">
            <h2 className="mb-4 font-bold">Squad size</h2>
            <div className="grid grid-cols-2 gap-3 sm:w-1/2">
              <Field label="Min per team">
                <input
                  type="number"
                  value={squadSizeMin}
                  onChange={(e) => setSquadSizeMin(Number(e.target.value))}
                  className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
                />
              </Field>
              <Field label="Max per team">
                <input
                  type="number"
                  value={squadSizeMax}
                  onChange={(e) => setSquadSizeMax(Number(e.target.value))}
                  className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
                />
              </Field>
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-6">
            <h2 className="mb-4 font-bold">Match format</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Format" className="col-span-2">
                <select
                  value={matchFormat}
                  onChange={(e) => setMatchFormat(e.target.value as typeof matchFormat)}
                  className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
                >
                  <option value="SINGLE_ROUND_ROBIN">Single round robin</option>
                  <option value="DOUBLE_ROUND_ROBIN">Double round robin</option>
                  <option value="GROUPS_KNOCKOUT">Groups + knockout</option>
                </select>
              </Field>
              <Field label="Knockout" className="col-span-2">
                <select
                  value={knockoutStructure}
                  onChange={(e) => setKnockoutStructure(e.target.value as typeof knockoutStructure)}
                  className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
                >
                  <option value="NONE">None</option>
                  <option value="SEMIS_FINAL">Semis + final</option>
                  <option value="QUARTERS_SEMIS_FINAL">Quarters + semis + final</option>
                </select>
              </Field>
              <Field label="Match duration (min)">
                <input
                  type="number"
                  value={matchDurationMinutes}
                  onChange={(e) => setMatchDurationMinutes(Number(e.target.value))}
                  className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
                />
              </Field>
              <Field label="Buffer (min)">
                <input
                  type="number"
                  value={bufferMinutes}
                  onChange={(e) => setBufferMinutes(Number(e.target.value))}
                  className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
                />
              </Field>
              <Field label="Day start time">
                <input
                  type="time"
                  value={dayStartTime}
                  onChange={(e) => setDayStartTime(e.target.value)}
                  className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
                />
              </Field>
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-6">
            <h2 className="mb-1 font-bold">Pitches</h2>
            <p className="mb-4 text-xs text-muted">Leave start/end blank for an all-day pitch.</p>
            <div className="space-y-3">
              {pitches.map((p, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2">
                  <Field label="Name">
                    <input
                      value={p.name}
                      onChange={(e) => updatePitch(i, { name: e.target.value })}
                      className="w-32 rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
                    />
                  </Field>
                  <Field label="Available from">
                    <input
                      type="time"
                      value={p.availabilityStart}
                      onChange={(e) => updatePitch(i, { availabilityStart: e.target.value })}
                      className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
                    />
                  </Field>
                  <Field label="Until">
                    <input
                      type="time"
                      value={p.availabilityEnd}
                      onChange={(e) => updatePitch(i, { availabilityEnd: e.target.value })}
                      className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
                    />
                  </Field>
                  {pitches.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePitch(i)}
                      className="rounded-full border border-line px-3 py-2 text-xs font-medium text-muted"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addPitch}
                className="rounded-full border border-line px-4 py-1.5 text-xs font-bold"
              >
                + Add pitch
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-6">
            <h2 className="mb-4 font-bold">Registration channels</h2>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={registrationSelfServeEnabled}
                  onChange={(e) => setRegistrationSelfServeEnabled(e.target.checked)}
                />
                Public self-serve form (/register)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={registrationExcelImportEnabled}
                  onChange={(e) => setRegistrationExcelImportEnabled(e.target.checked)}
                />
                Excel bulk import
              </label>
              <p className="text-xs text-muted">Admin manual add is always available regardless.</p>
            </div>
          </section>

          <button
            type="submit"
            disabled={opening}
            className="rounded-full bg-live px-6 py-3 text-sm font-bold text-white disabled:opacity-40"
          >
            {opening ? "Opening…" : "Open season (wipes live teams/players/fixtures)"}
          </button>
        </form>
      )}
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={"block " + (className ?? "")}>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}
