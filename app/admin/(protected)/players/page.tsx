"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { usePasswordConfirm } from "@/components/PasswordConfirm";
import { useRequireAdminRole } from "@/components/useRequireAdminRole";

type Team = { id: string; name: string };
type PlayerPosition = "GK" | "DEF" | "MID" | "FWD" | null;
type Player = {
  id: string;
  name: string;
  jerseyNumber: number;
  position: PlayerPosition;
  isCaptain: boolean;
  photoUrl: string | null;
  teamId: string;
  team: Team;
};

const POSITION_LABELS: Record<string, string> = {
  GK: "GK",
  DEF: "DEF",
  MID: "MID",
  FWD: "FWD",
};

export default function PlayersAdminPage() {
  useRequireAdminRole();
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTeamId, setFilterTeamId] = useState("");
  const [name, setName] = useState("");
  const [jerseyNumber, setJerseyNumber] = useState("");
  const [teamId, setTeamId] = useState("");
  const [position, setPosition] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { confirmWithPassword, modal } = usePasswordConfirm();

  async function load() {
    const [teamsRes, playersRes] = await Promise.all([
      fetch("/api/admin/teams"),
      fetch("/api/admin/players"),
    ]);
    const teamsBody = await teamsRes.json();
    const playersBody = await playersRes.json();
    setTeams(teamsBody.teams ?? []);
    setPlayers(playersBody.players ?? []);
    setLoading(false);
  }

  useEffect(() => {
    let ignore = false;
    (async () => {
      const [teamsRes, playersRes] = await Promise.all([
        fetch("/api/admin/teams"),
        fetch("/api/admin/players"),
      ]);
      const teamsBody = await teamsRes.json();
      const playersBody = await playersRes.json();
      if (!ignore) {
        setTeams(teamsBody.teams ?? []);
        setPlayers(playersBody.players ?? []);
        setLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  const visiblePlayers = useMemo(
    () => (filterTeamId ? players.filter((p) => p.teamId === filterTeamId) : players),
    [players, filterTeamId],
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/admin/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        jerseyNumber: Number(jerseyNumber),
        teamId,
        position: position || null,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to create player");
      return;
    }
    setName("");
    setJerseyNumber("");
    setPosition("");
    load();
  }

  async function handlePositionChange(player: Player, next: string) {
    await fetch(`/api/admin/players/${player.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ position: next || null }),
    });
    load();
  }

  async function handleToggleCaptain(player: Player) {
    await fetch(`/api/admin/players/${player.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isCaptain: !player.isCaptain }),
    });
    load();
  }

  async function handleDelete(player: Player) {
    const confirmed = await confirmWithPassword(`Remove ${player.name}?`);
    if (!confirmed) return;
    await fetch(`/api/admin/players/${player.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      {modal}
      <h1 className="mb-6 heading-display text-2xl">Players</h1>

      <form onSubmit={handleCreate} className="mb-6 flex flex-wrap gap-3 rounded-2xl border border-line bg-surface p-4">
        <select
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          required
          className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
        >
          <option value="" disabled>
            Team
          </option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Player name"
          required
          className="flex-1 min-w-40 rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
        />
        <input
          value={jerseyNumber}
          onChange={(e) => setJerseyNumber(e.target.value)}
          placeholder="#"
          type="number"
          min={0}
          required
          className="w-20 rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
        />
        <select
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
        >
          <option value="">Extra (bench)</option>
          <option value="GK">Goalkeeper</option>
          <option value="DEF">Defender</option>
          <option value="MID">Midfielder</option>
          <option value="FWD">Forward</option>
        </select>
        <button type="submit" className="rounded-full bg-pitch px-5 py-2 text-sm font-bold text-white">
          Add player
        </button>
      </form>
      {error && <p className="mb-4 text-sm text-live">{error}</p>}

      <div className="mb-4">
        <select
          value={filterTeamId}
          onChange={(e) => setFilterTeamId(e.target.value)}
          className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
        >
          <option value="">All teams</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {visiblePlayers.map((player) => (
            <li key={player.id} className="flex items-center justify-between px-5 py-3.5">
              <div className="flex items-center">
                {player.photoUrl ? (
                  <Image
                    src={player.photoUrl}
                    alt={player.name}
                    width={28}
                    height={28}
                    className="mr-2 rounded-full object-cover"
                  />
                ) : (
                  <span className="mr-2 h-7 w-7 rounded-full bg-line" />
                )}
                <span className="mr-2 text-muted">#{player.jerseyNumber}</span>
                <span className="font-medium">{player.name}</span>
                {player.isCaptain && (
                  <span className="ml-1.5 rounded-full bg-brand/15 px-1.5 py-0.5 text-[10px] font-bold text-brand">
                    C
                  </span>
                )}
                <span className="ml-3 text-xs text-muted">{player.team.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleToggleCaptain(player)}
                  title={player.isCaptain ? "Remove captain" : "Make captain"}
                  className={
                    "text-lg leading-none " + (player.isCaptain ? "text-brand" : "text-line hover:text-muted")
                  }
                >
                  ★
                </button>
                <select
                  value={player.position ?? ""}
                  onChange={(e) => handlePositionChange(player, e.target.value)}
                  className="rounded-lg border border-line bg-background px-2 py-1 text-xs outline-none focus:border-pitch"
                >
                  <option value="">Extra</option>
                  <option value="GK">{POSITION_LABELS.GK}</option>
                  <option value="DEF">{POSITION_LABELS.DEF}</option>
                  <option value="MID">{POSITION_LABELS.MID}</option>
                  <option value="FWD">{POSITION_LABELS.FWD}</option>
                </select>
                <button onClick={() => handleDelete(player)} className="text-sm font-medium text-live">
                  Delete
                </button>
              </div>
            </li>
          ))}
          {visiblePlayers.length === 0 && (
            <li className="px-5 py-6 text-center text-muted">No players yet.</li>
          )}
        </ul>
      )}
    </div>
  );
}
