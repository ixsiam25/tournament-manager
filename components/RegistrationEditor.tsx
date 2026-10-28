"use client";

import { useState } from "react";
import { BatchPicker } from "@/components/BatchPicker";
import type { BatchMeaning } from "@/lib/batch";

type Reg = { id: string; name: string; studentId: string | null; affiliation: string; position: string | null; contact: string; status: string };

const INPUT = "w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch";

/** Admin overwrite of one application: fix a wrong semester/batch, name, position, contact (or the ID before approval). */
export function RegistrationEditor({ reg, batch, meaning, onDone }: { reg: Reg; batch: boolean; meaning: BatchMeaning; onDone: (saved: boolean) => void }) {
  const [name, setName] = useState(reg.name);
  const [studentId, setStudentId] = useState(reg.studentId ?? "");
  const [affiliation, setAffiliation] = useState(reg.affiliation);
  const [byBatch, setByBatch] = useState(false);
  const [position, setPosition] = useState(reg.position ?? "");
  const [contact, setContact] = useState(reg.contact);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idLocked = reg.status === "APPROVED";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/admin/registrations/${reg.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, affiliation, position: position || null, contact, studentId: studentId || null }),
    });
    setSaving(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? "Couldn't save");
    onDone(true);
  }

  return (
    <form onSubmit={save} className="space-y-3 bg-pitch/5 px-5 py-4" data-testid="registration-editor" aria-label={`Edit ${reg.name}`}>
      <p className="text-xs font-bold uppercase tracking-wide text-pitch">Edit application</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} className={INPUT} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Student ID</span>
          <input value={studentId} onChange={(e) => setStudentId(e.target.value)} disabled={idLocked} maxLength={40} className={INPUT + (idLocked ? " opacity-60" : "")} />
          {idLocked && <span className="mt-1 block text-xs text-muted-foreground">Locked after approval — it identifies the person across seasons.</span>}
        </label>
        <div className="text-sm sm:col-span-2">
          <span className="mb-1 flex items-center justify-between font-medium">
            {batch ? (byBatch ? "Batch" : "Current semester") : "Affiliation"}
            {batch && (
              <button type="button" onClick={() => setByBatch((v) => !v)} className="text-xs font-normal text-pitch underline">
                {byBatch ? "Pick by semester instead" : "Set the batch directly"}
              </button>
            )}
          </span>
          {batch ? (
            <BatchPicker key={byBatch ? "batch" : "semester"} mode={byBatch ? "term" : "semester"} value={affiliation} onChange={setAffiliation} required meaning={meaning} />
          ) : (
            <input value={affiliation} onChange={(e) => setAffiliation(e.target.value)} required maxLength={80} className={INPUT} />
          )}
          {batch && affiliation && <span className="mt-1 block text-xs text-muted-foreground">Stored as batch “{affiliation}”.</span>}
        </div>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Position</span>
          <select value={position} onChange={(e) => setPosition(e.target.value)} className={INPUT}>
            <option value="">No position</option>
            <option value="GK">GK</option>
            <option value="DEF">DEF</option>
            <option value="MID">MID</option>
            <option value="FWD">FWD</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Contact</span>
          <input value={contact} onChange={(e) => setContact(e.target.value)} required maxLength={120} className={INPUT} />
        </label>
      </div>
      {reg.status === "APPROVED" && <p className="text-xs text-muted-foreground">Teams already formed from batches are not moved — use the formation board to move this player.</p>}
      {error && <p className="text-sm text-live" role="alert">{error}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={saving || !affiliation} className="rounded-full bg-pitch px-5 py-1.5 text-sm font-bold text-white disabled:opacity-40">
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button type="button" onClick={() => onDone(false)} className="text-sm text-muted-foreground underline">
          Cancel
        </button>
      </div>
    </form>
  );
}
