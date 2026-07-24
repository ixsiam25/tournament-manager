"use client";

import { useCallback, useRef, useState } from "react";

type PendingRequest = {
  message: string;
  resolve: (confirmed: boolean) => void;
};

export function usePasswordConfirm() {
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const resolveRef = useRef<((confirmed: boolean) => void) | null>(null);

  const confirmWithPassword = useCallback((message: string) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setPassword("");
      setError(null);
      setPending({ message, resolve });
    });
  }, []);

  function close(result: boolean) {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setPending(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError("Incorrect password");
        return;
      }
      close(true);
    } finally {
      setChecking(false);
    }
  }

  const modal = pending ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-lg">
        <p className="mb-4 font-semibold">{pending.message}</p>
        <form onSubmit={submit}>
          <label className="mb-1 block text-sm font-medium">Confirm admin password</label>
          <input
            type="password"
            autoFocus
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
          />
          {error && <p className="mt-2 text-sm text-live">{error}</p>}
          <div className="mt-4 flex gap-3">
            <button
              type="submit"
              disabled={checking}
              className="flex-1 rounded-full bg-live px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              {checking ? "Checking…" : "Confirm"}
            </button>
            <button
              type="button"
              onClick={() => close(false)}
              className="rounded-full border border-line px-4 py-2 text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  ) : null;

  return { confirmWithPassword, modal };
}
