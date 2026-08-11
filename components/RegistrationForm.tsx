"use client";

import { useEffect, useState } from "react";
import { downscaleToJpeg } from "@/lib/downscaleImage";

type Position = "GK" | "DEF" | "MID" | "FWD" | "";

export function RegistrationForm() {
  const [checking, setChecking] = useState(true);
  const [open, setOpen] = useState(false);
  const [seasonName, setSeasonName] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [position, setPosition] = useState<Position>("");
  const [contact, setContact] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let ignore = false;
    (async () => {
      const res = await fetch("/api/register");
      const body = await res.json();
      if (!ignore) {
        setOpen(!!body.open);
        setSeasonName(body.seasonName);
        setChecking(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("name", name);
      formData.append("affiliation", affiliation);
      if (position) formData.append("position", position);
      formData.append("contact", contact);
      if (photo) {
        const jpeg = await downscaleToJpeg(photo, "avatar");
        formData.append("photo", jpeg, "photo.jpg");
      }
      const res = await fetch("/api/register", { method: "POST", body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to submit");
        return;
      }
      setDone(true);
    } catch {
      setError("Couldn't process that photo");
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) return <p className="text-muted">Loading…</p>;

  if (!open) {
    return (
      <p className="rounded-block-lg border-2 border-line-strong bg-surface p-5 text-muted">
        Registration isn&apos;t open right now{seasonName ? ` for ${seasonName}` : ""}. Check back later.
      </p>
    );
  }

  if (done) {
    return (
      <p className="rounded-block-lg border-2 border-pitch bg-pitch/10 p-5 text-pitch-dark">
        Thanks — your registration has been submitted for review.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <Field label="Name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
        />
      </Field>
      <Field label="Affiliation" hint="Team, batch, workplace — whatever identifies your group">
        <input
          value={affiliation}
          onChange={(e) => setAffiliation(e.target.value)}
          required
          className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
        />
      </Field>
      <Field label="Preferred position (optional)">
        <select
          value={position}
          onChange={(e) => setPosition(e.target.value as Position)}
          className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
        >
          <option value="">No preference</option>
          <option value="GK">Goalkeeper</option>
          <option value="DEF">Defence</option>
          <option value="MID">Midfield</option>
          <option value="FWD">Forward</option>
        </select>
      </Field>
      <Field label="Contact" hint="Phone or messaging handle so we can reach you">
        <input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          required
          className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
        />
      </Field>
      <Field label="Photo (optional)">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
          className="w-full text-sm"
        />
      </Field>
      {error && <p className="text-sm text-live">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-full bg-pitch px-6 py-2.5 text-sm font-bold text-white disabled:opacity-60"
      >
        {submitting ? "Submitting…" : "Submit registration"}
      </button>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
