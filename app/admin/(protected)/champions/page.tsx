"use client";

import { useEffect, useState } from "react";

type Prediction = {
  id: string;
  voterName: string | null;
  voterSemester: string | null;
  createdAt: string;
  updatedAt: string;
  team: { id: string; name: string };
};

type Settings = { enabled: boolean; closeAt: string | null };

export default function ChampionsAdminPage() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  // Snapshotted once per fetch (not called during render) so the "is it past
  // the schedule" check stays a pure function of state, per the rules of React.
  const [loadedAt, setLoadedAt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [closeAtInput, setCloseAtInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/champion-predictions");
    const body = await res.json();
    setPredictions(body.predictions ?? []);
    setSettings(body.settings ?? null);
    setCloseAtInput(body.settings?.closeAt ? body.settings.closeAt.slice(0, 16) : "");
    setLoadedAt(Date.now());
    setLoading(false);
  }

  useEffect(() => {
    let ignore = false;
    (async () => {
      const res = await fetch("/api/admin/champion-predictions");
      const body = await res.json();
      if (!ignore) {
        setPredictions(body.predictions ?? []);
        setSettings(body.settings ?? null);
        setCloseAtInput(body.settings?.closeAt ? body.settings.closeAt.slice(0, 16) : "");
        setLoadedAt(Date.now());
        setLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  async function patchSettings(patch: { enabled?: boolean; closeAt?: string | null }) {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/champion-predictions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to save");
      return;
    }
    load();
  }

  function handleSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!closeAtInput) return;
    patchSettings({ closeAt: new Date(closeAtInput).toISOString() });
  }

  const counts = new Map<string, { name: string; count: number }>();
  for (const p of predictions) {
    const entry = counts.get(p.team.id) ?? { name: p.team.name, count: 0 };
    entry.count++;
    counts.set(p.team.id, entry);
  }
  const tally = [...counts.values()].sort((a, b) => b.count - a.count);

  const scheduledPast = settings?.closeAt ? new Date(settings.closeAt).getTime() <= loadedAt : false;
  const isOpen = !!settings?.enabled && !scheduledPast;

  return (
    <div>
      <h1 className="mb-6 heading-display text-2xl">Champions Predictions</h1>

      <div className="mb-6 space-y-4 rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span
              className={
                "rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wide " +
                (isOpen ? "bg-pitch/10 text-pitch-dark" : "bg-live/10 text-live")
              }
            >
              {isOpen ? "Open" : "Closed"}
            </span>
            {!settings?.enabled && (
              <span className="ml-2 text-xs text-muted">turned off manually</span>
            )}
            {settings?.enabled && scheduledPast && (
              <span className="ml-2 text-xs text-muted">
                auto-closed at {new Date(settings.closeAt!).toLocaleString()}
              </span>
            )}
            {settings?.enabled && settings.closeAt && !scheduledPast && (
              <span className="ml-2 text-xs text-muted">
                will auto-close at {new Date(settings.closeAt).toLocaleString()}
              </span>
            )}
          </div>
          <button
            onClick={() => patchSettings({ enabled: !settings?.enabled })}
            disabled={saving || !settings}
            className={
              "rounded-full px-5 py-2 text-sm font-bold text-white disabled:opacity-40 " +
              (settings?.enabled ? "bg-live" : "bg-pitch")
            }
          >
            {settings?.enabled ? "Turn off" : "Turn on"}
          </button>
        </div>

        <form onSubmit={handleSchedule} className="flex flex-wrap items-end gap-3 border-t border-line pt-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Schedule auto-close</span>
            <input
              type="datetime-local"
              value={closeAtInput}
              onChange={(e) => setCloseAtInput(e.target.value)}
              className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
            />
          </label>
          <button
            type="submit"
            disabled={saving || !closeAtInput}
            className="rounded-full border border-line px-4 py-2 text-sm font-bold disabled:opacity-40"
          >
            Schedule
          </button>
          {settings?.closeAt && (
            <button
              type="button"
              onClick={() => {
                setCloseAtInput("");
                patchSettings({ closeAt: null });
              }}
              disabled={saving}
              className="rounded-full border border-line px-4 py-2 text-sm font-medium text-muted disabled:opacity-40"
            >
              Clear schedule
            </button>
          )}
        </form>
        {error && <p className="text-sm text-live">{error}</p>}
      </div>

      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <>
          {tally.length > 0 && (
            <div className="mb-6 rounded-2xl border border-line bg-surface p-4">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
                {predictions.length} prediction{predictions.length === 1 ? "" : "s"}
              </h2>
              <div className="space-y-1.5">
                {tally.map((t) => (
                  <div key={t.name} className="flex items-center justify-between text-sm">
                    <span className="font-medium">{t.name}</span>
                    <span className="tabular-nums text-muted">{t.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {predictions.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <span className="font-medium">{p.voterName || "Anonymous"}</span>
                  {p.voterSemester && <span className="ml-2 text-xs text-muted">{p.voterSemester}</span>}
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="font-medium">{p.team.name}</span>
                  <span className="text-xs text-muted">{new Date(p.createdAt).toLocaleString()}</span>
                </div>
              </li>
            ))}
            {predictions.length === 0 && (
              <li className="px-5 py-6 text-center text-muted">No predictions yet.</li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}
