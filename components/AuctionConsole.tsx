"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { usePasswordConfirm } from "@/components/PasswordConfirm";
import { Crest } from "@/components/Crest";

type Settings = { budgetPerTeam: number; basePrice: number; bidIncrement: number } | null;
type Season = { id: string; name: string; teamFormation: "BATCH" | "AUCTION" };
type Lot = { id: string; player: { id: string; name: string; position: string | null; photoUrl: string | null } };
type TeamStatus = {
  teamId: string;
  teamName: string;
  logoUrl: string | null;
  squadCount: number;
  remainingBudget: number;
  maxAllowableBid: number;
};

export function AuctionConsole() {
  const [loading, setLoading] = useState(true);
  const [season, setSeason] = useState<Season | null>(null);
  const [settings, setSettings] = useState<Settings>(null);
  const [currentLot, setCurrentLot] = useState<Lot | null>(null);
  const [queue, setQueue] = useState<{ id: string; player: { name: string } }[]>([]);
  const [teams, setTeams] = useState<TeamStatus[]>([]);
  const [unsoldCount, setUnsoldCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSettings, setNeedsSettings] = useState(false);

  const [budgetPerTeam, setBudgetPerTeam] = useState(1000);
  const [basePrice, setBasePrice] = useState(50);
  const [bidIncrement, setBidIncrement] = useState(10);

  const [sellTeamId, setSellTeamId] = useState("");
  const [sellPrice, setSellPrice] = useState("");

  const { confirmWithPassword, modal } = usePasswordConfirm();

  async function load() {
    const res = await fetch("/api/admin/auction");
    if (res.status === 409) {
      const body = await res.json().catch(() => ({}));
      if (/configured/.test(body.error ?? "")) {
        setNeedsSettings(true);
        const seasonRes = await fetch("/api/admin/auction/settings");
        const seasonBody = await seasonRes.json();
        setSeason(seasonBody.season ?? null);
        setLoading(false);
        return;
      }
      setError(body.error ?? "Failed to load auction");
      setLoading(false);
      return;
    }
    const body = await res.json();
    setNeedsSettings(false);
    setSeason(body.season);
    setSettings(body.settings);
    setCurrentLot(body.currentLot);
    setQueue(body.queue ?? []);
    setTeams(body.teams ?? []);
    setUnsoldCount(body.unsoldCount ?? 0);
    setSellTeamId("");
    setSellPrice("");
    setLoading(false);
  }

  useEffect(() => {
    let ignore = false;
    (async () => {
      const res = await fetch("/api/admin/auction");
      if (ignore) return;
      if (res.status === 409) {
        const body = await res.json().catch(() => ({}));
        if (/configured/.test(body.error ?? "")) {
          setNeedsSettings(true);
          const seasonRes = await fetch("/api/admin/auction/settings");
          const seasonBody = await seasonRes.json();
          if (!ignore) {
            setSeason(seasonBody.season ?? null);
            setLoading(false);
          }
          return;
        }
        setError(body.error ?? "Failed to load auction");
        setLoading(false);
        return;
      }
      const body = await res.json();
      if (!ignore) {
        setSeason(body.season);
        setSettings(body.settings);
        setCurrentLot(body.currentLot);
        setQueue(body.queue ?? []);
        setTeams(body.teams ?? []);
        setUnsoldCount(body.unsoldCount ?? 0);
        setLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/auction/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ budgetPerTeam, basePrice, bidIncrement }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to save settings");
      return;
    }
    load();
  }

  async function nextLot() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/auction/next", { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to bring up next lot");
      return;
    }
    load();
  }

  async function sell() {
    if (!sellTeamId || !sellPrice) {
      setError("Pick a team and enter a price");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/auction/sell", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId: sellTeamId, price: Number(sellPrice) }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to sell");
      return;
    }
    load();
  }

  async function markUnsold() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/auction/unsold", { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to mark unsold");
      return;
    }
    load();
  }

  async function undo() {
    const confirmed = await confirmWithPassword("Undo the last sale/unsold result?");
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/auction/undo", { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Nothing to undo");
      return;
    }
    load();
  }

  async function requeueUnsold() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/auction/requeue-unsold", { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to requeue");
      return;
    }
    load();
  }

  if (loading) return <p className="text-muted">Loading…</p>;

  if (!season) return <p className="text-muted">No active season.</p>;
  if (season.teamFormation !== "AUCTION") {
    return <p className="text-muted">&quot;{season.name}&quot; isn&apos;t an AUCTION-formation season.</p>;
  }

  if (needsSettings || !settings) {
    return (
      <div>
        <h1 className="mb-6 heading-display text-2xl">Auction — Settings</h1>
        <form onSubmit={saveSettings} className="max-w-sm space-y-3 rounded-2xl border border-line bg-surface p-5">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Budget per team</span>
            <input
              type="number"
              value={budgetPerTeam}
              onChange={(e) => setBudgetPerTeam(Number(e.target.value))}
              className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Base price</span>
            <input
              type="number"
              value={basePrice}
              onChange={(e) => setBasePrice(Number(e.target.value))}
              className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Bid increment</span>
            <input
              type="number"
              value={bidIncrement}
              onChange={(e) => setBidIncrement(Number(e.target.value))}
              className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
            />
          </label>
          {error && <p className="text-sm text-live">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-pitch px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            Save & start
          </button>
        </form>
      </div>
    );
  }

  return (
    <div>
      {modal}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="heading-display text-2xl">Auction</h1>
        <span className="text-sm text-muted">{queue.length} queued · {unsoldCount} unsold</span>
      </div>
      {error && <p className="mb-4 text-sm text-live">{error}</p>}

      <section className="mb-6 rounded-2xl border border-line bg-surface p-5">
        {currentLot ? (
          <div>
            <div className="mb-4 flex items-center gap-4">
              {currentLot.player.photoUrl ? (
                <div className="relative h-20 w-14 overflow-hidden rounded-lg border border-line-strong">
                  <Image src={currentLot.player.photoUrl} alt={currentLot.player.name} fill sizes="56px" className="object-cover" />
                </div>
              ) : (
                <div className="h-20 w-14 rounded-lg bg-line" />
              )}
              <div>
                <p className="text-lg font-bold">{currentLot.player.name}</p>
                <p className="text-sm text-muted">
                  {currentLot.player.position ?? "No position"} · base {settings.basePrice}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium">Sold to</span>
                <select
                  value={sellTeamId}
                  onChange={(e) => setSellTeamId(e.target.value)}
                  className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
                >
                  <option value="">Select team…</option>
                  {teams.map((t) => (
                    <option key={t.teamId} value={t.teamId}>
                      {t.teamName} (max {t.maxAllowableBid})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium">Price</span>
                <input
                  type="number"
                  value={sellPrice}
                  onChange={(e) => setSellPrice(e.target.value)}
                  className="w-28 rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
                />
              </label>
              <button
                onClick={sell}
                disabled={busy}
                className="rounded-full bg-pitch px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
              >
                Sold
              </button>
              <button
                onClick={markUnsold}
                disabled={busy}
                className="rounded-full border border-live px-5 py-2 text-sm font-bold text-live disabled:opacity-40"
              >
                Unsold
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted">No lot currently up.</p>
            <div className="flex gap-3">
              <button
                onClick={nextLot}
                disabled={busy || queue.length === 0}
                className="rounded-full bg-pitch px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
              >
                Next lot
              </button>
              {unsoldCount > 0 && queue.length === 0 && (
                <button
                  onClick={requeueUnsold}
                  disabled={busy}
                  className="rounded-full border border-line px-5 py-2 text-sm font-bold disabled:opacity-40"
                >
                  Requeue {unsoldCount} unsold for round 2
                </button>
              )}
            </div>
          </div>
        )}
        <button
          onClick={undo}
          disabled={busy}
          className="mt-4 rounded-full border border-line px-4 py-1.5 text-xs font-medium text-muted disabled:opacity-40"
        >
          Undo last sale
        </button>
      </section>

      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">Teams</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
        {teams.map((t) => (
          <div key={t.teamId} className="rounded-2xl border border-line bg-surface p-4">
            <p className="mb-1 flex items-center gap-2 font-bold">
              <Crest size={22} name={t.teamName} />
              {t.teamName}
            </p>
            <p className="text-sm text-muted">Squad: {t.squadCount}</p>
            <p className="text-sm text-muted">Remaining: {t.remainingBudget}</p>
            <p className="text-sm text-muted">Max bid: {t.maxAllowableBid}</p>
          </div>
        ))}
        {teams.length === 0 && <p className="text-sm text-muted">No teams yet — create some via Teams first.</p>}
      </div>

      {queue.length > 0 && (
        <>
          <h2 className="mb-3 mt-6 text-sm font-bold uppercase tracking-wide text-muted">Up next</h2>
          <ol className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface text-sm">
            {queue.slice(0, 10).map((l, i) => (
              <li key={l.id} className="flex items-center gap-3 px-4 py-2">
                <span className="text-muted">{i + 1}</span>
                {l.player.name}
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
