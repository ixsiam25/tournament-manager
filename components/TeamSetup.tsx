"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Crest } from "@/components/Crest";
import { usePasswordConfirm } from "@/components/PasswordConfirm";

type Candidate = { id: string; name: string; position: string | null };
type TeamRow = {
  id: string;
  name: string;
  shortName: string | null;
  managerName: string | null;
  logoUrl: string | null;
  hasManagerLogin: boolean;
  players: number;
  captainId: string | null;
  squad: Candidate[];
};
type Data = { season: { id: string; name: string; status: string; teamFormation: string; squadSizeMax: number | null } | null; teams: TeamRow[]; pool: Candidate[] };

const FIELD = "w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch";

/** The "Set up the teams" step of the season: add teams with a logo, an optional
 * manager (name + login) and an optional captain, and edit them later. */
export function TeamSetup() {
  const [data, setData] = useState<Data | null>(null);
  const { confirmWithPassword, modal } = usePasswordConfirm();

  const load = useCallback(async () => {
    setData(await (await fetch("/api/admin/season/teams")).json());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    load();
  }, [load]);

  if (!data) return <p className="text-muted-foreground">Loading…</p>;
  if (!data.season) return <p className="text-muted-foreground">No season yet.</p>;
  const frozen = data.season.status !== "ACTIVE";

  return (
    <div className="space-y-6">
      {modal}
      <p className="text-sm text-muted-foreground">
        {data.season.name} — {data.teams.length} team(s). {data.pool.length} player(s) have no team yet; any of them can be a captain.
        {data.season.teamFormation === "AUCTION" && " A captain is placed with the team before the auction and is not offered again."}
      </p>
      {frozen && <p className="rounded-lg border border-line bg-surface p-3 text-sm">This season is frozen — teams can be viewed but not changed.</p>}

      {!frozen && (
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">Add a team</h2>
          <TeamCard key={`new-${data.teams.length}`} candidates={data.pool} onChanged={load} confirmWithPassword={confirmWithPassword} />
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">Teams ({data.teams.length})</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {data.teams.map((t) => (
            <TeamCard
              key={t.id + t.name + t.logoUrl + t.captainId + t.managerName + t.hasManagerLogin}
              team={t}
              candidates={[...t.squad, ...data.pool]}
              frozen={frozen}
              onChanged={load}
              confirmWithPassword={confirmWithPassword}
            />
          ))}
          {data.teams.length === 0 && <p className="text-sm text-muted-foreground">No teams yet.</p>}
        </div>
      </section>

      <p className="text-sm">
        When the teams are ready, go back to <Link href="/admin/season" className="font-bold text-pitch underline">Season setup</Link> for the next step.
      </p>
    </div>
  );
}

