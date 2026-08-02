"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { usePasswordConfirm } from "@/components/PasswordConfirm";
import { Crest } from "@/components/Crest";

type Team = {
  id: string;
  name: string;
  shortName: string | null;
  managerName: string | null;
  logoUrl: string | null;
  _count: { players: number };
};

export default function TeamsAdminPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [managerName, setManagerName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { confirmWithPassword, modal } = usePasswordConfirm();

  async function load() {
    const res = await fetch("/api/admin/teams");
    const body = await res.json();
    setTeams(body.teams ?? []);
    setLoading(false);
  }

  useEffect(() => {
    let ignore = false;
    (async () => {
      const res = await fetch("/api/admin/teams");
      const body = await res.json();
      if (!ignore) {
        setTeams(body.teams ?? []);
        setLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/admin/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        shortName: shortName || null,
        managerName: managerName || null,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to create team");
      return;
    }
    setName("");
    setShortName("");
    setManagerName("");
    load();
  }

  async function handleRename(team: Team) {
    const nextName = prompt("Team name", team.name);
    if (nextName == null || nextName === team.name) return;
    await fetch(`/api/admin/teams/${team.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nextName }),
    });
    load();
  }

  async function handleEditManager(team: Team) {
    const next = prompt("Manager name", team.managerName ?? "");
    if (next == null) return;
    await fetch(`/api/admin/teams/${team.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ managerName: next || null }),
    });
    load();
  }

  async function handleDelete(team: Team) {
    const confirmed = await confirmWithPassword(`Delete ${team.name}? This also deletes its players.`);
    if (!confirmed) return;
    await fetch(`/api/admin/teams/${team.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      {modal}
      <h1 className="mb-6 heading-display text-2xl">Teams</h1>

      <form onSubmit={handleCreate} className="mb-6 flex flex-wrap gap-3 rounded-2xl border border-line bg-surface p-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Team name"
          required
          className="flex-1 min-w-40 rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
        />
        <input
          value={shortName}
          onChange={(e) => setShortName(e.target.value)}
          placeholder="Short name (optional)"
          className="w-36 rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
        />
        <input
          value={managerName}
          onChange={(e) => setManagerName(e.target.value)}
          placeholder="Manager (optional)"
          className="w-44 rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
        />
        <button type="submit" className="rounded-full bg-pitch px-5 py-2 text-sm font-bold text-white">
          Add team
        </button>
      </form>
      {error && <p className="mb-4 text-sm text-live">{error}</p>}

      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {teams.map((team) => (
            <li key={team.id} className="flex items-center justify-between px-5 py-3.5">
              <div className="flex items-center">
                {team.logoUrl ? (
                  <Image
                    src={team.logoUrl}
                    alt={team.name}
                    width={35}
                    height={35}
                    className="mr-3 h-[35px] w-[35px] rounded-full object-cover"
                  />
                ) : (
                  <span className="mr-3 inline-flex">
                    <Crest size={35} name={team.name} />
                  </span>
                )}
                <span className="font-medium">{team.name}</span>
                {team.shortName && <span className="ml-2 text-sm text-muted">({team.shortName})</span>}
                <span className="ml-3 text-xs text-muted">{team._count.players} players</span>
                {team.managerName && (
                  <span className="ml-3 text-xs text-muted">Manager: {team.managerName}</span>
                )}
              </div>
              <div className="flex gap-3 text-sm font-medium">
                <button onClick={() => handleRename(team)} className="text-muted hover:text-foreground">
                  Rename
                </button>
                <button onClick={() => handleEditManager(team)} className="text-muted hover:text-foreground">
                  Manager
                </button>
                <button onClick={() => handleDelete(team)} className="text-live">
                  Delete
                </button>
              </div>
            </li>
          ))}
          {teams.length === 0 && <li className="px-5 py-6 text-center text-muted">No teams yet.</li>}
        </ul>
      )}
    </div>
  );
}
