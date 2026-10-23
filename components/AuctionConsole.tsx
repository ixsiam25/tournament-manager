"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePasswordConfirm } from "@/components/PasswordConfirm";
import { Crest } from "@/components/Crest";

type Settings = { budgetPerTeam: number; basePrice: number; bidIncrement: number } | null;
type Season = { id: string; name: string; teamFormation: string; squadSizeMin: number | null; squadSizeMax: number | null };
type LotPlayer = { id: string; name: string; position: string | null; photoUrl: string | null };
type Lot = { id: string; currentBid: number | null; currentBidTeamId: string | null; player: LotPlayer };
type ListedLot = { id: string; player: LotPlayer };
type TeamStatus = {
  teamId: string;
  teamName: string;
  logoUrl: string | null;
  squadCount: number;
  remainingBudget: number;
  maxAllowableBid: number;
};

const FIELD = "rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch";

/** The auctioneer's console. It records what happens in the room — bids, sales,
 * holds — and everything else (the projector view, the public page) follows. */
export function AuctionConsole() {
  const [loading, setLoading] = useState(true);
  const [season, setSeason] = useState<Season | null>(null);
  const [settings, setSettings] = useState<Settings>(null);
  const [currentLot, setCurrentLot] = useState<Lot | null>(null);
  const [queue, setQueue] = useState<ListedLot[]>([]);
  const [held, setHeld] = useState<ListedLot[]>([]);
  const [unsold, setUnsold] = useState<ListedLot[]>([]);
  const [teams, setTeams] = useState<TeamStatus[]>([]);
  const [closed, setClosed] = useState(false);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [needsSettings, setNeedsSettings] = useState(false);

  const [budgetPerTeam, setBudgetPerTeam] = useState(1000);
  const [basePrice, setBasePrice] = useState(50);
  const [bidIncrement, setBidIncrement] = useState(10);

  const [bidTeamId, setBidTeamId] = useState("");
  const [bidAmount, setBidAmount] = useState("");
  const [sellTeamId, setSellTeamId] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const [proposal, setProposal] = useState<{ moves: { lotId: string; teamId: string }[]; leftOver: number; stillNeeded: number } | null>(null);

  const { confirmWithPassword, modal } = usePasswordConfirm();

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/auction");
    if (res.status === 409) {
      const body = await res.json().catch(() => ({}));
      if (/configured/.test(body.error ?? "")) {
        setNeedsSettings(true);
        const seasonBody = await (await fetch("/api/admin/auction/settings")).json();
        setSeason(seasonBody.season ?? null);
      } else {
        setError(body.error ?? "Failed to load auction");
      }
      setLoading(false);
      return;
    }
    const body = await res.json();
    setNeedsSettings(false);
    setSeason(body.season);
    setSettings(body.settings);
    setCurrentLot(body.currentLot);
    setQueue(body.queue ?? []);
    setHeld(body.held ?? []);
    setUnsold(body.unsold ?? []);
    setTeams(body.teams ?? []);
    setClosed(!!body.closed);
    setBlockers(body.closeBlockers ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    load();
  }, [load]);

  /** POSTs to an auction endpoint, surfaces errors, refreshes. Returns the result or null. */
  async function act<T = unknown>(path: string, body?: unknown, okMessage?: string): Promise<T | null> {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/admin/auction/${path}`, {
      method: "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "That didn't work");
      return null;
    }
    await load();
    if (okMessage) setNotice(okMessage);
    return data.result as T;
  }

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
      setError((await res.json().catch(() => ({}))).error ?? "Failed to save settings");
      return;
    }
    load();
  }

  if (loading) return <p className="text-muted-foreground">Loading…</p>;
  if (!season) return <p className="text-muted-foreground">No active season.</p>;
  if (season.teamFormation !== "AUCTION") {
    return <p className="text-muted-foreground">&quot;{season.name}&quot; isn&apos;t an AUCTION-formation season.</p>;
  }

  if (needsSettings || !settings) {
    return (
      <div>
        <h1 className="mb-6 heading-display text-2xl">Auction — Settings</h1>
        <form onSubmit={saveSettings} className="max-w-sm space-y-3 rounded-2xl border border-line bg-surface p-5">
          {([["Budget per team", budgetPerTeam, setBudgetPerTeam], ["Base price", basePrice, setBasePrice], ["Bid increment", bidIncrement, setBidIncrement]] as const).map(([label, value, set]) => (
            <label key={label} className="block">
              <span className="mb-1 block text-sm font-medium">{label}</span>
              <input type="number" value={value} onChange={(e) => set(Number(e.target.value))} className={FIELD + " w-full"} />
            </label>
          ))}
          {error && <p className="text-sm text-live">{error}</p>}
          <button type="submit" disabled={busy} className="rounded-full bg-pitch px-5 py-2 text-sm font-bold text-white disabled:opacity-40">
            Save & start
          </button>
        </form>
      </div>
    );
  }

  const teamName = (id: string | null) => teams.find((t) => t.teamId === id)?.teamName ?? "";
  const leaderId = currentLot?.currentBidTeamId ?? null;
  const leaderBid = currentLot?.currentBid ?? null;
  const resolved = !currentLot && queue.length === 0;
  const waiting = held.length + unsold.length;

  async function undo() {
    if (!(await confirmWithPassword("Undo the last sale / unsold / hold?"))) return;
    act("undo");
  }

  return (
    <div>
      {modal}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="heading-display text-2xl">Auction</h1>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>
            {queue.length} queued · {held.length} held · {unsold.length} unsold
          </span>
          <Link href="/stage/auction" target="_blank" className="font-bold text-pitch underline">
            Open projector view ↗
          </Link>
        </div>
      </div>

      {closed && (
        <p className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-pitch bg-pitch/10 p-3 text-sm text-pitch-dark">
          The auction is closed — the projector is showing the final squads.
          <button onClick={() => act("reopen", {}, "Auction reopened.")} className="underline">
            Reopen
          </button>
        </p>
      )}
      {error && <p className="mb-4 text-sm text-live">{error}</p>}
      {notice && <p className="mb-4 text-sm text-pitch">{notice}</p>}

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
              <div className="flex-1">
                <p className="text-lg font-bold">{currentLot.player.name}</p>
                <p className="text-sm text-muted-foreground">
                  {currentLot.player.position ?? "No position"} · base {settings.basePrice} · step {settings.bidIncrement}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase text-muted-foreground">Leading bid</p>
                <p className="text-3xl font-black" data-testid="leading-bid">
                  {leaderBid ?? "—"}
                </p>
                <p className="text-sm font-medium">{leaderId ? teamName(leaderId) : "no bids yet"}</p>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-line p-3">
              <span className="basis-full text-xs font-bold uppercase text-muted-foreground">Record a bid (shows on the projector)</span>
              <select aria-label="Bidding team" value={bidTeamId} onChange={(e) => setBidTeamId(e.target.value)} className={FIELD}>
                <option value="">Team…</option>
                {teams.map((t) => (
                  <option key={t.teamId} value={t.teamId}>
                    {t.teamName} (max {t.maxAllowableBid})
                  </option>
                ))}
              </select>
              <input aria-label="Bid amount" type="number" value={bidAmount} onChange={(e) => setBidAmount(e.target.value)} placeholder={String((leaderBid ?? settings.basePrice - settings.bidIncrement) + settings.bidIncrement)} className={FIELD + " w-28"} />
              <button
                disabled={busy || !bidTeamId || !bidAmount}
                onClick={async () => {
                  if (await act("bid", { teamId: bidTeamId, amount: Number(bidAmount) })) setBidAmount("");
                }}
                className="rounded-full border border-pitch px-4 py-2 text-sm font-bold text-pitch disabled:opacity-40"
              >
                Record bid
              </button>
              {leaderBid != null && (
                <button disabled={busy} onClick={() => act("bid", { clear: true })} className="text-sm underline">
                  Clear bids
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-end gap-3">
              {leaderId && leaderBid != null && (
                <button
                  disabled={busy}
                  onClick={() => act("sell", { teamId: leaderId, price: leaderBid }, `Sold to ${teamName(leaderId)} for ${leaderBid}.`)}
                  className="rounded-full bg-pitch px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
                >
                  Sold to {teamName(leaderId)} for {leaderBid}
                </button>
              )}
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">Sell to someone else / other price</summary>
                <div className="mt-2 flex flex-wrap items-end gap-3">
                  <select aria-label="Sold to" value={sellTeamId} onChange={(e) => setSellTeamId(e.target.value)} className={FIELD}>
                    <option value="">Select team…</option>
                    {teams.map((t) => (
                      <option key={t.teamId} value={t.teamId}>
                        {t.teamName} (max {t.maxAllowableBid})
                      </option>
                    ))}
                  </select>
                  <input aria-label="Sale price" type="number" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} className={FIELD + " w-28"} />
                  <button disabled={busy || !sellTeamId || !sellPrice} onClick={() => act("sell", { teamId: sellTeamId, price: Number(sellPrice) })} className="rounded-full bg-pitch px-5 py-2 text-sm font-bold text-white disabled:opacity-40">
                    Sold
                  </button>
                </div>
              </details>
              <button disabled={busy} onClick={() => act("unsold")} className="rounded-full border border-live px-5 py-2 text-sm font-bold text-live disabled:opacity-40">
                Unsold
              </button>
              <button disabled={busy} onClick={() => act("hold")} className="rounded-full border border-line px-5 py-2 text-sm font-bold disabled:opacity-40" title="Park this player until the end of the auction">
                Hold till the end
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground">No lot currently up.</p>
            <div className="flex gap-3">
              <button onClick={() => act("next")} disabled={busy || closed || queue.length === 0} className="rounded-full bg-pitch px-5 py-2 text-sm font-bold text-white disabled:opacity-40">
                Next lot
              </button>
              {unsold.length > 0 && queue.length === 0 && !closed && (
                <button onClick={() => act("requeue-unsold")} disabled={busy} className="rounded-full border border-line px-5 py-2 text-sm font-bold disabled:opacity-40">
                  Requeue {unsold.length} unsold for another round
                </button>
              )}
            </div>
          </div>
        )}
        <button onClick={undo} disabled={busy || closed} className="mt-4 rounded-full border border-line px-4 py-1.5 text-xs font-medium text-muted-foreground disabled:opacity-40">
          Undo last result
        </button>
      </section>

      {held.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">On hold ({held.length})</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface text-sm">
            {held.map((l) => (
              <PlaceRow key={l.id} lot={l} teams={teams} busy={busy || closed} onAssign={(teamId, free) => act("assign", { lotId: l.id, teamId, free })} extra={
                <button onClick={() => act("unhold", { lotId: l.id })} disabled={busy || closed} className="text-xs underline">
                  Back to queue
                </button>
              } />
            ))}
          </ul>
        </section>
      )}

      {resolved && !closed && (
        <section className="mb-6 rounded-2xl border border-line bg-surface p-5" aria-label="Wrap-up">
          <h2 className="mb-1 text-lg font-bold">Wrap-up</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Everyone has been through the room. Place the {waiting} held / unsold player(s) — directly, or with a fair draw to the teams still short of {season.squadSizeMin ?? "the minimum"} players — then close.
          </p>
          {unsold.length > 0 && (
            <ul className="mb-4 divide-y divide-line overflow-hidden rounded-xl border border-line text-sm">
              {unsold.map((l) => (
                <PlaceRow key={l.id} lot={l} teams={teams} busy={busy} onAssign={(teamId, free) => act("assign", { lotId: l.id, teamId, free })} tag="unsold" />
              ))}
            </ul>
          )}
          {waiting > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <button
                disabled={busy}
                onClick={async () => setProposal(await act("draw", { seed }))}
                className="rounded-full border border-pitch px-4 py-1.5 text-sm font-bold text-pitch"
              >
                Preview fair draw
              </button>
              <button onClick={() => { setSeed(Math.floor(Math.random() * 1_000_000)); setProposal(null); }} className="text-sm underline">
                Re-roll
              </button>
              <button
                disabled={busy || !proposal || proposal.moves.length === 0}
                onClick={async () => {
                  if (await act("draw", { seed, apply: true }, "Draw applied.")) setProposal(null);
                }}
                className="rounded-full bg-pitch px-5 py-1.5 text-sm font-bold text-white disabled:opacity-40"
              >
                Apply this draw
              </button>
              {proposal && (
                <span className="text-xs text-muted-foreground">
                  {proposal.moves.length} placed{proposal.stillNeeded > 0 ? `, ${proposal.stillNeeded} slot(s) still unfilled` : ""}:{" "}
                  {proposal.moves.map((m) => `${[...held, ...unsold].find((l) => l.id === m.lotId)?.player.name} → ${teamName(m.teamId)}`).join(", ") || "nobody needs a player"}
                </span>
              )}
            </div>
          )}
          {blockers.length > 0 ? (
            <ul className="mb-3 list-disc pl-5 text-sm text-amber-600" aria-label="Before you can close">
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : (
            <p className="mb-3 text-sm text-pitch">Every team has a legal squad — ready to close.</p>
          )}
          <button
            disabled={busy || blockers.length > 0}
            onClick={async () => {
              if (!(await confirmWithPassword("Close the auction? Sales stop and the projector shows the final squads."))) return;
              act("close", {}, "Auction closed.");
            }}
            className="rounded-full bg-pitch px-6 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            Close auction
          </button>
          <p className="mt-2 text-xs text-muted-foreground">Players still unplaced when you close are simply left out of the edition.</p>
        </section>
      )}

      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Teams</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
        {teams.map((t) => (
          <div key={t.teamId} className="rounded-2xl border border-line bg-surface p-4">
            <p className="mb-1 flex items-center gap-2 font-bold">
              <Crest size={22} name={t.teamName} />
              {t.teamName}
            </p>
            <p className="text-sm text-muted-foreground">
              Squad: {t.squadCount}
              {season.squadSizeMin ? ` / min ${season.squadSizeMin}` : ""}
            </p>
            <p className="text-sm text-muted-foreground">Remaining: {t.remainingBudget}</p>
            <p className="text-sm text-muted-foreground">Max bid: {t.maxAllowableBid}</p>
          </div>
        ))}
        {teams.length === 0 && <p className="text-sm text-muted-foreground">No teams yet — create some via Teams first.</p>}
      </div>

      {queue.length > 0 && (
        <>
          <h2 className="mb-3 mt-6 text-sm font-bold uppercase tracking-wide text-muted-foreground">Up next</h2>
          <ol className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface text-sm">
            {queue.slice(0, 10).map((l, i) => (
              <PlaceRow key={l.id} lot={l} teams={teams} busy={busy || closed} index={i + 1} retain onAssign={(teamId, free) => act("assign", { lotId: l.id, teamId, free })} />
            ))}
          </ol>
          <p className="mt-2 text-xs text-muted-foreground">&ldquo;Retain&rdquo; places a player with a team before bidding (at no charge) — use it for captains or kept players.</p>
        </>
      )}
    </div>
  );
}

/** A lot row with a "place with a team" control: free, or at the base price. */
function PlaceRow({
  lot,
  teams,
  busy,
  onAssign,
  extra,
  tag,
  index,
  retain,
}: {
  lot: ListedLot;
  teams: TeamStatus[];
  busy: boolean;
  onAssign: (teamId: string, free: boolean) => void;
  extra?: React.ReactNode;
  tag?: string;
  index?: number;
  retain?: boolean;
}) {
  const [team, setTeam] = useState("");
  const [free, setFree] = useState(true);
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-2">
      {index !== undefined && <span className="w-5 text-muted-foreground">{index}</span>}
      <span className="min-w-0 flex-1 font-medium">
        {lot.player.name}
        {lot.player.position && <span className="ml-2 text-xs font-normal text-muted-foreground">{lot.player.position}</span>}
        {tag && <span className="ml-2 rounded-full bg-line px-2 py-0.5 text-[10px] font-bold uppercase">{tag}</span>}
      </span>
      {extra}
      <select aria-label={`Place ${lot.player.name} with`} value={team} onChange={(e) => setTeam(e.target.value)} className="rounded border border-line bg-background px-2 py-1 text-xs">
        <option value="">{retain ? "Retain with…" : "Place with…"}</option>
        {teams.map((t) => (
          <option key={t.teamId} value={t.teamId}>
            {t.teamName}
          </option>
        ))}
      </select>
      {!retain && (
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} /> no charge
        </label>
      )}
      <button
        disabled={busy || !team}
        onClick={() => {
          onAssign(team, retain ? true : free);
          setTeam("");
        }}
        className="rounded-full border border-pitch px-3 py-1 text-xs font-bold text-pitch disabled:opacity-40"
      >
        {retain ? "Retain" : "Place"}
      </button>
    </li>
  );
}
