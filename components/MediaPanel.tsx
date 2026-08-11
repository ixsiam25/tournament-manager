"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { downscaleToJpeg } from "@/lib/downscaleImage";
import { usePasswordConfirm } from "@/components/PasswordConfirm";

type Season = { id: string; number: number; name: string; slug: string; status: "ACTIVE" | "ARCHIVED" };
type Tag = "TROPHY" | "ACTION" | "TEAM" | "CROWD";
type Asset = {
  id: string;
  key: string;
  caption: string;
  credit: string | null;
  tag: Tag;
  sortOrder: number;
  isHero: boolean;
};
type PendingFile = { file: File; previewUrl: string; caption: string; credit: string; tag: Tag };

const TAG_LABELS: Record<Tag, string> = { TROPHY: "Trophy", ACTION: "Action", TEAM: "Team", CROWD: "Crowd" };

export function MediaPanel() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState("");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { confirmWithPassword, modal } = usePasswordConfirm();

  useEffect(() => {
    let ignore = false;
    (async () => {
      const res = await fetch("/api/admin/seasons");
      const body = await res.json();
      if (!ignore) {
        const list: Season[] = body.seasons ?? [];
        setSeasons(list);
        if (list.length > 0) setSeasonId(list[0].id);
        setLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  async function loadAssets(id: string) {
    const res = await fetch(`/api/admin/media?seasonId=${id}`);
    const body = await res.json();
    setAssets(body.assets ?? []);
  }

  useEffect(() => {
    if (!seasonId) return;
    let ignore = false;
    (async () => {
      const res = await fetch(`/api/admin/media?seasonId=${seasonId}`);
      const body = await res.json();
      if (!ignore) setAssets(body.assets ?? []);
    })();
    return () => {
      ignore = true;
    };
  }, [seasonId]);

  function handleFilesSelected(files: FileList | null) {
    if (!files) return;
    const next: PendingFile[] = Array.from(files).map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      caption: "",
      credit: "",
      tag: "ACTION",
    }));
    setPending((prev) => [...prev, ...next]);
    if (inputRef.current) inputRef.current.value = "";
  }

  function updatePending(index: number, patch: Partial<PendingFile>) {
    setPending((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function removePending(index: number) {
    setPending((prev) => {
      URL.revokeObjectURL(prev[index].previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function uploadAll() {
    setError(null);
    const missingCaption = pending.some((p) => !p.caption.trim());
    if (missingCaption) {
      setError("Every photo needs a caption before uploading");
      return;
    }
    setUploading(true);
    for (const p of pending) {
      try {
        const jpeg = await downscaleToJpeg(p.file, "gallery");
        const formData = new FormData();
        formData.append("file", jpeg, "photo.jpg");
        formData.append("seasonId", seasonId);
        formData.append("caption", p.caption);
        formData.append("credit", p.credit);
        formData.append("tag", p.tag);
        const res = await fetch("/api/admin/media", { method: "POST", body: formData });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error ?? "Upload failed");
          continue;
        }
        URL.revokeObjectURL(p.previewUrl);
      } catch {
        setError("Couldn't process one of the photos");
      }
    }
    setPending([]);
    setUploading(false);
    loadAssets(seasonId);
  }

  async function patchAsset(id: string, patch: Partial<{ caption: string; credit: string | null; tag: Tag; sortOrder: number; isHero: boolean }>) {
    setBusyId(id);
    const res = await fetch(`/api/admin/media/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setBusyId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Update failed");
      return;
    }
    loadAssets(seasonId);
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= assets.length) return;
    const a = assets[index];
    const b = assets[target];
    patchAsset(a.id, { sortOrder: b.sortOrder });
    patchAsset(b.id, { sortOrder: a.sortOrder });
  }

  async function handleDelete(asset: Asset) {
    const confirmed = await confirmWithPassword(`Delete this photo ("${asset.caption}")?`);
    if (!confirmed) return;
    setBusyId(asset.id);
    const res = await fetch(`/api/admin/media/${asset.id}`, { method: "DELETE" });
    setBusyId(null);
    if (res.ok) loadAssets(seasonId);
  }

  if (loading) return <p className="text-muted">Loading…</p>;

  return (
    <div>
      {modal}
      <h1 className="mb-6 heading-display text-2xl">Media</h1>

      {seasons.length === 0 ? (
        <p className="text-muted">No seasons yet.</p>
      ) : (
        <>
          <label className="mb-6 block max-w-xs">
            <span className="mb-1 block text-sm font-medium">Season</span>
            <select
              value={seasonId}
              onChange={(e) => setSeasonId(e.target.value)}
              className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
            >
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.status})
                </option>
              ))}
            </select>
          </label>

          <section className="mb-8 rounded-2xl border border-line bg-surface p-6">
            <h2 className="mb-3 font-bold">Add photos</h2>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(e) => handleFilesSelected(e.target.files)}
              className="mb-4 text-sm"
            />
            {pending.length > 0 && (
              <div className="space-y-4">
                {pending.map((p, i) => (
                  <div key={p.previewUrl} className="flex flex-wrap items-start gap-3 rounded-xl border border-line p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element -- local blob: preview, next/image doesn't optimize these anyway */}
                    <img src={p.previewUrl} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" />
                    <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
                      <label className="min-w-40 flex-1 block">
                        <span className="mb-1 block text-xs font-medium">Caption (required)</span>
                        <input
                          value={p.caption}
                          onChange={(e) => updatePending(i, { caption: e.target.value })}
                          className="w-full rounded-lg border border-line bg-background px-2.5 py-1.5 text-sm outline-none focus:border-pitch"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium">Credit</span>
                        <input
                          value={p.credit}
                          onChange={(e) => updatePending(i, { credit: e.target.value })}
                          className="w-32 rounded-lg border border-line bg-background px-2.5 py-1.5 text-sm outline-none focus:border-pitch"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium">Tag</span>
                        <select
                          value={p.tag}
                          onChange={(e) => updatePending(i, { tag: e.target.value as Tag })}
                          className="rounded-lg border border-line bg-background px-2.5 py-1.5 text-sm outline-none focus:border-pitch"
                        >
                          {(Object.keys(TAG_LABELS) as Tag[]).map((t) => (
                            <option key={t} value={t}>
                              {TAG_LABELS[t]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={() => removePending(i)}
                        className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-muted"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  onClick={uploadAll}
                  disabled={uploading}
                  className="rounded-full bg-pitch px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
                >
                  {uploading ? "Uploading…" : `Upload ${pending.length} photo${pending.length === 1 ? "" : "s"}`}
                </button>
              </div>
            )}
            {error && <p className="mt-3 text-sm text-live">{error}</p>}
          </section>

          <h2 className="mb-3 font-bold">{assets.length} photo{assets.length === 1 ? "" : "s"}</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {assets.map((a, i) => (
              <div key={a.id} className="space-y-2 rounded-xl border border-line bg-surface p-3">
                <div className="relative aspect-square overflow-hidden rounded-lg bg-line">
                  <Image src={`/api/photos/${a.key}`} alt={a.caption} fill sizes="200px" className="object-cover" />
                  {a.isHero && (
                    <span className="absolute left-1.5 top-1.5 rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold uppercase text-black">
                      Hero
                    </span>
                  )}
                </div>
                <input
                  defaultValue={a.caption}
                  onBlur={(e) => e.target.value !== a.caption && patchAsset(a.id, { caption: e.target.value })}
                  disabled={busyId === a.id}
                  className="w-full rounded-lg border border-line bg-background px-2 py-1 text-xs outline-none focus:border-pitch"
                />
                <select
                  value={a.tag}
                  onChange={(e) => patchAsset(a.id, { tag: e.target.value as Tag })}
                  disabled={busyId === a.id}
                  className="w-full rounded-lg border border-line bg-background px-2 py-1 text-xs outline-none focus:border-pitch"
                >
                  {(Object.keys(TAG_LABELS) as Tag[]).map((t) => (
                    <option key={t} value={t}>
                      {TAG_LABELS[t]}
                    </option>
                  ))}
                </select>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0 || busyId === a.id}
                    className="rounded-full border border-line px-2 py-1 text-xs disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === assets.length - 1 || busyId === a.id}
                    className="rounded-full border border-line px-2 py-1 text-xs disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => patchAsset(a.id, { isHero: !a.isHero })}
                    disabled={busyId === a.id}
                    className={
                      "rounded-full border px-2 py-1 text-xs font-bold disabled:opacity-30 " +
                      (a.isHero ? "border-gold text-gold" : "border-line text-muted")
                    }
                  >
                    {a.isHero ? "★ Hero" : "☆ Set hero"}
                  </button>
                  <button
                    onClick={() => handleDelete(a)}
                    disabled={busyId === a.id}
                    className="ml-auto rounded-full border border-live px-2 py-1 text-xs font-bold text-live disabled:opacity-30"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {assets.length === 0 && <p className="col-span-full text-sm text-muted">No photos yet.</p>}
          </div>
        </>
      )}
    </div>
  );
}
