"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PlayerCardView } from "@/components/PlayerCardView";
import { removeBackgroundInWorker } from "@/lib/cutoutClient";
import { PHOTO_OFFSET_RANGE, PHOTO_ZOOM_RANGE } from "@/lib/applicationConfig";
import { RATING_MAX, RATING_MIN, STAT_LABELS, TIERS, buildCardModel, statKeysFor, type Position, type Ratings, type StatKey, type Tier } from "@/lib/playerCard";
import type { CardView } from "@/lib/cardData";

const FIELD = "rounded-lg border border-line bg-background px-2 py-1 text-sm outline-none focus:border-pitch";

/** Organiser editor for ratings, tier, framing and cut-outs. */
export function CardEditor() {
  const [cards, setCards] = useState<CardView[]>([]);
  const [seasonName, setSeasonName] = useState("");
  const [frozen, setFrozen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [teamFilter, setTeamFilter] = useState("");
  const [query, setQuery] = useState("");
  const [unratedOnly, setUnratedOnly] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/cards");
    const body = await res.json();
    setCards(body.cards ?? []);
    setSeasonName(body.season?.name ?? "");
    setFrozen(body.season?.status === "ARCHIVED");
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    load();
  }, [load]);

  const teams = useMemo(() => [...new Map(cards.filter((c) => c.teamId).map((c) => [c.teamId!, c.teamName!])).entries()], [cards]);
  const visible = cards.filter(
    (c) =>
      (teamFilter === "" ? true : teamFilter === "__pool" ? !c.teamId : c.teamId === teamFilter) &&
      (!unratedOnly || c.model.base === null) &&
      (!query.trim() || c.name.toLowerCase().includes(query.trim().toLowerCase())),
  );
  const unrated = cards.filter((c) => c.model.base === null).length;

  async function bulkFill() {
    setMessage(null);
    let done = 0;
    for (const c of cards.filter((x) => x.model.base === null)) {
      const ratings = Object.fromEntries(statKeysFor(c.position).map((k) => [k, 60]));
      const res = await fetch(`/api/admin/players/${c.id}/card`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ratings }) });
      if (!res.ok) break;
      done++;
    }
    setMessage({ ok: true, text: `Set ${done} unrated player(s) to a starting 60 — adjust them below.` });
    await load();
  }

  if (loading) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-4">
      {frozen && <p className="rounded-lg border border-line bg-surface p-3 text-sm">{seasonName} is frozen — cards can be viewed but not changed.</p>}
      <div className="flex flex-wrap items-center gap-3">
        <select aria-label="Filter by team" value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} className={FIELD}>
          <option value="">All teams</option>
          <option value="__pool">Unassigned (pool)</option>
          {teams.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name" className={FIELD + " w-48"} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={unratedOnly} onChange={(e) => setUnratedOnly(e.target.checked)} />
          Unrated only ({unrated})
        </label>
        {!frozen && unrated > 0 && (
          <button onClick={bulkFill} className="ml-auto rounded-full border border-pitch px-4 py-1.5 text-sm font-bold text-pitch">
            Start unrated players at 60
          </button>
        )}
      </div>
      {message && <p className={"text-sm " + (message.ok ? "text-pitch" : "text-live")}>{message.text}</p>}

      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {visible.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => setOpen(open === c.id ? null : c.id)}
              aria-expanded={open === c.id}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-background"
            >
              <span className="w-9 text-center font-black">{c.model.overall ?? "—"}</span>
              <span className="min-w-0 flex-1">
                <span className="font-medium">{c.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">{c.teamName ?? "Pool"} · {c.position ?? "no position"}</span>
              </span>
              {c.model.bonus > 0 && <span className="text-xs font-bold text-pitch">+{c.model.bonus} form</span>}
              <span className="rounded-full bg-line px-2 py-0.5 text-[10px] font-bold uppercase">{c.model.tier}</span>
              <span className="text-xs text-muted-foreground">{c.isCutout ? "cut-out" : c.hasPhoto ? "photo" : "no photo"}</span>
            </button>
            {open === c.id && <CardRow key={c.id + JSON.stringify(c.ratings) + c.cardTier + c.framing.zoom + c.imageUrl} card={c} seasonName={seasonName} frozen={frozen} onSaved={async (text) => { await load(); setMessage({ ok: true, text }); }} />}
          </li>
        ))}
        {visible.length === 0 && <li className="px-5 py-6 text-center text-muted-foreground">No players match.</li>}
      </ul>
    </div>
  );
}

/** `onSaved` reloads the list and shows the message at the top — the row itself
 * remounts when its data changes, so it can't be the one to show "Saved". */
