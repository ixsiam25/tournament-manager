"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePasswordConfirm } from "@/components/PasswordConfirm";
import { useRequireAdminRole } from "@/components/useRequireAdminRole";
import { downscaleToJpeg } from "@/lib/downscaleImage";

type Team = { id: string; name: string };
type Position = "GK" | "DEF" | "MID" | "FWD" | null;
type Player = {
  id: string;
  name: string;
  jerseyNumber: number;
  position: Position;
  isCaptain: boolean;
  photoUrl: string | null;
  status: "ACTIVE" | "RELEASED";
  teamId: string | null;
  team: Team | null;
  person: { identifiers: { value: string }[] };
};

const POSITIONS = ["GK", "DEF", "MID", "FWD"] as const;
const FIELD = "rounded-lg border border-line bg-background px-2 py-1 text-sm outline-none focus:border-pitch";

/** Roster manager: every fact about a player can be corrected here, any time.
 * Moves, releases and replacements are audited (and flagged as transfers once
 * the edition is in play). */
export default function PlayersAdminPage() {
  useRequireAdminRole();
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTeam, setFilterTeam] = useState("");
  const [query, setQuery] = useState("");
  const [showReleased, setShowReleased] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [add, setAdd] = useState({ name: "", studentId: "", jerseyNumber: "", teamId: "", position: "" });
  const { confirmWithPassword, modal } = usePasswordConfirm();
  const photoTarget = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [t, p] = await Promise.all([fetch("/api/admin/teams"), fetch("/api/admin/players?includeReleased=1")]);
    setTeams((await t.json()).teams ?? []);
    setPlayers((await p.json()).players ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    load();
  }, [load]);

  async function api(url: string, method: string, body?: unknown, okMessage?: string) {
    setError(null);
    setNotice(null);
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "That didn't work");
      await load();
      return false;
    }
    await load();
    if (okMessage) setNotice(okMessage);
    return true;
  }

  const patch = (p: Player, change: Record<string, unknown>) => api(`/api/admin/players/${p.id}`, "PATCH", change);

  async function createPlayer(e: React.FormEvent) {
    e.preventDefault();
    const ok = await api(
      "/api/admin/players",
      "POST",
      {
        name: add.name,
        studentId: add.studentId || null,
        teamId: add.teamId || null,
        jerseyNumber: add.teamId ? Number(add.jerseyNumber) : 0,
        position: add.position || null,
      },
      `Added ${add.name}.`,
    );
    if (ok) setAdd({ ...add, name: "", studentId: "", jerseyNumber: "", position: "" });
  }

  async function release(p: Player) {
    const reason = window.prompt(`Release ${p.name} from ${p.team?.name}? Their goals and assists stay on record. Reason (optional):`, "");
    if (reason === null) return;
    api(`/api/admin/players/${p.id}/release`, "POST", { reason }, `${p.name} released.`);
  }

  async function remove(p: Player) {
    if (!(await confirmWithPassword(`Delete ${p.name} for good? (Players with match history can only be released.)`))) return;
    api(`/api/admin/players/${p.id}`, "DELETE", undefined, `${p.name} deleted.`);
  }

  async function uploadPhoto(file: File) {
    const id = photoTarget.current;
    if (!id) return;
    const fd = new FormData();
    fd.append("photo", await downscaleToJpeg(file, "avatar"), "photo.jpg");
    setError(null);
    const res = await fetch(`/api/admin/players/${id}/photo`, { method: "POST", body: fd });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Upload failed");
    else setNotice("Photo updated.");
    await load();
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return players.filter(
      (p) =>
        (showReleased || p.status === "ACTIVE") &&
        (filterTeam === "" ? true : filterTeam === "__pool" ? !p.teamId : p.teamId === filterTeam) &&
        (!q || p.name.toLowerCase().includes(q) || p.person.identifiers.some((i) => i.value.toLowerCase().includes(q))),
    );
  }, [players, filterTeam, query, showReleased]);

  return (
    <div>
      {modal}
      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) uploadPhoto(f);
          e.target.value = "";
        }}
      />
      <h1 className="mb-2 heading-display text-2xl">Players</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Fix anything, any time — name, number, team, position, photo. Release a player to replace them without losing their goals.
      </p>

      <form onSubmit={createPlayer} className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-surface p-4">
        <label className="text-xs">
          Name
          <input value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} required className={FIELD + " mt-1 block w-44"} />
        </label>
        <label className="text-xs">
          Student ID
          <input value={add.studentId} onChange={(e) => setAdd({ ...add, studentId: e.target.value })} placeholder="optional" className={FIELD + " mt-1 block w-32"} />
        </label>
        <label className="text-xs">
          Team
          <select value={add.teamId} onChange={(e) => setAdd({ ...add, teamId: e.target.value })} className={FIELD + " mt-1 block"}>
            <option value="">Pool (no team)</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        {add.teamId && (
          <label className="text-xs">
            #
            <input value={add.jerseyNumber} onChange={(e) => setAdd({ ...add, jerseyNumber: e.target.value })} type="number" min={1} required className={FIELD + " mt-1 block w-20"} />
          </label>
        )}
        <label className="text-xs">
          Position
          <select value={add.position} onChange={(e) => setAdd({ ...add, position: e.target.value })} className={FIELD + " mt-1 block"}>
            <option value="">Extra</option>
            {POSITIONS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded-full bg-pitch px-5 py-2 text-sm font-bold text-white">
          Add player
        </button>
      </form>

      {error && <p className="mb-3 text-sm text-live">{error}</p>}
      {notice && <p className="mb-3 text-sm text-pitch">{notice}</p>}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select aria-label="Filter by team" value={filterTeam} onChange={(e) => setFilterTeam(e.target.value)} className={FIELD}>
          <option value="">All teams</option>
          <option value="__pool">Unassigned (pool)</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or student ID" className={FIELD + " w-56"} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showReleased} onChange={(e) => setShowReleased(e.target.checked)} />
          Show released
        </label>
        <span className="text-xs text-muted-foreground">{visible.length} shown</span>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {visible.map((p) => (
            <PlayerRow
              key={`${p.id}:${p.name}:${p.jerseyNumber}:${p.teamId}:${p.position}:${p.isCaptain}:${p.status}`}
              p={p}
              teams={teams}
              onPatch={(change) => patch(p, change)}
              onPhoto={() => {
                photoTarget.current = p.id;
                fileInput.current?.click();
              }}
              onRelease={() => release(p)}
              onRestore={() => api(`/api/admin/players/${p.id}/restore`, "POST", {}, `${p.name} restored.`)}
              onDelete={() => remove(p)}
            />
          ))}
          {visible.length === 0 && <li className="px-5 py-6 text-center text-muted-foreground">No players match.</li>}
        </ul>
      )}
    </div>
  );
}

