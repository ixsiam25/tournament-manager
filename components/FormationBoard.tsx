"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BatchBadge } from "@/components/BatchBadge";

type Pos = "GK" | "DEF" | "MID" | "FWD";
type BoardPlayer = {
  id: string;
  name: string;
  jerseyNumber: number;
  position: Pos | null;
  isCaptain: boolean;
  affiliation: string | null;
};
type Board = {
  season: { id: string; name: string; teamFormation: Strategy | "UNDECIDED"; squadSizeMin: number | null; squadSizeMax: number | null; registrationOpen: boolean; batchMeaning: "entry" | "graduation"; batchDate: string };
  applications: { pending: number; approved: number };
  inPlay: boolean;
  teams: { id: string; name: string; players: BoardPlayer[] }[];
  pool: BoardPlayer[];
  draft: { order: string[]; picks: { playerId: string; teamId: string }[]; onTheClock: string | null } | null;
};
type Strategy = "BATCH" | "MANUAL" | "DRAFT" | "BALANCED_RANDOM" | "AUCTION";
type Move = { playerId: string; teamId: string };

const STRATEGIES: { value: Strategy; label: string; help: string }[] = [
  { value: "BATCH", label: "By batch (Fall/Spring intake)", help: "One team per intake batch — e.g. “Fall 24”, shown with its current semester. Alumni batches are gathered into one Alumni team. Press “Group by batch” to build them from the applications." },
  { value: "MANUAL", label: "Manual", help: "Drag players from the pool onto teams — or use each player's “Move to” menu." },
  { value: "BALANCED_RANDOM", label: "Balanced random", help: "Deals the pool across teams evenly, spreading positions (and strength once ratings exist). Preview, re-roll, then apply." },
  { value: "DRAFT", label: "Snake draft", help: "Captains pick in turn, the order reversing each round. Start the draft, then pick for the team on the clock." },
  { value: "AUCTION", label: "Auction", help: "Players are sold to teams in the auction console." },
];

const POS_STYLE: Record<string, string> = { GK: "bg-amber-500/20", DEF: "bg-sky-500/20", MID: "bg-emerald-500/20", FWD: "bg-rose-500/20" };

/** Organiser board for turning approved applicants into squads, whichever
 * strategy the edition uses. Every move is audited and respects squad size. */
