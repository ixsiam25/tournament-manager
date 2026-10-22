"use client";

import { useCallback, useEffect, useState } from "react";
import { usePasswordConfirm } from "@/components/PasswordConfirm";

type Person = {
  id: string;
  name: string;
  studentIds: string[];
  appearances: { season: string; team: string | null }[];
};

/** Organiser tool for the cross-season identity: search, add a student ID
 * (the manual linking step for past seasons), rename, and merge duplicates. */
export function PeoplePanel() {
  const [people, setPeople] = useState<Person[]>([]);
  const [q, setQ] = useState("");
  const [unlinkedOnly, setUnlinkedOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<string[]>([]);
  const { confirmWithPassword, modal } = usePasswordConfirm();

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (unlinkedOnly) params.set("unlinked", "1");
    const res = await fetch(`/api/admin/people?${params}`);
    const body = await res.json();
    setPeople(body.people ?? []);
    setLoading(false);
  }, [q, unlinkedOnly]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function saveStudentId(id: string) {
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/admin/people/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId: drafts[id] }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Could not save");
      return;
    }
    setDrafts((d) => ({ ...d, [id]: "" }));
    setNotice("Student ID saved.");
    load();
  }

  async function merge(keepId: string, dropId: string) {
    const keep = people.find((p) => p.id === keepId);
    const drop = people.find((p) => p.id === dropId);
    const ok = await confirmWithPassword(
      `Merge "${drop?.name}" into "${keep?.name}"? Their seasons and student IDs move to "${keep?.name}" and "${drop?.name}" is deleted. This cannot be undone.`,
    );
    if (!ok) return;
    setError(null);
    const res = await fetch("/api/admin/people/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keepId, dropId }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Merge failed");
      return;
    }
    setPicked([]);
    setNotice(`Merged. Moved ${body.moved?.players ?? 0} roster slot(s).`);
    load();
  }

  const [a, b] = picked;

  return (
    <div className="space-y-4">
      {modal}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or student ID"
          className="w-64 rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={unlinkedOnly} onChange={(e) => setUnlinkedOnly(e.target.checked)} />
          Only people without a student ID
        </label>
      </div>

      {error && <p className="text-sm text-live">{error}</p>}
      {notice && <p className="text-sm text-pitch">{notice}</p>}

      {picked.length === 2 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-sm">
          <span>Merge the two selected people:</span>
          <button onClick={() => merge(a, b)} className="rounded-full bg-pitch px-3 py-1 text-xs font-bold text-white">
            Keep {people.find((p) => p.id === a)?.name}
          </button>
          <button onClick={() => merge(b, a)} className="rounded-full bg-pitch px-3 py-1 text-xs font-bold text-white">
            Keep {people.find((p) => p.id === b)?.name}
          </button>
          <button onClick={() => setPicked([])} className="text-xs text-muted-foreground underline">
            clear
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : people.length === 0 ? (
        <p className="text-muted-foreground">No one matches.</p>
      ) : (
        <ul className="divide-y divide-line rounded-block-lg border border-line bg-surface">
          {people.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <input
                type="checkbox"
                aria-label={`Select ${p.name} for merge`}
                checked={picked.includes(p.id)}
                disabled={!picked.includes(p.id) && picked.length >= 2}
                onChange={(e) => setPicked((prev) => (e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)))}
              />
              <div className="min-w-0 flex-1">
                <div className="font-bold">{p.name}</div>
                <div className="text-xs text-muted-foreground">
                  {p.appearances.length === 0
                    ? "No roster appearances"
                    : p.appearances.map((a) => `${a.season}${a.team ? ` · ${a.team}` : ""}`).join("  |  ")}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {p.studentIds.map((s) => (
                  <span key={s} className="rounded-full bg-line px-2 py-0.5 font-mono text-xs">
                    {s}
                  </span>
                ))}
                <input
                  value={drafts[p.id] ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                  placeholder={p.studentIds.length ? "add another ID" : "student ID"}
                  className="w-32 rounded-lg border border-line bg-background px-2 py-1 text-xs outline-none focus:border-pitch"
                />
                <button
                  onClick={() => saveStudentId(p.id)}
                  disabled={!drafts[p.id]?.trim()}
                  className="rounded-full bg-pitch px-3 py-1 text-xs font-bold text-white disabled:opacity-40"
                >
                  Save
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