function PlayerRow({
  p,
  teams,
  onPatch,
  onPhoto,
  onRelease,
  onRestore,
  onDelete,
}: {
  p: Player;
  teams: Team[];
  onPatch: (change: Record<string, unknown>) => void;
  onPhoto: () => void;
  onRelease: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(p.name);
  const [jersey, setJersey] = useState(String(p.jerseyNumber > 0 ? p.jerseyNumber : ""));
  const released = p.status === "RELEASED";

  return (
    <li className={"flex flex-wrap items-center gap-3 px-4 py-3 " + (released ? "opacity-60" : "")}>
      <button type="button" onClick={onPhoto} title="Change photo" aria-label={`Change photo for ${p.name}`} className="shrink-0">
        {p.photoUrl ? <Image src={p.photoUrl} alt="" width={36} height={36} className="h-9 w-9 rounded-full object-cover" /> : <span className="block h-9 w-9 rounded-full bg-line" />}
      </button>
      <input
        value={name}
        aria-label={`Name of ${p.name}`}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name.trim() !== p.name && onPatch({ name: name.trim() })}
        className={FIELD + " w-44 font-medium"}
      />
      {p.teamId && !released && (
        <input
          value={jersey}
          aria-label={`Jersey number of ${p.name}`}
          type="number"
          min={1}
          onChange={(e) => setJersey(e.target.value)}
          onBlur={() => jersey && Number(jersey) !== p.jerseyNumber && onPatch({ jerseyNumber: Number(jersey) })}
          className={FIELD + " w-16"}
        />
      )}
      <select
        aria-label={`Team of ${p.name}`}
        value={p.teamId ?? ""}
        disabled={released}
        onChange={(e) => onPatch({ teamId: e.target.value || null })}
        className={FIELD}
      >
        <option value="">Pool (no team)</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <select aria-label={`Position of ${p.name}`} value={p.position ?? ""} onChange={(e) => onPatch({ position: e.target.value || null })} className={FIELD}>
        <option value="">Extra</option>
        {POSITIONS.map((pos) => (
          <option key={pos}>{pos}</option>
        ))}
      </select>
      {p.teamId && !released && (
        <button
          type="button"
          onClick={() => onPatch({ isCaptain: !p.isCaptain })}
          title={p.isCaptain ? "Remove captain" : "Make captain"}
          aria-label={p.isCaptain ? `Remove ${p.name} as captain` : `Make ${p.name} captain`}
          className={"text-lg leading-none " + (p.isCaptain ? "text-brand" : "text-line hover:text-muted-foreground")}
        >
          ★
        </button>
      )}
      {p.person.identifiers[0] && <span className="font-mono text-xs text-muted-foreground">{p.person.identifiers[0].value}</span>}
      {released && <span className="rounded-full bg-line px-2 py-0.5 text-[10px] font-bold uppercase">Released</span>}
      <span className="ml-auto flex items-center gap-3 text-sm font-medium">
        {released ? (
          <button onClick={onRestore} className="text-pitch">
            Restore
          </button>
        ) : (
          p.teamId && (
            <button onClick={onRelease} className="text-amber-600">
              Release
            </button>
          )
        )}
        <button onClick={onDelete} className="text-live">
          Delete
        </button>
      </span>
    </li>
  );
}
