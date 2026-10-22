"use client";

import { useEffect, useMemo, useState } from "react";
import { downscaleToJpeg } from "@/lib/downscaleImage";
import { checkPhoto, type PhotoCheck } from "@/lib/photoCheck";
import { PHOTO_OFFSET_RANGE, PHOTO_ZOOM_RANGE, type ApplicationConfig } from "@/lib/applicationConfig";
import { PlayerCardPreview, type CardFraming } from "@/components/PlayerCardPreview";

export type ApplicationValues = {
  name: string;
  studentId: string;
  affiliation: string;
  position: string;
  contact: string;
  answers: Record<string, string>;
  photoUrl: string | null;
  photoZoom: number;
  photoX: number;
  photoY: number;
};

export const EMPTY_APPLICATION: ApplicationValues = {
  name: "",
  studentId: "",
  affiliation: "",
  position: "",
  contact: "",
  answers: {},
  photoUrl: null,
  photoZoom: 100,
  photoX: 0,
  photoY: 0,
};

const INPUT =
  "w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch";

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold">
        {label}
        {!required && <span className="ml-1 font-normal text-muted-foreground">(optional)</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

/** What a good photo looks like, drawn inline so it needs no assets. */
function GuideTile({ ok, caption, children }: { ok: boolean; caption: string; children: React.ReactNode }) {
  return (
    <figure className="m-0 w-[76px] text-center text-[10px] leading-tight">
      <svg
        viewBox="0 0 100 120"
        width="76"
        className={"rounded-sm border-2 " + (ok ? "border-pitch" : "border-live")}
        style={{ background: ok ? "#e8e4de" : "#7a6a55" }}
        aria-hidden="true"
      >
        {children}
      </svg>
      <figcaption className={ok ? "text-pitch" : "text-live"}>
        {ok ? "✓" : "✗"} {caption}
      </figcaption>
    </figure>
  );
}

function PhotoGuide() {
  const head = (
    <>
      <circle cx="50" cy="42" r="18" fill="#b98c6b" />
      <path d="M12 120c2-30 18-44 38-44s36 14 38 44z" fill="#2a3a55" />
    </>
  );
  return (
    <div className="mb-3 rounded-lg border border-line bg-surface p-3">
      <p className="mb-2 text-xs text-muted-foreground">
        Stand against a plain wall, face a window, phone at chest height — head and shoulders in frame.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <GuideTile ok caption="Plain wall, face centred">{head}</GuideTile>
        <GuideTile ok={false} caption="Too far away">
          <circle cx="50" cy="70" r="7" fill="#b98c6b" />
          <path d="M38 100c1-10 6-14 12-14s11 4 12 14z" fill="#2a3a55" />
        </GuideTile>
        <GuideTile ok={false} caption="Busy background / hat">
          <path d="M0 0l30 40-30 30zM100 20L70 60l30 20z" fill="#3b5d3f" opacity=".7" />
          <circle cx="50" cy="44" r="18" fill="#b98c6b" />
          <path d="M30 34h40l-6-14H36z" fill="#222" />
          <path d="M12 120c2-30 18-44 38-44s36 14 38 44z" fill="#2a3a55" />
        </GuideTile>
        <GuideTile ok={false} caption="Group / cropped">
          <circle cx="30" cy="48" r="13" fill="#b98c6b" />
          <circle cx="72" cy="48" r="13" fill="#9a7457" />
          <path d="M0 120c2-26 12-38 30-38s28 12 30 38zM46 120c2-26 12-38 26-38s28 12 28 38z" fill="#2a3a55" />
        </GuideTile>
      </div>
    </div>
  );
}

/**
 * The application form shared by "apply" and "edit my application": fields
 * follow the season's configuration, the player card builds live from what is
 * typed and the chosen photo, and the applicant must review the card (zoom /
 * nudge / change photo) before submitting.
 */
export function ApplicationForm({
  config,
  seasonName,
  initial = EMPTY_APPLICATION,
  mode,
  submitLabel,
  onSubmit,
}: {
  config: ApplicationConfig;
  seasonName: string;
  initial?: ApplicationValues;
  mode: "create" | "edit";
  submitLabel: string;
  /** Returns an error message, or null when the submission succeeded. */
  onSubmit: (formData: FormData) => Promise<string | null>;
}) {
  const [v, setV] = useState<ApplicationValues>(initial);
  const [file, setFile] = useState<File | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [check, setCheck] = useState<PhotoCheck | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  const photoSrc = objectUrl ?? (removed ? null : v.photoUrl);
  const reviewRequired = !!photoSrc && (mode === "create" || !!file);
  const framing: CardFraming = { zoom: v.photoZoom, x: v.photoX, y: v.photoY };
  const setFraming = (f: CardFraming) => setV((p) => ({ ...p, photoZoom: f.zoom, photoX: f.x, photoY: f.y }));
  const set = <K extends keyof ApplicationValues>(k: K, value: ApplicationValues[K]) => setV((p) => ({ ...p, [k]: value }));
  const f = config.fields;

  const cardPosition = useMemo(() => (v.position ? v.position : null), [v.position]);

  async function pickPhoto(next: File | null) {
    setReviewed(false);
    setError(null);
    if (!next) return;
    const result = await checkPhoto(next);
    setCheck(result);
    if (result.blocking) {
      setFile(null);
      setObjectUrl(null);
      return;
    }
    setFile(next);
    setRemoved(false);
    setObjectUrl(URL.createObjectURL(next));
    setFraming({ zoom: 100, x: 0, y: 0 });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (reviewRequired && !reviewed) {
      setError("Please check your card and tick the box before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("name", v.name);
      if (f.studentId.enabled) fd.append("studentId", v.studentId);
      if (f.affiliation.enabled) fd.append("affiliation", v.affiliation);
      if (f.position.enabled && v.position) fd.append("position", v.position);
      if (f.contact.enabled) fd.append("contact", v.contact);
      fd.append("answers", JSON.stringify(v.answers));
      fd.append("photoZoom", String(v.photoZoom));
      fd.append("photoX", String(v.photoX));
      fd.append("photoY", String(v.photoY));
      if (file) fd.append("photo", await downscaleToJpeg(file, "avatar"), "photo.jpg");
      else if (removed) fd.append("removePhoto", "1");
      const problem = await onSubmit(fd);
      if (problem) setError(problem);
    } catch {
      setError("Couldn't process that photo — try a different one.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-8 md:grid-cols-[minmax(0,26rem)_16rem]">
      <div className="space-y-4">
        {config.intro && <p className="rounded-lg border border-line bg-surface p-3 text-sm">{config.intro}</p>}

        <Field label="Name" required>
          <input value={v.name} onChange={(e) => set("name", e.target.value)} required maxLength={60} className={INPUT} />
        </Field>

        {f.studentId.enabled && (
          <Field label="Student ID" required={f.studentId.required} hint="Used to recognise you across seasons — never shown publicly">
            <input value={v.studentId} onChange={(e) => set("studentId", e.target.value)} required={f.studentId.required} maxLength={40} className={INPUT} />
          </Field>
        )}

        {f.affiliation.enabled && (
          <Field label="Affiliation" required={f.affiliation.required} hint="Team, batch, workplace — whatever identifies your group">
            <input value={v.affiliation} onChange={(e) => set("affiliation", e.target.value)} required={f.affiliation.required} maxLength={80} className={INPUT} />
          </Field>
        )}

        {f.position.enabled && (
          <Field label="Preferred position" required={f.position.required}>
            <select value={v.position} onChange={(e) => set("position", e.target.value)} required={f.position.required} className={INPUT}>
              <option value="">No preference</option>
              <option value="GK">Goalkeeper</option>
              <option value="DEF">Defence</option>
              <option value="MID">Midfield</option>
              <option value="FWD">Forward</option>
            </select>
          </Field>
        )}

        {f.contact.enabled && (
          <Field label="Contact" required={f.contact.required} hint="Phone or messaging handle so we can reach you">
            <input value={v.contact} onChange={(e) => set("contact", e.target.value)} required={f.contact.required} maxLength={120} className={INPUT} />
          </Field>
        )}

        {config.questions.map((q) => (
          <Field key={q.id} label={q.label} required={q.required}>
            {q.kind === "choice" ? (
              <select
                value={v.answers[q.id] ?? ""}
                onChange={(e) => set("answers", { ...v.answers, [q.id]: e.target.value })}
                required={q.required}
                className={INPUT}
              >
                <option value="">Choose…</option>
                {q.options?.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={v.answers[q.id] ?? ""}
                onChange={(e) => set("answers", { ...v.answers, [q.id]: e.target.value })}
                required={q.required}
                maxLength={300}
                className={INPUT}
              />
            )}
          </Field>
        ))}

        {f.photo.enabled && (
          <div>
            <span className="mb-1 block text-sm font-bold">
              Photo{!f.photo.required && <span className="ml-1 font-normal text-muted-foreground">(optional)</span>}
            </span>
            <PhotoGuide />
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Choose a photo"
              onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)}
              className="w-full text-sm"
            />
            {check?.blocking && <p className="mt-2 text-sm text-live">{check.blocking}</p>}
            {check && !check.blocking && check.warnings.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-amber-600">
                {check.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            {mode === "edit" && photoSrc && (
              <button
                type="button"
                onClick={() => {
                  setRemoved(true);
                  setFile(null);
                  setObjectUrl(null);
                  setReviewed(false);
                }}
                className="mt-2 text-xs text-muted-foreground underline"
              >
                Remove photo
              </button>
            )}
          </div>
        )}

        {error && <p className="text-sm text-live">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-pitch px-6 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {submitting ? "Sending…" : submitLabel}
        </button>
      </div>

      <aside className="md:sticky md:top-6 md:self-start">
        <PlayerCardPreview
          name={v.name}
          position={cardPosition}
          photoUrl={photoSrc}
          framing={framing}
          footer={seasonName.toUpperCase()}
          onFramingChange={setFraming}
        />
        {photoSrc ? (
          <div className="mt-4 space-y-2 text-sm">
            <p className="font-bold">Check your card</p>
            <p className="text-xs text-muted-foreground">Drag the photo on the card, or use the sliders.</p>
            <Slider label="Zoom" min={PHOTO_ZOOM_RANGE.min} max={PHOTO_ZOOM_RANGE.max} value={v.photoZoom} onChange={(n) => set("photoZoom", n)} />
            <Slider label="Left / right" min={PHOTO_OFFSET_RANGE.min} max={PHOTO_OFFSET_RANGE.max} value={v.photoX} onChange={(n) => set("photoX", n)} />
            <Slider label="Up / down" min={PHOTO_OFFSET_RANGE.min} max={PHOTO_OFFSET_RANGE.max} value={v.photoY} onChange={(n) => set("photoY", n)} />
            <button type="button" onClick={() => setFraming({ zoom: 100, x: 0, y: 0 })} className="text-xs text-muted-foreground underline">
              Reset framing
            </button>
            {reviewRequired && (
              <label className="flex items-start gap-2 pt-1 text-xs">
                <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} className="mt-0.5" />
                <span>I&rsquo;ve checked my card and I&rsquo;m happy with it</span>
              </label>
            )}
          </div>
        ) : (
          <p className="mt-4 text-center text-xs text-muted-foreground">Add a photo to see it on your card.</p>
        )}
        <p className="mt-3 text-center text-[11px] text-muted-foreground">Ratings are set by the organisers.</p>
      </aside>
    </form>
  );
}

function Slider({ label, min, max, value, onChange }: { label: string; min: number; max: number; value: number; onChange: (n: number) => void }) {
  return (
    <label className="grid grid-cols-[5.5rem_1fr_2rem] items-center gap-2 text-xs">
      <span>{label}</span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
      <b className="text-right">{value}</b>
    </label>
  );
}