function CardRow({ card, seasonName, frozen, onSaved }: { card: CardView; seasonName: string; frozen: boolean; onSaved: (message: string) => Promise<void> }) {
  const keys = statKeysFor(card.position);
  const [ratings, setRatings] = useState<Ratings>(card.ratings);
  const [tier, setTier] = useState<Tier | "">(card.cardTier ?? "");
  const [framing, setFraming] = useState(card.framing);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const model = useMemo(
    () => buildCardModel({ position: card.position as Position | null, ratings, cardTier: tier || null, stats: { goals: card.goals, assists: card.assists } }),
    [card.position, card.goals, card.assists, ratings, tier],
  );
  const set = (k: StatKey, raw: string) => setRatings((r) => (raw === "" ? Object.fromEntries(Object.entries(r).filter(([key]) => key !== k)) : { ...r, [k]: Number(raw) }));

  async function save() {
    setBusy(true);
    setStatus(null);
    const res = await fetch(`/api/admin/players/${card.id}/card`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ratings, cardTier: tier || null, photoZoom: framing.zoom, photoX: framing.x, photoY: framing.y }),
    });
    setBusy(false);
    if (!res.ok) return setStatus({ ok: false, text: (await res.json().catch(() => ({}))).error ?? "Could not save" });
    await onSaved("Saved.");
  }

  async function rerunCutout() {
    if (!card.photoSrc) return setStatus({ ok: false, text: "This player has no photo to cut out." });
    setBusy(true);
    setStatus({ ok: true, text: "Removing the background… (the first run downloads the model)" });
    try {
      const photo = await (await fetch(card.photoSrc)).blob();
      const png = await removeBackgroundInWorker(photo).promise;
      await uploadCutout(png);
    } catch {
      setStatus({ ok: false, text: "Background removal failed for this photo — try uploading a cut-out instead." });
      setBusy(false);
    }
  }

  async function uploadCutout(blob: Blob) {
    setBusy(true);
    const fd = new FormData();
    fd.append("cutout", blob, "cutout.png");
    const res = await fetch(`/api/admin/players/${card.id}/cutout`, { method: "POST", body: fd });
    setBusy(false);
    if (!res.ok) return setStatus({ ok: false, text: (await res.json().catch(() => ({}))).error ?? "Upload failed" });
    await onSaved("Cut-out updated.");
  }

  async function removeCutout() {
    setBusy(true);
    const res = await fetch(`/api/admin/players/${card.id}/cutout`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) return setStatus({ ok: false, text: "Could not remove" });
    await onSaved("Back to the plain photo.");
  }

  return (
    <div className="grid gap-6 border-t border-line bg-background px-4 py-5 md:grid-cols-[15rem_1fr]">
      <div>
        <PlayerCardView name={card.name} model={model} imageUrl={card.imageUrl} isCutout={card.isCutout} framing={framing} badge={card.badge} footer={seasonName.toUpperCase()} onFramingChange={frozen ? undefined : setFraming} />
        <p className="mt-2 text-center text-[11px] text-muted-foreground">Drag the photo to re-frame it.</p>
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {keys.map((k) => (
            <label key={k} className="text-xs">
              {STAT_LABELS[k]}
              <input
                type="number"
                min={RATING_MIN}
                max={RATING_MAX}
                value={ratings[k] ?? ""}
                disabled={frozen}
                aria-label={`${STAT_LABELS[k]} of ${card.name}`}
                onChange={(e) => set(k, e.target.value)}
                className={FIELD + " mt-1 block w-full"}
              />
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Overall {model.base ?? "—"}
          {model.bonus > 0 && ` + ${model.bonus} form = ${model.overall}`} · {card.goals} goal(s), {card.assists} assist(s) so far
        </p>
        <label className="block text-xs">
          Tier override
          <select value={tier} disabled={frozen} onChange={(e) => setTier(e.target.value as Tier | "")} className={FIELD + " ml-2"}>
            <option value="">Automatic</option>
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <div className="grid max-w-sm gap-1 text-xs">
          {([["Zoom", "zoom", PHOTO_ZOOM_RANGE.min, PHOTO_ZOOM_RANGE.max], ["Left / right", "x", PHOTO_OFFSET_RANGE.min, PHOTO_OFFSET_RANGE.max], ["Up / down", "y", PHOTO_OFFSET_RANGE.min, PHOTO_OFFSET_RANGE.max]] as const).map(([label, key, min, max]) => (
            <label key={key} className="grid grid-cols-[6rem_1fr_2rem] items-center gap-2">
              <span>{label}</span>
              <input type="range" min={min} max={max} disabled={frozen} value={framing[key]} onChange={(e) => setFraming({ ...framing, [key]: Number(e.target.value) })} aria-label={`${label} for ${card.name}`} />
              <b className="text-right">{framing[key]}</b>
            </label>
          ))}
        </div>
        {!frozen && (
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={save} disabled={busy} className="rounded-full bg-pitch px-5 py-1.5 text-sm font-bold text-white disabled:opacity-50">
              Save card
            </button>
            <button onClick={rerunCutout} disabled={busy || !card.photoSrc} className="text-sm underline disabled:opacity-40">
              Re-run background removal
            </button>
            <label className="cursor-pointer text-sm underline">
              Upload cut-out (PNG)
              <input type="file" accept="image/png" hidden onChange={(e) => e.target.files?.[0] && uploadCutout(e.target.files[0])} />
            </label>
            {card.isCutout && (
              <button onClick={removeCutout} disabled={busy} className="text-sm text-live underline">
                Use plain photo
              </button>
            )}
          </div>
        )}
        {status && <p className={"text-sm " + (status.ok ? "text-pitch" : "text-live")}>{status.text}</p>}
      </div>
    </div>
  );
}
