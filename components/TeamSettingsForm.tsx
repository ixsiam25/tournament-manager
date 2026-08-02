"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { downscaleToJpeg } from "@/lib/downscaleImage";

export function TeamSettingsForm({
  initialName,
  initialLogoUrl,
}: {
  initialName: string;
  initialLogoUrl: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(initialName);
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameMessage, setNameMessage] = useState<string | null>(null);

  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    setNameError(null);
    setNameMessage(null);
    if (name.trim().length === 0) {
      setNameError("Name is required");
      return;
    }
    setSavingName(true);
    const res = await fetch("/api/manager/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    setSavingName(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setNameError(body.error ?? "Failed to save name");
      return;
    }
    setNameMessage("Team name updated.");
    router.refresh();
  }

  async function handleLogoFile(file: File) {
    setUploadingLogo(true);
    setLogoError(null);
    try {
      const jpeg = await downscaleToJpeg(file);
      const formData = new FormData();
      formData.append("logo", jpeg, "logo.jpg");
      const res = await fetch("/api/manager/team/logo", { method: "POST", body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setLogoError(body.error ?? "Upload failed");
        return;
      }
      router.refresh();
    } catch {
      setLogoError("Couldn't process that image");
    } finally {
      setUploadingLogo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section className="mb-8 rounded-block-lg border-2 border-line-strong bg-surface p-6 shadow-block">
      <h2 className="mb-4 font-black uppercase tracking-wide">Team settings</h2>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <div className="flex shrink-0 flex-col items-center gap-2">
          {initialLogoUrl ? (
            <Image
              src={initialLogoUrl}
              alt={initialName}
              width={80}
              height={80}
              className="h-20 w-20 rounded-block border-2 border-line-strong object-cover"
            />
          ) : (
            <span className="flex h-20 w-20 items-center justify-center rounded-block border-2 border-line-strong bg-line text-center text-[10px] text-muted">
              No logo
            </span>
          )}
          <input
            ref={inputRef}
            id="team-logo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleLogoFile(file);
            }}
            disabled={uploadingLogo}
            className="hidden"
          />
          <label
            htmlFor="team-logo"
            className={
              "cursor-pointer whitespace-nowrap rounded-block bg-pitch px-3 py-1.5 text-xs font-bold text-white " +
              (uploadingLogo ? "pointer-events-none opacity-60" : "")
            }
          >
            {uploadingLogo ? "Uploading…" : "Change logo"}
          </label>
          {logoError && <p className="text-xs text-live">{logoError}</p>}
        </div>

        <form onSubmit={handleSaveName} className="flex flex-1 flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <label className="mb-1 block text-sm font-medium">Team name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-block border-2 border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
            />
          </div>
          <button
            type="submit"
            disabled={savingName}
            className="rounded-block bg-pitch px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
          >
            {savingName ? "Saving…" : "Save name"}
          </button>
        </form>
      </div>
      {nameError && <p className="mt-3 text-sm text-live">{nameError}</p>}
      {nameMessage && <p className="mt-3 text-sm text-pitch-dark">{nameMessage}</p>}
    </section>
  );
}
