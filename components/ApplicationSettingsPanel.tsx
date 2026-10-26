"use client";

import { useEffect, useState } from "react";
import {
  FIELD_LABELS,
  MAX_QUESTIONS,
  type ApplicationConfig,
  type FieldKey,
  type Question,
} from "@/lib/applicationConfig";

const FIELD_ORDER: FieldKey[] = ["studentId", "affiliation", "position", "contact", "photo"];

/** Organiser control over what the public apply form asks for. */
export function ApplicationSettingsPanel() {
  const [loading, setLoading] = useState(true);
  const [seasonName, setSeasonName] = useState<string | null>(null);
  const [config, setConfig] = useState<ApplicationConfig | null>(null);
  const [deadline, setDeadline] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let ignore = false;
    (async () => {
      const res = await fetch("/api/admin/season/application");
      const body = await res.json();
      if (ignore) return;
      setSeasonName(body.season?.name ?? null);
      if (body.config) setConfig(body.config);
      setDeadline(body.deadline ? toLocalInput(body.deadline) : "");
      setLoading(false);
    })();
    return () => {
      ignore = true;
    };
  }, []);

  if (loading) return <p className="text-muted-foreground">Loading…</p>;
  if (!config) return <p className="text-muted-foreground">No active season — open one first.</p>;

  function setRule(key: FieldKey, patch: Partial<{ enabled: boolean; required: boolean }>) {
    setConfig((c) => {
      if (!c) return c;
      const next = { ...c.fields[key], ...patch };
      if (!next.enabled) next.required = false;
      return { ...c, fields: { ...c.fields, [key]: next } };
    });
  }
  function setQuestion(i: number, patch: Partial<Question>) {
    setConfig((c) => (c ? { ...c, questions: c.questions.map((q, idx) => (idx === i ? { ...q, ...patch } : q)) } : c));
  }
  function addQuestion() {
    setConfig((c) =>
      c
        ? {
            ...c,
            questions: [...c.questions, { id: `q${Date.now().toString(36).slice(-5)}`, label: "", kind: "text", required: false }],
          }
        : c,
    );
  }

  async function save() {
    if (!config) return;
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/admin/season/application", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config, deadline: deadline ? new Date(deadline).toISOString() : null }),
    });
    setSaving(false);
    const body = await res.json().catch(() => ({}));
    setMessage(res.ok ? { ok: true, text: "Saved. The public form now follows these settings." } : { ok: false, text: body.error ?? "Could not save" });
  }

  const input = "rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch";

  return (
    <section className="mb-10 space-y-5 rounded-2xl border border-line bg-surface p-5">
      <div>
        <h2 className="text-lg font-bold">Application form</h2>
        <p className="text-sm text-muted-foreground">
          What players are asked when they apply to {seasonName}. Name is always asked.
        </p>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-muted-foreground">
            <th className="py-1">Field</th>
            <th className="py-1">Ask it</th>
            <th className="py-1">Required</th>
          </tr>
        </thead>
        <tbody>
          {FIELD_ORDER.map((key) => (
            <tr key={key} className="border-t border-line">
              <td className="py-2">{FIELD_LABELS[key]}</td>
              <td>
                <input type="checkbox" aria-label={`Ask ${FIELD_LABELS[key]}`} checked={config.fields[key].enabled} onChange={(e) => setRule(key, { enabled: e.target.checked })} />
              </td>
              <td>
                <input
                  type="checkbox"
                  aria-label={`${FIELD_LABELS[key]} required`}
                  checked={config.fields[key].required}
                  disabled={!config.fields[key].enabled}
                  onChange={(e) => setRule(key, { required: e.target.checked })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {config.fields.affiliation.enabled && (
        <div className="grid gap-3 rounded-lg border border-line p-3 md:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-bold">Affiliation is a…</span>
            <select value={config.affiliationKind} onChange={(e) => setConfig({ ...config, affiliationKind: e.target.value as "text" | "batch" })} aria-label="Affiliation kind" className={input + " w-full"}>
              <option value="batch">Batch — Fall/Spring + year (semester worked out automatically)</option>
              <option value="text">Free text</option>
            </select>
          </label>
          {config.affiliationKind === "batch" && (
            <label className="block text-sm">
              <span className="mb-1 block font-bold">A batch label means…</span>
              <select value={config.batchMeaning} onChange={(e) => setConfig({ ...config, batchMeaning: e.target.value as "entry" | "graduation" })} aria-label="Batch meaning" className={input + " w-full"}>
                <option value="graduation">The term the batch graduates (Spring 27 = graduates March 2027, in its 8th semester now if it is Fall 2026)</option>
                <option value="entry">The term the batch started (Fall 25 = entered Fall 2025)</option>
              </select>
            </label>
          )}
          <p className="text-xs text-muted-foreground md:col-span-2">
            Terms follow the campus calendar (Spring starts in April, Fall in October). A batch becomes alumni after 8 semesters (4 years).
          </p>
        </div>
      )}

      <div className="space-y-3">
        <h3 className="font-bold">Custom questions</h3>
        {config.questions.map((q, i) => (
          <div key={q.id} className="flex flex-wrap items-start gap-2 rounded-lg border border-line p-3">
            <input value={q.label} onChange={(e) => setQuestion(i, { label: e.target.value })} placeholder="Question" aria-label="Question text" className={input + " min-w-48 flex-1"} />
            <select value={q.kind} onChange={(e) => setQuestion(i, { kind: e.target.value as Question["kind"], options: e.target.value === "choice" ? (q.options ?? ["", ""]) : undefined })} aria-label="Answer type" className={input}>
              <option value="text">Short answer</option>
              <option value="choice">Choose one</option>
            </select>
            {q.kind === "choice" && (
              <input
                value={(q.options ?? []).join(", ")}
                onChange={(e) => setQuestion(i, { options: e.target.value.split(",").map((o) => o.trim()) })}
                placeholder="Options, comma separated"
                aria-label="Options"
                className={input + " min-w-48 flex-1"}
              />
            )}
            <label className="flex items-center gap-1 pt-2 text-xs">
              <input type="checkbox" checked={q.required} onChange={(e) => setQuestion(i, { required: e.target.checked })} /> required
            </label>
            <button type="button" onClick={() => setConfig((c) => (c ? { ...c, questions: c.questions.filter((_, idx) => idx !== i) } : c))} className="pt-2 text-xs text-live">
              Remove
            </button>
          </div>
        ))}
        {config.questions.length < MAX_QUESTIONS && (
          <button type="button" onClick={addQuestion} className="text-sm font-medium text-pitch">
            + Add a question
          </button>
        )}
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-bold">Intro text (optional)</span>
        <textarea value={config.intro} onChange={(e) => setConfig({ ...config, intro: e.target.value })} rows={2} maxLength={600} className={input + " w-full"} />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-bold">Applications close (optional)</span>
        <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={input} />
        <span className="mt-1 block text-xs text-muted-foreground">After this time the form closes by itself, even if registration is switched on.</span>
      </label>

      {message && <p className={"text-sm " + (message.ok ? "text-pitch" : "text-live")}>{message.text}</p>}
      <button onClick={save} disabled={saving} className="rounded-full bg-pitch px-5 py-2 text-sm font-bold text-white disabled:opacity-60">
        {saving ? "Saving…" : "Save form settings"}
      </button>
    </section>
  );
}

/** ISO instant -> the value a datetime-local input expects (local time). */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
