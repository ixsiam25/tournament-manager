"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Position = "GK" | "DEF" | "MID" | "FWD" | "";
type Source = "SELF_SERVE" | "ADMIN_MANUAL" | "EXCEL_IMPORT";
type Status = "PENDING" | "APPROVED" | "REJECTED";
type Registration = {
  id: string;
  name: string;
  affiliation: string;
  position: Position | null;
  contact: string;
  source: Source;
  status: Status;
  createdAt: string;
};
type Season = {
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
  const [addingManual, setAddingManual] = useState(false);

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

  async function bulkApprove() {
    if (selected.length === 0) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/registrations/bulk-approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selected }),
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
      body: JSON.stringify({ name, affiliation, position: position || null, contact }),
    });
    setAddingManual(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to add");
      return;
    }
    setName("");
    setAffiliation("");
    setPosition("");
    setContact("");
    load();
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

  if (loading) return <p className="text-muted">Loading…</p>;

  if (!season) {
    return <p className="text-muted">No active season — open one via Season first.</p>;
  }

  return (
    <div>
      <h1 className="mb-6 heading-display text-2xl">Registrations</h1>

      <section className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4">
        <div>
          <span
            className={
              "rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wide " +
              (season.registrationOpen ? "bg-pitch/10 text-pitch-dark" : "bg-line text-muted")
            }
          >
            {season.registrationOpen ? "Open" : "Closed"}
          </span>
          <span className="ml-2 text-sm text-muted">for {season.name}</span>
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
            <input
              value={affiliation}
              onChange={(e) => setAffiliation(e.target.value)}
              placeholder="Affiliation"
              required
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
            <button
              type="submit"
              disabled={addingManual}
              className="rounded-full bg-pitch px-4 py-1.5 text-xs font-bold text-white disabled:opacity-40"
            >
              {addingManual ? "Adding…" : "Add (auto-approved)"}
            </button>
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
              <p className="text-xs text-muted">Fill the template exactly (Name, Affiliation, Position, Contact) and upload it here.</p>
            </div>
          ) : (
            <p className="text-sm text-muted">Excel import isn&apos;t enabled for this season.</p>
          )}
        </section>
      </div>

      {error && <p className="mb-4 text-sm text-live">{error}</p>}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(["PENDING", "APPROVED", "REJECTED", ""] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={
                "rounded-full border px-3 py-1 text-xs font-bold uppercase " +
                (statusFilter === s ? "border-pitch bg-pitch/10 text-pitch-dark" : "border-line text-muted")
              }
            >
              {s || "All"}
            </button>
          ))}
        </div>
        {statusFilter === "PENDING" && selected.length > 0 && (
          <button
            onClick={bulkApprove}
            disabled={busy}
            className="rounded-full bg-pitch px-4 py-1.5 text-xs font-bold text-white disabled:opacity-40"
          >
            Approve {selected.length} selected
          </button>
        )}
      </div>

      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {registrations.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
            {r.status === "PENDING" && (
              <input
                type="checkbox"
                checked={selected.includes(r.id)}
                onChange={(e) =>
                  setSelected((prev) => (e.target.checked ? [...prev, r.id] : prev.filter((id) => id !== r.id)))
                }
              />
            )}
            <div className="min-w-0 flex-1">
              <span className="font-bold">{r.name}</span>
              <span className="ml-2 text-sm text-muted">{r.affiliation}</span>
              {r.position && <span className="ml-2 text-xs text-muted">{r.position}</span>}
              <span className="ml-2 rounded-full bg-line px-2 py-0.5 text-[10px] font-bold uppercase text-muted">
                {SOURCE_LABELS[r.source]}
              </span>
            </div>
            <span className="text-xs text-muted">{r.contact}</span>
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
        ))}
        {registrations.length === 0 && <li className="px-5 py-6 text-center text-muted">No registrations.</li>}
      </ul>
    </div>
  );
}
