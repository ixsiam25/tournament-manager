"use client";

import { useEffect, useState } from "react";

type Level = "info" | "warn";
type Settings = { enabled: boolean; text: string; level: Level; expiresAt: string | null };

/**
 * Edits the site-wide announcement banner (`lib/settings.ts`,
 * `components/AnnouncementBanner.tsx`) — e.g. "Match 12 delayed 10 min".
 * Mirrors the champion-predictions admin panel's load/patch pattern
 * (`app/admin/(protected)/champions/page.tsx`).
 */
export function AnnouncementSettingsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [text, setText] = useState("");
  const [level, setLevel] = useState<Level>("info");
  const [expiresAtInput, setExpiresAtInput] = useState("");
  // Snapshotted once per fetch (not called during render) so the "is it
  // past expiry" check stays a pure function of state, per the rules of
  // React — same pattern as app/admin/(protected)/champions/page.tsx.
  const [loadedAt, setLoadedAt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    (async () => {
      const res = await fetch("/api/admin/announcement");
      const body = await res.json();
      if (!ignore) {
        const s: Settings = body.settings;
        setSettings(s);
        setText(s.text);
        setLevel(s.level);
        setExpiresAtInput(s.expiresAt ? s.expiresAt.slice(0, 16) : "");
        setLoadedAt(Date.now());
        setLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  async function patch(body: Partial<{ enabled: boolean; text: string; level: Level; expiresAt: string | null }>) {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/announcement", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      setError(errBody.error ?? "Failed to save");
      return;
    }
    const { settings: updated } = await res.json();
    setSettings(updated);
    setLoadedAt(Date.now());
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    patch({ text, level, expiresAt: expiresAtInput ? new Date(expiresAtInput).toISOString() : null });
  }

  if (loading || !settings) return <p className="text-muted">Loading…</p>;

  const scheduledPast = settings.expiresAt ? new Date(settings.expiresAt).getTime() <= loadedAt : false;
  const isLive = settings.enabled && !!settings.text.trim() && !scheduledPast;

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Announcement banner</h2>
            <span
              className={
                "mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wide " +
                (isLive ? "bg-pitch/10 text-pitch-dark" : "bg-line text-muted")
              }
            >
              {isLive ? "Showing on the site" : "Not showing"}
            </span>
            {settings.enabled && scheduledPast && (
              <span className="ml-2 text-xs text-muted">expired at {new Date(settings.expiresAt!).toLocaleString()}</span>
            )}
          </div>
          <button
            onClick={() => patch({ enabled: !settings.enabled })}
            disabled={saving}
            className={
              "rounded-full px-5 py-2 text-sm font-bold text-white disabled:opacity-40 " +
              (settings.enabled ? "bg-live" : "bg-pitch")
            }
          >
            {settings.enabled ? "Turn off" : "Turn on"}
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-3 border-t border-line pt-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Message</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={280}
              rows={2}
              placeholder="e.g. Match 12 delayed 10 minutes"
              className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
            />
          </label>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Style</span>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as Level)}
                className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
              >
                <option value="info">Info (neutral)</option>
                <option value="warn">Warning (highlighted)</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Auto-expires (optional)</span>
              <input
                type="datetime-local"
                value={expiresAtInput}
                onChange={(e) => setExpiresAtInput(e.target.value)}
                className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
              />
            </label>
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-pitch px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </form>
        {error && <p className="text-sm text-live">{error}</p>}
      </section>
    </div>
  );
}