export function FormationBoard() {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const [proposal, setProposal] = useState<{ moves: Move[]; leftover: string[] } | null>(null);
  const [draftOrder, setDraftOrder] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/formation");
    const body = await res.json();
    if (!res.ok) return setError(body.error ?? "Could not load the board");
    setBoard(body);
    setDraftOrder((prev) => (prev.length ? prev.filter((id) => body.teams.some((t: { id: string }) => t.id === id)) : body.teams.map((t: { id: string }) => t.id)));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    load();
  }, [load]);

  async function call(url: string, init: RequestInit, onOk?: (result: unknown) => string | void) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "That didn't work");
      return null;
    }
    const msg = onOk?.(body.result);
    if (msg) setNotice(msg);
    await load();
    return body.result;
  }

  const assign = (playerId: string, teamId: string | null) =>
    call("/api/admin/formation/assign", { method: "POST", body: JSON.stringify({ playerId, teamId }) }).then(() => setProposal(null));

  const teamName = useMemo(() => new Map(board?.teams.map((t) => [t.id, t.name]) ?? []), [board]);
  const proposedTeam = useMemo(() => new Map(proposal?.moves.map((m) => [m.playerId, m.teamId]) ?? []), [proposal]);

  if (!board) return error ? <p className="text-live">{error}</p> : <p className="text-muted-foreground">Loading…</p>;

  if (board.season.teamFormation === "UNDECIDED") {
    const risky = board.season.registrationOpen || board.applications.pending > 0;
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="mb-1 text-lg font-bold">Confirm applicants &amp; choose how teams are formed</h2>
          <p className="text-sm text-muted-foreground">
            {board.applications.approved} approved applicant(s) are ready. Pick how {board.season.name} builds its teams — you can still change your mind until players are sold in an auction.
          </p>
          {risky && (
            <p className="mt-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm" role="alert">
              {board.season.registrationOpen && "Applications are still open. "}
              {board.applications.pending > 0 && `${board.applications.pending} application(s) are still waiting for review. `}
              <Link href="/admin/season" className="font-bold underline">Back to Season setup</Link> to close registration and finish reviewing first — or choose now anyway.
            </p>
          )}
        </div>
        {error && <p className="text-sm text-live">{error}</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {STRATEGIES.map((s) => (
            <div key={s.value} className="flex flex-col justify-between rounded-2xl border border-line bg-surface p-4">
              <div>
                <h3 className="font-bold">{s.label}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.help}</p>
              </div>
              <button
                disabled={busy}
                onClick={() => call("/api/admin/formation/strategy", { method: "PATCH", body: JSON.stringify({ teamFormation: s.value }) })}
                aria-label={`Choose ${s.label}`}
                className="mt-4 self-start rounded-full bg-pitch px-5 py-1.5 text-sm font-bold text-white disabled:opacity-40"
              >
                Choose this
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const strategy = board.season.teamFormation as Strategy;
  const max = board.season.squadSizeMax;
  const min = board.season.squadSizeMin;
  const help = STRATEGIES.find((s) => s.value === strategy)?.help;
  const draftOn = strategy === "DRAFT" && !!board.draft;

  const PlayerChip = ({ p, inPool }: { p: BoardPlayer; inPool: boolean }) => (
    <li
      draggable={!draftOn && strategy !== "AUCTION"}
      onDragStart={() => setDragId(p.id)}
      onDragEnd={() => setDragId(null)}
      className={"flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-line bg-background px-2 py-1.5 text-sm " + (dragId === p.id ? "opacity-50" : "")}
    >
      <span className="min-w-0 basis-full font-medium">
        {!inPool && <span className="mr-1.5 text-xs font-normal text-muted-foreground">#{p.jerseyNumber}</span>}
        {p.name}
        {p.isCaptain && <span className="ml-1 rounded-full bg-brand/15 px-1 text-[10px] font-bold text-brand">C</span>}
        {inPool && p.affiliation && (
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            <BatchBadge label={p.affiliation} meaning={board.season.batchMeaning} date={new Date(board.season.batchDate)} />
          </span>
        )}
      </span>
      {p.position && <span className={"rounded px-1.5 text-[10px] font-bold " + POS_STYLE[p.position]}>{p.position}</span>}
      {inPool && proposedTeam.has(p.id) && <span className="rounded bg-pitch/15 px-1.5 text-[10px] font-bold text-pitch">→ {teamName.get(proposedTeam.get(p.id)!)}</span>}
      {draftOn && inPool && (
        <button disabled={busy} onClick={() => call("/api/admin/formation/draft", { method: "POST", body: JSON.stringify({ action: "pick", playerId: p.id }) })} className="rounded-full bg-pitch px-2 py-0.5 text-[10px] font-bold text-white">
          Pick
        </button>
      )}
      {!draftOn && strategy !== "AUCTION" && (
        <select
          aria-label={`Move ${p.name}`}
          value=""
          onChange={(e) => e.target.value && assign(p.id, e.target.value === "__pool" ? null : e.target.value)}
          className="ml-auto w-24 rounded border border-line bg-background px-1 py-0.5 text-[11px]"
        >
          <option value="">Move to…</option>
          {!inPool && <option value="__pool">Pool</option>}
          {board.teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}
    </li>
  );

  function dropOn(teamId: string | null) {
    return {
      onDragOver: (e: React.DragEvent) => e.preventDefault(),
      onDrop: () => {
        if (dragId) assign(dragId, teamId);
        setDragId(null);
      },
    };
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-4">
        <label className="text-sm font-bold">
          How {board.season.name} builds its teams
          <select
            value={strategy}
            disabled={busy}
            onChange={(e) => call("/api/admin/formation/strategy", { method: "PATCH", body: JSON.stringify({ teamFormation: e.target.value }) })}
            className="ml-3 rounded-lg border border-line bg-background px-3 py-1.5 text-sm font-normal"
          >
            {STRATEGIES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <p className="basis-full text-sm text-muted-foreground">{help}</p>
        <p className="basis-full text-xs text-muted-foreground">
          Squads: {min ?? "?"}–{max ?? "?"} players. {board.pool.length} unassigned, {board.teams.reduce((s, t) => s + t.players.length, 0)} on teams.
          {board.inPlay && " The edition is in play — moves between teams are recorded as transfers."}
        </p>
      </div>

      {error && <p className="text-sm text-live">{error}</p>}
      {notice && <p className="text-sm text-pitch">{notice}</p>}

      {strategy === "AUCTION" && (
        <p className="rounded-lg border border-line bg-surface p-4 text-sm">
          This edition uses an auction. <Link href="/admin/auction" className="font-bold text-pitch underline">Open the auction console</Link> to sell players to teams.
        </p>
      )}

      {strategy === "BATCH" && (
        <button disabled={busy || board.pool.length === 0} onClick={() => call("/api/admin/formation/group", { method: "POST" }, (r) => {
          const x = r as { placed: number; teamsCreated: number; overflow: number; noAffiliation: number };
          return `Placed ${x.placed} player(s), created ${x.teamsCreated} team(s)${x.overflow ? `, ${x.overflow} didn't fit` : ""}${x.noAffiliation ? `, ${x.noAffiliation} have no batch` : ""}.`;
        })} className="rounded-full bg-pitch px-5 py-2 text-sm font-bold text-white disabled:opacity-40">
          Group by batch
        </button>
      )}

      {strategy === "BALANCED_RANDOM" && (
        <div className="flex flex-wrap items-center gap-3">
          <button disabled={busy} onClick={async () => setProposal(await call("/api/admin/formation/balanced", { method: "POST", body: JSON.stringify({ seed }) }))} className="rounded-full border border-pitch px-4 py-1.5 text-sm font-bold text-pitch">
            Preview deal
          </button>
          <button disabled={busy} onClick={() => { setSeed(Math.floor(Math.random() * 1_000_000)); setProposal(null); }} className="text-sm underline">
            Re-roll
          </button>
          <button
            disabled={busy || !proposal}
            onClick={() => call("/api/admin/formation/balanced", { method: "POST", body: JSON.stringify({ seed, apply: true }) }, (r) => `Dealt ${(r as { placed: number }).placed} player(s).`).then(() => setProposal(null))}
            className="rounded-full bg-pitch px-5 py-1.5 text-sm font-bold text-white disabled:opacity-40"
          >
            Apply this deal
          </button>
          {proposal && <span className="text-xs text-muted-foreground">{proposal.moves.length} placed in the preview{proposal.leftover.length ? `, ${proposal.leftover.length} left over (teams full)` : ""}. Applying uses exactly this deal.</span>}
        </div>
      )}

      {strategy === "DRAFT" && (
        <div className="rounded-2xl border border-line bg-surface p-4">
          {draftOn ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm">
                On the clock: <b className="text-pitch">{board.draft!.onTheClock ? teamName.get(board.draft!.onTheClock) : "— everyone is full"}</b>
                <span className="ml-3 text-xs text-muted-foreground">pick {board.draft!.picks.length + 1} · order: {board.draft!.order.map((id) => teamName.get(id)).join(" → ")}</span>
              </span>
              <button disabled={busy || board.draft!.picks.length === 0} onClick={() => call("/api/admin/formation/draft", { method: "POST", body: JSON.stringify({ action: "undo" }) })} className="text-sm underline">Undo last pick</button>
              <button disabled={busy} onClick={() => call("/api/admin/formation/draft", { method: "POST", body: JSON.stringify({ action: "reset" }) })} className="text-sm text-live underline">End draft</button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-bold">Pick order for round 1</p>
              <ol className="space-y-1">
                {draftOrder.map((id, i) => (
                  <li key={id} className="flex items-center gap-2 text-sm">
                    <span className="w-5 text-muted-foreground">{i + 1}.</span>
                    <span className="w-48 truncate">{teamName.get(id)}</span>
                    <button disabled={i === 0} onClick={() => setDraftOrder((o) => swap(o, i, i - 1))} aria-label={`Move ${teamName.get(id)} up`} className="px-1 disabled:opacity-30">↑</button>
                    <button disabled={i === draftOrder.length - 1} onClick={() => setDraftOrder((o) => swap(o, i, i + 1))} aria-label={`Move ${teamName.get(id)} down`} className="px-1 disabled:opacity-30">↓</button>
                  </li>
                ))}
              </ol>
              <div className="flex gap-3">
                <button onClick={() => setDraftOrder((o) => [...o].sort(() => Math.random() - 0.5))} className="text-sm underline">Shuffle order</button>
                <button disabled={busy || draftOrder.length < 2} onClick={() => call("/api/admin/formation/draft", { method: "POST", body: JSON.stringify({ action: "start", order: draftOrder }) })} className="rounded-full bg-pitch px-5 py-1.5 text-sm font-bold text-white disabled:opacity-40">Start draft</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <section {...dropOn(null)} className="rounded-2xl border border-dashed border-line bg-surface p-3 lg:sticky lg:top-24 lg:self-start">
          <h2 className="mb-2 text-sm font-bold">Pool ({board.pool.length})</h2>
          <ul className="max-h-[70vh] space-y-1 overflow-y-auto">
            {board.pool.map((p) => <PlayerChip key={p.id} p={p} inPool />)}
            {board.pool.length === 0 && <li className="py-4 text-center text-xs text-muted-foreground">Nobody waiting for a team.</li>}
          </ul>
        </section>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {board.teams.map((t) => {
            const size = t.players.length;
            const status = max && size > max ? "text-live" : min && size < min ? "text-amber-600" : "text-pitch";
            return (
              <section key={t.id} {...dropOn(t.id)} className={"rounded-2xl border bg-surface p-3 " + (board.draft?.onTheClock === t.id ? "border-pitch ring-2 ring-pitch/30" : "border-line")}>
                <h2 className="mb-2 flex items-center justify-between text-sm font-bold">
                  <span className="truncate">{t.name}</span>
                  <span className={"text-xs " + status}>{size}{max ? ` / ${max}` : ""}</span>
                </h2>
                <ul className="space-y-1">
                  {t.players.map((p) => <PlayerChip key={p.id} p={p} inPool={false} />)}
                  {t.players.length === 0 && <li className="py-4 text-center text-xs text-muted-foreground">Drop players here</li>}
                </ul>
              </section>
            );
          })}
          {board.teams.length === 0 && <p className="text-sm text-muted-foreground">No teams yet — create teams on the Teams page{strategy === "BATCH" ? ", or press “Group by batch”" : ""}.</p>}
        </div>
      </div>
    </div>
  );
}

function swap<T>(arr: T[], a: number, b: number): T[] {
  const next = [...arr];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}
