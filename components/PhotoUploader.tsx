"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { downscaleToJpeg } from "@/lib/downscaleImage";

export function PhotoUploader({ playerId }: { playerId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const jpeg = await downscaleToJpeg(file);
      const formData = new FormData();
      formData.append("photo", jpeg, "photo.jpg");
      const res = await fetch(`/api/manager/players/${playerId}/photo`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Upload failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't process that image");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="text-center">
      <input
        ref={inputRef}
        id={`photo-${playerId}`}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
        disabled={busy}
        className="hidden"
      />
      <label
        htmlFor={`photo-${playerId}`}
        className={
          "inline-block cursor-pointer rounded-full bg-pitch px-4 py-1.5 text-xs font-bold text-white " +
          (busy ? "pointer-events-none opacity-60" : "")
        }
      >
        {busy ? "Uploading…" : "Upload photo"}
      </label>
      {error && <p className="mt-1 text-xs text-live">{error}</p>}
    </div>
  );
}
