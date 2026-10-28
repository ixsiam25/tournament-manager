"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BatchBadge } from "@/components/BatchBadge";
import { BatchPicker } from "@/components/BatchPicker";
import { RegistrationEditor } from "@/components/RegistrationEditor";
import { downscaleToJpeg } from "@/lib/downscaleImage";
import { removeBackgroundInWorker } from "@/lib/cutoutClient";
import { checkPhoto } from "@/lib/photoCheck";

type Position = "GK" | "DEF" | "MID" | "FWD" | "";
type Source = "SELF_SERVE" | "ADMIN_MANUAL" | "EXCEL_IMPORT";
type Status = "PENDING" | "APPROVED" | "REJECTED";
type Registration = {
  id: string;
  name: string;
  affiliation: string;
  position: Position | null;
  contact: string;
  studentId: string | null;
  photoKey: string | null;
  answers: Record<string, string> | null;
  source: Source;
  status: Status;
  createdAt: string;
};
type Season = {
  applicationConfig?: { affiliationKind?: "text" | "batch"; batchMeaning?: "entry" | "graduation" } | null;
  id: string;
  name: string;
  registrationOpen: boolean;
  registrationSelfServeEnabled: boolean;
  registrationExcelImportEnabled: boolean;
};

const SOURCE_LABELS: Record<Source, string> = {
  SELF_SERVE: "Self-serve",
  ADMIN_MANUAL: "Manual",
  EXCEL_IMPORT: "Excel",
};

