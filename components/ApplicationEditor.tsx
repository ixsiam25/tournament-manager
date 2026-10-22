"use client";

import { useEffect, useState } from "react";
import { ApplicationForm, type ApplicationValues } from "@/components/ApplicationForm";
import type { ApplicationConfig } from "@/lib/applicationConfig";

type Loaded = {
  seasonName: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  editable: boolean;
  config: ApplicationConfig;
  registration: {
    name: string;
    studentId: string | null;
    affiliation: string;
    position: string | null;
    contact: string;
    answers: Record<string, string>;
    photoUrl: string | null;
    photoZoom: number;
    photoX: number;
    photoY: number;
  };
};

/** The applicant's private "fix my application" page, reached by the edit
 * link they were given when they applied. */
export function ApplicationEditor({ token }: { token: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [missing, setMissing] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let ignore = false;
    (async () => {
      const res = await fetch(`/api/register/edit/${encodeURIComponent(token)}`);
      if (ignore) return;
      if (!res.ok) return setMissing(true);
      setData(await res.json());
    })();
    return () => {
      ignore = true;
    };
  }, [token]);

  if (missing) return <p className="rounded-block-lg border border-line bg-surface p-5">This link isn&rsquo;t valid. Check you copied all of it.</p>;
  if (!data) return <p className="text-muted-foreground">Loading…</p>;

  const r = data.registration;
  if (!data.editable) {
    const why =
      data.status === "APPROVED"
        ? "Your application has been approved — you're in!"
        : data.status === "REJECTED"
          ? "Your application was not accepted this time."
          : "Applications are closed, so this application can no longer be changed.";
    return <p className="rounded-block-lg border border-line bg-surface p-5">{why}</p>;
  }

  const initial: ApplicationValues = {
    name: r.name,
    studentId: r.studentId ?? "",
    affiliation: r.affiliation,
    position: r.position ?? "",
    contact: r.contact,
    answers: r.answers,
    photoUrl: r.photoUrl,
    photoZoom: r.photoZoom,
    photoX: r.photoX,
    photoY: r.photoY,
  };

  return (
    <div>
      {saved && <p className="mb-4 rounded-lg border border-pitch bg-pitch/10 p-3 text-sm text-pitch-dark">Saved — your changes are in.</p>}
      <ApplicationForm
        config={data.config}
        seasonName={data.seasonName}
        initial={initial}
        mode="edit"
        submitLabel="Save changes"
        onSubmit={async (fd) => {
          setSaved(false);
          const res = await fetch(`/api/register/edit/${encodeURIComponent(token)}`, { method: "PUT", body: fd });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) return body.error ?? "Failed to save";
          setSaved(true);
          window.scrollTo({ top: 0, behavior: "smooth" });
          return null;
        }}
      />
    </div>
  );
}
