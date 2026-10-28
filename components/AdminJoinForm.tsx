"use client";

import { useState } from "react";

const INPUT = "w-full rounded-xl border border-line bg-background px-4 py-3 text-base outline-none focus:border-pitch focus:ring-4 focus:ring-pitch/15";

/** Create your profile from an invitation link. The account stays locked until an admin approves it. */
export function AdminJoinForm({ token, role }: { token: string; role: string }) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/join/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, username, password }) });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? "Couldn't create your profile");
    setDone(true);
  }

  if (done) {
    return (
      <div className="rounded-2xl border-2 border-pitch bg-pitch/10 p-6 text-center" data-testid="join-done">
        <p className="text-3xl" aria-hidden>
          ✅
        </p>
        <h2 className="mt-2 text-xl font-bold">Profile created</h2>
        <p className="mt-1 text-sm">An admin needs to approve it before you can log in. They&rsquo;ll let you know — then log in with the username and password you just chose.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-line bg-surface p-6">
      <p className="text-sm text-muted-foreground">
        You&rsquo;ve been invited to the BFL admin team as <b className="text-foreground">{role === "ADMIN" ? "an admin" : "a scorer"}</b>. Create your profile — an admin will approve it before you can log in.
      </p>
      <label className="block">
        <span className="mb-1.5 block text-sm font-semibold">Your name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} className={INPUT} />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-semibold">Username</span>
        <input value={username} onChange={(e) => setUsername(e.target.value)} required autoCapitalize="none" autoComplete="username" className={INPUT} />
        <span className="mt-1 block text-xs text-muted-foreground">Letters, numbers, dots, dashes and underscores (3+ characters)</span>
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-semibold">Password</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="new-password" className={INPUT} />
        <span className="mt-1 block text-xs text-muted-foreground">At least 6 characters</span>
      </label>
      {error && <p className="text-sm text-live" role="alert">{error}</p>}
      <button type="submit" disabled={busy} className="w-full rounded-full bg-pitch px-6 py-3 text-base font-bold text-white disabled:opacity-60">
        {busy ? "Creating…" : "Create my profile"}
      </button>
    </form>
  );
}
