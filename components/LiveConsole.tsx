"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePasswordConfirm } from "@/components/PasswordConfirm";

type Team = { id: string; name: string };
type Player = { id: string; name: string; jerseyNumber: number; photoUrl: string | null };
type EventRow = {
  id: string;
  type: "GOAL" | "ASSIST" | "YELLOW_CARD" | "RED_CARD";
  player: { name: string };
  team: { name: string };
  sequence: number;
};
type Match = {
  id: string;
  status: "SCHEDULED" | "LIVE" | "FINISHED";
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeam: Team | null;
  awayTeam: Team | null;
  homeScore: number;
  awayScore: number;
  events: EventRow[];
};

type OpenPanel = { teamId: string; mode: "goal" | "card" } | null;

const EVENT_LABELS: Record<EventRow["type"], string> = {
  GOAL: "⚽",
  ASSIST: "🅰️",
  YELLOW_CARD: "🟨",
  RED_CARD: "🟥",
};

export function LiveConsole({ matchId }: { matchId: string }) {
  const router = useRouter();
  const [match, setMatch] = useState<Match | null>(null);
  const [homePlayers, setHomePlayers] = useState<Player[]>([]);
  const [awayPlayers, setAwayPlayers] = useState<Player[]>([]);
  const [open, setOpen] = useState<OpenPanel>(null);
  const [scorerId, setScorerId] = useState("");
  const [assistId, setAssistId] = useState("");
  const [cardPlayerId, setCardPlayerId] = useState("");
  const [cardType, setCardType] = useState<"YELLOW_CARD" | "RED_CARD">("YELLOW_CARD");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { confirmWithPassword, modal } = usePasswordConfirm();

  async function load() {
    const res = await fetch(`/api/admin/fixtures/${matchId}`);
    const body = await res.json();
    const m: Match = body.match;
    setMatch(m);
    if (m?.homeTeamId) {
      const r = await fetch(`/api/admin/players?teamId=${m.homeTeamId}`);
      setHomePlayers((await r.json()).players ?? []);
    }
    if (m?.awayTeamId) {
      const r = await fetch(`/api/admin/players?teamId=${m.awayTeamId}`);
      setAwayPlayers((await r.json()).players ?? []);
    }
  }

  useEffect(() => {
    let ignore = false;
    (async () => {
      const res = await fetch(`/api/admin/fixtures/${matchId}`);
      const body = await res.json();
      const m: Match = body.match;
      const [homeRes, awayRes] = await Promise.all([
        m?.homeTeamId ? fetch(`/api/admin/players?teamId=${m.homeTeamId}`) : null,
        m?.awayTeamId ? fetch(`/api/admin/players?teamId=${m.awayTeamId}`) : null,
      ]);
      const home = homeRes ? (await homeRes.json()).players ?? [] : [];
      const away = awayRes ? (await awayRes.json()).players ?? [] : [];
      if (!ignore) {
        setMatch(m);
        setHomePlayers(home);
        setAwayPlayers(away);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [matchId]);

  if (!match) return <p className="text-muted">Loading…</p>;

  function openPanel(teamId: string, mode: "goal" | "card") {
    setOpen({ teamId, mode });
    setScorerId("");
    setAssistId("");
    setCardPlayerId("");
    setCardType("YELLOW_CARD");
    setError(null);
  }

  async function submitGoal(teamId: string) {
    if (!scorerId) {
      setError("Pick a scorer");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/fixtures/${matchId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "GOAL",
        teamId,
        playerId: scorerId,
        assistPlayerId: assistId || null,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to log goal");
      return;
    }
    setOpen(null);
    load();
  }

  async function submitCard(teamId: string) {
    if (!cardPlayerId) {
      setError("Pick a player");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/fixtures/${matchId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: cardType, teamId, playerId: cardPlayerId }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to log card");
      return;
    }
    setOpen(null);
    load();
  }

  async function undo() {
    const confirmed = await confirmWithPassword("Undo the last logged event?");
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/fixtures/${matchId}/events/latest`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Nothing to undo");
      return;
    }
    load();
  }

  async function finish() {
    if (!confirm("Finish this match? Scores will be final.")) return;
    setBusy(true);
    const res = await fetch(`/api/admin/fixtures/${matchId}/finish`, { method: "POST" });
    setBusy(false);
    if (res.ok) {
      router.push("/admin/fixtures");
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to finish match");
    }
  }

  const isLive = match.status === "LIVE";

  return (
    <div>
      {modal}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="heading-display text-2xl">Live Console</h1>
        <span
          className={
            "rounded-full px-3 py-1 text-xs font-bold " +
            (isLive ? "bg-live/10 text-live" : "bg-line text-muted")
          }
        >
          {match.status}
        </span>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TeamPanel
          team={match.homeTeam}
          score={match.homeScore}
          players={homePlayers}
          open={open?.teamId === match.homeTeamId ? open.mode : null}
          disabled={!isLive}
          onOpenGoal={() => match.homeTeamId && openPanel(match.homeTeamId, "goal")}
          onOpenCard={() => match.homeTeamId && openPanel(match.homeTeamId, "card")}
          onClose={() => setOpen(null)}
          onSubmitGoal={() => match.homeTeamId && submitGoal(match.homeTeamId)}
          onSubmitCard={() => match.homeTeamId && submitCard(match.homeTeamId)}
          scorerId={scorerId}
          setScorerId={setScorerId}
          assistId={assistId}
          setAssistId={setAssistId}
          cardPlayerId={cardPlayerId}
          setCardPlayerId={setCardPlayerId}
          cardType={cardType}
          setCardType={setCardType}
          busy={busy}
        />
        <TeamPanel
          team={match.awayTeam}
          score={match.awayScore}
          players={awayPlayers}
          open={open?.teamId === match.awayTeamId ? open.mode : null}
          disabled={!isLive}
          onOpenGoal={() => match.awayTeamId && openPanel(match.awayTeamId, "goal")}
          onOpenCard={() => match.awayTeamId && openPanel(match.awayTeamId, "card")}
          onClose={() => setOpen(null)}
          onSubmitGoal={() => match.awayTeamId && submitGoal(match.awayTeamId)}
          onSubmitCard={() => match.awayTeamId && submitCard(match.awayTeamId)}
          scorerId={scorerId}
          setScorerId={setScorerId}
          assistId={assistId}
          setAssistId={setAssistId}
          cardPlayerId={cardPlayerId}
          setCardPlayerId={setCardPlayerId}
          cardType={cardType}
          setCardType={setCardType}
          busy={busy}
        />
      </div>

      {error && <p className="mb-4 text-sm text-live">{error}</p>}

      <div className="mb-6 flex flex-wrap gap-3">
        <button
          onClick={undo}
          disabled={busy || match.events.length === 0}
          className="rounded-full border border-line px-5 py-2 text-sm font-medium disabled:opacity-40"
        >
          Undo last event
        </button>
        {isLive && (
          <button
            onClick={finish}
            disabled={busy}
            className="rounded-full bg-pitch px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
          >
            Finish match
          </button>
        )}
      </div>

      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">Events</h2>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {match.events.map((e) => (
          <li key={e.id} className="flex justify-between px-5 py-3 text-sm">
            <span>
              {EVENT_LABELS[e.type]} {e.player.name}
              <span className="ml-1.5 text-xs text-muted">({e.team.name})</span>
            </span>
          </li>
        ))}
        {match.events.length === 0 && (
          <li className="px-5 py-6 text-center text-muted">No events yet.</li>
        )}
      </ul>
    </div>
  );
}

function TeamPanel({
  team,
  score,
  players,
  open,
  disabled,
  onOpenGoal,
  onOpenCard,
  onClose,
  onSubmitGoal,
  onSubmitCard,
  scorerId,
  setScorerId,
  assistId,
  setAssistId,
  cardPlayerId,
  setCardPlayerId,
  cardType,
  setCardType,
  busy,
}: {
  team: Team | null;
  score: number;
  players: Player[];
  open: "goal" | "card" | null;
  disabled: boolean;
  onOpenGoal: () => void;
  onOpenCard: () => void;
  onClose: () => void;
  onSubmitGoal: () => void;
  onSubmitCard: () => void;
  scorerId: string;
  setScorerId: (v: string) => void;
  assistId: string;
  setAssistId: (v: string) => void;
  cardPlayerId: string;
  setCardPlayerId: (v: string) => void;
  cardType: "YELLOW_CARD" | "RED_CARD";
  setCardType: (v: "YELLOW_CARD" | "RED_CARD") => void;
  busy: boolean;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 text-center">
      <p className="font-bold">{team?.name ?? "TBD"}</p>
      <p className="my-2 heading-display text-4xl tabular-nums">{score}</p>
      {!open ? (
        <div className="flex justify-center gap-2">
          <button
            onClick={onOpenGoal}
            disabled={disabled || !team}
            className="rounded-full bg-pitch px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            + Goal
          </button>
          <button
            onClick={onOpenCard}
            disabled={disabled || !team}
            className="rounded-full border border-line px-4 py-2 text-sm font-bold disabled:opacity-40"
          >
            🟨 Card
          </button>
        </div>
      ) : open === "goal" ? (
        <div className="space-y-2.5 text-left">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Scorer</p>
            <PlayerPicker players={players} value={scorerId} onChange={setScorerId} placeholder="Select scorer…" />
          </div>
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Assist</p>
            <PlayerPicker
              players={players.filter((p) => p.id !== scorerId)}
              value={assistId}
              onChange={setAssistId}
              placeholder="No assist"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={onSubmitGoal}
              disabled={busy}
              className="flex-1 rounded-full bg-pitch px-3 py-1.5 text-sm font-bold text-white disabled:opacity-60"
            >
              Log goal
            </button>
            <button onClick={onClose} className="rounded-full border border-line px-3 py-1.5 text-sm">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5 text-left">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Player</p>
            <PlayerPicker players={players} value={cardPlayerId} onChange={setCardPlayerId} placeholder="Select player…" />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setCardType("YELLOW_CARD")}
              className={
                "flex-1 rounded-lg border px-2 py-1.5 text-sm font-bold " +
                (cardType === "YELLOW_CARD" ? "border-yellow-500 bg-yellow-400/20" : "border-line")
              }
            >
              🟨 Yellow
            </button>
            <button
              type="button"
              onClick={() => setCardType("RED_CARD")}
              className={
                "flex-1 rounded-lg border px-2 py-1.5 text-sm font-bold " +
                (cardType === "RED_CARD" ? "border-live bg-live/20" : "border-line")
              }
            >
              🟥 Red
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onSubmitCard}
              disabled={busy}
              className="flex-1 rounded-full bg-foreground px-3 py-1.5 text-sm font-bold text-background disabled:opacity-60"
            >
              Log card
            </button>
            <button onClick={onClose} className="rounded-full border border-line px-3 py-1.5 text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Dropdown player select — a compact button showing the current pick that
 * expands into a scrollable list of photo+name rows, instead of an
 * always-expanded grid (which ate too much space with two pickers per
 * team panel, especially on a phone pitch-side). */
function PlayerPicker({
  players,
  value,
  onChange,
  placeholder,
}: {
  players: Player[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = players.find((p) => p.id === value) ?? null;

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function pick(id: string) {
    onChange(id);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-block border-2 border-line bg-background px-2.5 py-2 text-sm font-medium"
      >
        {selected ? (
          <>
            <PlayerAvatar player={selected} />
            <span className="min-w-0 flex-1 truncate text-left">{selected.name}</span>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate text-left text-muted">{placeholder}</span>
        )}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className={"shrink-0 transition-transform duration-150 " + (open ? "rotate-180" : "")}
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-60 overflow-y-auto rounded-block-lg border-2 border-line-strong bg-surface shadow-block"
        >
          <button
            type="button"
            onClick={() => pick("")}
            className={
              "block w-full px-3 py-2 text-left text-sm " +
              (value === "" ? "bg-pitch/10 font-bold text-pitch-dark" : "text-muted hover:bg-background")
            }
          >
            {placeholder}
          </button>
          {players.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => pick(p.id)}
              role="option"
              aria-selected={value === p.id}
              className={
                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm " +
                (value === p.id ? "bg-pitch/10 font-bold" : "hover:bg-background")
              }
            >
              <PlayerAvatar player={p} />
              <span className="truncate">
                #{p.jerseyNumber} {p.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PlayerAvatar({ player }: { player: Player }) {
  if (player.photoUrl) {
    return (
      <span className="relative h-7 w-7 shrink-0 overflow-hidden rounded-block border border-line-strong">
        <Image src={player.photoUrl} alt={player.name} fill sizes="28px" className="object-cover" />
      </span>
    );
  }
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-block bg-line text-[10px] font-bold">
      {player.jerseyNumber}
    </span>
  );
}