export function RegistrationsPanel() {
  const [season, setSeason] = useState<Season | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [statusFilter, setStatusFilter] = useState<Status | "">("PENDING");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [position, setPosition] = useState<Position>("");
  const [contact, setContact] = useState("");
  const [studentId, setStudentId] = useState("");
  const [addingManual, setAddingManual] = useState(false);
  const [manualPhoto, setManualPhoto] = useState<File | null>(null);
  const [manualStatus, setManualStatus] = useState<string | null>(null);
  const manualPhotoInput = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function load() {
    const [seasonRes, regRes] = await Promise.all([
      fetch("/api/admin/season/active"),
      fetch(`/api/admin/registrations${statusFilter ? `?status=${statusFilter}` : ""}`),
    ]);
    setSeason((await seasonRes.json()).season ?? null);
    setRegistrations((await regRes.json()).registrations ?? []);
    setSelected([]);
    setLoading(false);
  }

  useEffect(() => {
    let ignore = false;
    (async () => {
      const [seasonRes, regRes] = await Promise.all([
        fetch("/api/admin/season/active"),
        fetch(`/api/admin/registrations${statusFilter ? `?status=${statusFilter}` : ""}`),
      ]);
      if (!ignore) {
        setSeason((await seasonRes.json()).season ?? null);
        setRegistrations((await regRes.json()).registrations ?? []);
        setSelected([]);
        setLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [statusFilter]);

  async function toggleRegistrationOpen() {
    if (!season) return;
    setBusy(true);
    const res = await fetch("/api/admin/season/active", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registrationOpen: !season.registrationOpen }),
    });
    setBusy(false);
    if (res.ok) load();
  }

  async function review(id: string, status: "APPROVED" | "REJECTED") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/registrations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to review registration");
      return;
    }
    load();
  }

  const pendingIds = registrations.filter((r) => r.status === "PENDING").map((r) => r.id);
  const toggle = (id: string) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  async function bulkApprove(ids: string[] = selected) {
    if (ids.length === 0) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/registrations/bulk-approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to bulk approve");
      return;
    }
    load();
  }

  async function handleManualAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAddingManual(true);
    const res = await fetch("/api/admin/registrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, affiliation, position: position || null, contact, studentId: studentId || null }),
    });
    setAddingManual(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to add");
      return;
    }
    const created = await res.json().catch(() => ({}));
    if (manualPhoto && created.playerId) await uploadManualPhoto(created.playerId, manualPhoto);
    else setManualStatus(null);
    setName("");
    setAffiliation("");
    setPosition("");
    setContact("");
    setStudentId("");
    setManualPhoto(null);
    if (manualPhotoInput.current) manualPhotoInput.current.value = "";
    load();
  }

  /** Photo → player card: upload the photo, then make the background-removed cut-out in this browser. */
  async function uploadManualPhoto(playerId: string, file: File) {
    try {
      setManualStatus("Uploading the photo…");
      const small = await downscaleToJpeg(file, "avatar");
      const fd = new FormData();
      fd.append("photo", small, "photo.jpg");
      const up = await fetch(`/api/admin/players/${playerId}/photo`, { method: "POST", body: fd });
      if (!up.ok) return setError((await up.json().catch(() => ({}))).error ?? "The applicant was added, but the photo couldn't be saved");
      setManualStatus("Making the card cut-out… keep this tab open");
      const run = removeBackgroundInWorker(small, (p) => setManualStatus(`Making the card cut-out… ${Math.round(p.fraction * 100)}%`));
      const blob = await run.promise.catch(() => null);
      if (blob) {
        const cfd = new FormData();
        cfd.append("cutout", blob, "cutout.png");
        await fetch(`/api/admin/players/${playerId}/cutout`, { method: "POST", body: cfd });
        setManualStatus("✓ Added with photo and card cut-out");
      } else {
        setManualStatus("✓ Added with photo (the cut-out couldn’t be made — the photo is used as it is)");
      }
    } catch {
      setError("The applicant was added, but the photo couldn't be processed");
      setManualStatus(null);
    }
  }

  async function handleImport(file: File) {
    setBusy(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/admin/registrations/import", { method: "POST", body: formData });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Import failed");
      return;
    }
    load();
    if (importInputRef.current) importInputRef.current.value = "";
  }

  if (loading) return <p className="text-muted-foreground">Loading…</p>;

  if (!season) {
    return <p className="text-muted-foreground">No active season — open one via Season first.</p>;
  }

  return (
    <div>
      <h1 className="mb-6 heading-display text-2xl">Registrations</h1>

      <section className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4">
        <div>
          <span
            className={
              "rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wide " +
              (season.registrationOpen ? "bg-pitch/10 text-pitch-dark" : "bg-line text-muted-foreground")
            }
          >
            {season.registrationOpen ? "Open" : "Closed"}
          </span>
          <span className="ml-2 text-sm text-muted-foreground">for {season.name}</span>
        </div>
        <button
          onClick={toggleRegistrationOpen}
          disabled={busy}
          className={
            "rounded-full px-5 py-2 text-sm font-bold text-white disabled:opacity-40 " +
            (season.registrationOpen ? "bg-live" : "bg-pitch")
          }
        >
          {season.registrationOpen ? "Close registration" : "Open registration"}
        </button>
      </section>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="mb-3 font-bold">Manual add</h2>
          <form onSubmit={handleManualAdd} className="space-y-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              required
              className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
            />
            {season?.applicationConfig?.affiliationKind === "text" ? (
              <input
                value={affiliation}
                onChange={(e) => setAffiliation(e.target.value)}
                placeholder="Affiliation"
                required
                className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
              />
            ) : (
              <BatchPicker value={affiliation} onChange={setAffiliation} required meaning={season?.applicationConfig?.batchMeaning ?? "graduation"} />
            )}
            <input
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              placeholder="Student ID (optional)"
              className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
            />
            <div className="flex gap-2">
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value as Position)}
                className="flex-1 rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
              >
                <option value="">No position</option>
                <option value="GK">GK</option>
                <option value="DEF">DEF</option>
                <option value="MID">MID</option>
                <option value="FWD">FWD</option>
              </select>
              <input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="Contact"
                required
                className="flex-1 rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={manualPhotoInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label="Player photo"
                className="sr-only"
                tabIndex={-1}
                onChange={async (e) => {
                  const f = e.target.files?.[0] ?? null;
                  if (!f) return setManualPhoto(null);
                  const check = await checkPhoto(f);
                  if (check.blocking) {
                    setError(check.blocking);
                    e.target.value = "";
                    return setManualPhoto(null);
                  }
                  setError(null);
                  setManualPhoto(f);
                }}
              />
              <button type="button" onClick={() => manualPhotoInput.current?.click()} className="rounded-full border border-line px-4 py-1.5 text-xs font-bold hover:bg-background">
                📷 {manualPhoto ? "Change photo" : "Add photo for the card"}
              </button>
              <span className="min-w-0 truncate text-xs text-muted-foreground">{manualPhoto ? manualPhoto.name : "optional"}</span>
            </div>
            <button
              type="submit"
              disabled={addingManual}
              className="rounded-full bg-pitch px-4 py-1.5 text-xs font-bold text-white disabled:opacity-40"
            >
              {addingManual ? "Adding…" : "Add (auto-approved)"}
            </button>
            {manualStatus && <p className="text-xs font-medium text-pitch-dark" role="status">{manualStatus}</p>}
          </form>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="mb-3 font-bold">Excel bulk import</h2>
          {season.registrationExcelImportEnabled ? (
            <div className="space-y-2">
              <Link href="/api/admin/registrations/template" className="block text-sm font-medium text-pitch-dark underline">
                Download template
              </Link>
              <input
                ref={importInputRef}
                type="file"
                accept=".xlsx"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImport(file);
                }}
                disabled={busy}
                className="w-full text-sm"
              />
              <p className="text-xs text-muted-foreground">Fill the template exactly (Name, Affiliation, Position, Contact) and upload it here.</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Excel import isn&apos;t enabled for this season.</p>
          )}
        </section>
      </div>

      {error && <p className="mb-4 text-sm text-live">{error}</p>}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
        <p className="text-sm text-muted-foreground">Editing the site a lot? Keep a copy of everyone who applied.</p>
        <a href="/api/admin/registrations/export" download className="rounded-full bg-foreground px-5 py-2 text-sm font-bold text-background hover:opacity-90" data-testid="export-applicants">
          ⬇ Download applicant list (Excel)
        </a>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(["PENDING", "APPROVED", "REJECTED", ""] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={
                "rounded-full border px-3 py-1 text-xs font-bold uppercase " +
                (statusFilter === s ? "border-pitch bg-pitch/10 text-pitch-dark" : "border-line text-muted-foreground")
              }
            >
              {s || "All"}
            </button>
          ))}
        </div>
        {pendingIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setSelected(selected.length === pendingIds.length ? [] : pendingIds)}
              className="rounded-full border border-line px-3 py-1.5 text-xs font-bold"
            >
              {selected.length === pendingIds.length ? "Clear selection" : "Select all"}
            </button>
            {selected.length > 0 && (
              <button
                onClick={() => bulkApprove()}
                disabled={busy}
                className="rounded-full bg-pitch px-4 py-1.5 text-xs font-bold text-white disabled:opacity-40"
              >
                Approve {selected.length} selected
              </button>
            )}
            <button
              onClick={() => {
                if (window.confirm(`Approve all ${pendingIds.length} pending application(s)?`)) bulkApprove(pendingIds);
              }}
              disabled={busy}
              className="rounded-full border border-pitch px-4 py-1.5 text-xs font-bold text-pitch disabled:opacity-40"
            >
              Approve all {pendingIds.length}
            </button>
          </div>
        )}
      </div>

      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {registrations.map((r) => (
          <Fragment key={r.id}>
          <li
            onClick={(e) => {
              // Clicking anywhere on a pending row selects it — except on its own buttons/inputs.
              if (r.status === "PENDING" && !(e.target as HTMLElement).closest("button, a, input, select, textarea")) toggle(r.id);
            }}
            aria-selected={r.status === "PENDING" ? selected.includes(r.id) : undefined}
            className={
              "flex flex-wrap items-center gap-3 px-5 py-3.5 " +
              (r.status === "PENDING" ? "cursor-pointer select-none hover:bg-background " : "") +
              (selected.includes(r.id) ? "bg-pitch/10" : "")
            }
          >
            {r.status === "PENDING" && (
              <input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.name}`} />
            )}
            {r.photoKey ? (
              // eslint-disable-next-line @next/next/no-img-element -- small admin thumbnail via the photo proxy
              <img src={`/api/photos/${r.photoKey}`} alt="" className="h-9 w-9 rounded-full object-cover" />
            ) : (
              <span className="h-9 w-9 rounded-full bg-line" />
            )}
            <div className="min-w-0 flex-1">
              <span className="font-bold">{r.name}</span>
              <span className="ml-2 text-sm text-muted-foreground">
                <BatchBadge label={r.affiliation} meaning={season?.applicationConfig?.batchMeaning ?? "graduation"} />
              </span>
              {r.position && <span className="ml-2 text-xs text-muted-foreground">{r.position}</span>}
              {r.studentId && <span className="ml-2 font-mono text-xs text-muted-foreground">ID {r.studentId}</span>}
              {r.answers && Object.keys(r.answers).length > 0 && (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {Object.entries(r.answers).map(([k, a]) => `${k}: ${a}`).join(" · ")}
                </div>
              )}
              <span className="ml-2 rounded-full bg-line px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                {SOURCE_LABELS[r.source]}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">{r.contact}</span>
            <button onClick={() => setEditingId(editingId === r.id ? null : r.id)} className="text-xs font-medium text-pitch underline" aria-label={`Edit ${r.name}`}>
              Edit
            </button>
            {r.status === "PENDING" ? (
              <div className="flex gap-2">
                <button
                  onClick={() => review(r.id, "APPROVED")}
                  disabled={busy}
                  className="rounded-full bg-pitch px-3 py-1 text-xs font-bold text-white disabled:opacity-40"
                >
                  Approve
                </button>
                <button
                  onClick={() => review(r.id, "REJECTED")}
                  disabled={busy}
                  className="rounded-full border border-live px-3 py-1 text-xs font-bold text-live disabled:opacity-40"
                >
                  Reject
                </button>
              </div>
            ) : (
              <span
                className={
                  "rounded-full px-2 py-0.5 text-xs font-bold uppercase " +
                  (r.status === "APPROVED" ? "bg-pitch/10 text-pitch-dark" : "bg-live/10 text-live")
                }
              >
                {r.status}
              </span>
            )}
          </li>
          {editingId === r.id && (
            <li>
              <RegistrationEditor
                reg={r}
                batch={season?.applicationConfig?.affiliationKind !== "text"}
                meaning={season?.applicationConfig?.batchMeaning ?? "graduation"}
                onDone={(saved) => {
                  setEditingId(null);
                  if (saved) load();
                }}
              />
            </li>
          )}
          </Fragment>
        ))}
        {registrations.length === 0 && <li className="px-5 py-6 text-center text-muted-foreground">No registrations.</li>}
      </ul>
    </div>
  );
}