function TeamCard({
  team,
  candidates,
  frozen = false,
  onChanged,
  confirmWithPassword,
}: {
  team?: TeamRow;
  candidates: Candidate[];
  frozen?: boolean;
  onChanged: () => Promise<void>;
  confirmWithPassword: (message: string) => Promise<boolean>;
}) {
  const [name, setName] = useState(team?.name ?? "");
  const [shortName, setShortName] = useState(team?.shortName ?? "");
  const [managerName, setManagerName] = useState(team?.managerName ?? "");
  const [password, setPassword] = useState("");
  const [captainId, setCaptainId] = useState(team?.captainId ?? "");
  const [logo, setLogo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function fail(res: Response, fallback: string) {
    setMessage({ ok: false, text: (await res.json().catch(() => ({}))).error ?? fallback });
    setBusy(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const body = JSON.stringify({ name, shortName: shortName || null, managerName: managerName || null });
    const headers = { "Content-Type": "application/json" };
    const res = team
      ? await fetch(`/api/admin/teams/${team.id}`, { method: "PATCH", headers, body })
      : await fetch("/api/admin/teams", { method: "POST", headers, body });
    if (!res.ok) return fail(res, "Could not save the team");
    const id: string = team?.id ?? (await res.json()).team.id;

    if (logo) {
      const fd = new FormData();
      fd.append("logo", logo);
      const r = await fetch(`/api/admin/teams/${id}/logo`, { method: "POST", body: fd });
      if (!r.ok) return fail(r, "Saved the team, but the logo failed");
    }
    if (password) {
      const r = await fetch("/api/admin/security/team-password", { method: "POST", headers, body: JSON.stringify({ teamId: id, password }) });
      if (!r.ok) return fail(r, "Saved the team, but the manager login failed");
    }
    if ((team?.captainId ?? "") !== captainId) {
      const r = await fetch(`/api/admin/teams/${id}/captain`, { method: "POST", headers, body: JSON.stringify({ playerId: captainId || null }) });
      if (!r.ok) return fail(r, "Saved the team, but the captain failed");
    }
    setBusy(false);
    setPassword("");
    setLogo(null);
    setPreview(null);
    setMessage({ ok: true, text: team ? "Saved." : "Team added." });
    await onChanged();
  }

  async function remove() {
    if (!team || !(await confirmWithPassword(`Delete ${team.name}? This also removes its players from the team.`))) return;
    setBusy(true);
    const res = await fetch(`/api/admin/teams/${team.id}`, { method: "DELETE" });
    if (!res.ok) return fail(res, "Could not delete (teams with match history can't be deleted)");
    await onChanged();
  }

  return (
    <form onSubmit={save} className="space-y-3 rounded-2xl border border-line bg-surface p-4" aria-label={team ? `Team ${team.name}` : "New team"}>
      <div className="flex items-start gap-4">
        <label className="shrink-0 cursor-pointer text-center text-[11px] text-muted-foreground">
          {preview || team?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- admin preview of a just-chosen file / stored logo
            <img src={preview ?? team!.logoUrl!} alt="" className="h-16 w-16 rounded-full border border-line object-cover" />
          ) : (
            <span className="inline-flex">
              <Crest size={64} name={name || "New team"} />
            </span>
          )}
          <span className="mt-1 block underline">{frozen ? "" : "Logo"}</span>
          {!frozen && (
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-label={`Logo${team ? ` for ${team.name}` : ""}`}
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setLogo(f);
                setPreview(f ? URL.createObjectURL(f) : null);
              }}
            />
          )}
        </label>
        <div className="grid flex-1 grid-cols-2 gap-3">
          <label className="col-span-2 text-xs font-bold uppercase text-muted-foreground">
            Team name
            <input value={name} onChange={(e) => setName(e.target.value)} required disabled={frozen} aria-label="Team name" className={FIELD + " mt-1 font-normal normal-case text-foreground"} />
          </label>
          <label className="text-xs font-bold uppercase text-muted-foreground">
            Short name
            <input value={shortName} onChange={(e) => setShortName(e.target.value)} maxLength={4} disabled={frozen} placeholder="e.g. F25" aria-label="Short name" className={FIELD + " mt-1 font-normal normal-case text-foreground"} />
          </label>
          <label className="text-xs font-bold uppercase text-muted-foreground">
            Captain (optional)
            <select value={captainId} onChange={(e) => setCaptainId(e.target.value)} disabled={frozen} aria-label="Captain" className={FIELD + " mt-1 font-normal normal-case text-foreground"}>
              <option value="">No captain yet</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.position ? ` · ${c.position}` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-line pt-3">
        <label className="text-xs font-bold uppercase text-muted-foreground">
          Manager (optional)
          <input value={managerName} onChange={(e) => setManagerName(e.target.value)} disabled={frozen} aria-label="Manager name" placeholder="Name" className={FIELD + " mt-1 font-normal normal-case text-foreground"} />
        </label>
        <label className="text-xs font-bold uppercase text-muted-foreground">
          Manager login password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={frozen}
            autoComplete="new-password"
            aria-label="Manager login password"
            placeholder={team?.hasManagerLogin ? "set — type to reset" : "optional, 6+ characters"}
            className={FIELD + " mt-1 font-normal normal-case text-foreground"}
          />
        </label>
      </div>

      {!frozen && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy} className="rounded-full bg-pitch px-5 py-1.5 text-sm font-bold text-white disabled:opacity-40">
            {team ? "Save team" : "Add team"}
          </button>
          {team && (
            <button type="button" onClick={remove} disabled={busy} className="text-sm text-live underline">
              Delete
            </button>
          )}
          {team && <span className="text-xs text-muted-foreground">{team.players} player(s){team.hasManagerLogin ? " · manager login set" : ""}</span>}
          {message && <span className={"text-sm " + (message.ok ? "text-pitch" : "text-live")}>{message.text}</span>}
        </div>
      )}
    </form>
  );
}
