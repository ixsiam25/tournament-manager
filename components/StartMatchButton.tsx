"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function StartMatchButton({ matchId, disabled }: { matchId: string; disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/fixtures/${matchId}/start`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to start match");
      return;
    }
    router.push(`/admin/live/${matchId}`);
  }

  return (
    <div className="text-right">
      <button
        onClick={handleStart}
        disabled={disabled || busy}
        title={disabled ? "Both teams must be assigned first" : undefined}
        className="rounded-full bg-live px-4 py-1.5 text-xs font-bold text-white disabled:opacity-40"
      >
        Start match
      </button>
      {error && <p className="mt-1 text-xs text-live">{error}</p>}
    </div>
  );
}
