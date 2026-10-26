"use client";

import { cardFileName, downloadDataUrl, storyPng } from "@/lib/cardImage";
import { EmptyState } from "@/components/EmptyState";
import { plural } from "@/lib/plural";
import { useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { PlayerCardView } from "@/components/PlayerCardView";
import type { CardView } from "@/lib/cardData";

const FIELD = "rounded-lg border border-line bg-background px-3 py-1.5 text-sm outline-none focus:border-pitch";

/** Public gallery of every card in the edition, with team/position filters,
 * sorting, and a PNG download for each card. */
export function CardGallery({ cards, seasonName }: { cards: CardView[]; seasonName: string }) {
  const [team, setTeam] = useState("");
  const [position, setPosition] = useState("");
  const [sort, setSort] = useState<"overall" | "name" | "team">("overall");
  const teams = useMemo(() => [...new Map(cards.filter((c) => c.teamId).map((c) => [c.teamId!, c.teamName!])).entries()], [cards]);

  const shown = cards
    .filter((c) => (!team || c.teamId === team) && (!position || c.position === position))
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "team"
          ? (a.teamName ?? "").localeCompare(b.teamName ?? "") || a.name.localeCompare(b.name)
          : (b.model.overall ?? -1) - (a.model.overall ?? -1) || a.name.localeCompare(b.name),
    );

  if (cards.length === 0) return <EmptyState icon="🃏" title="No cards yet" text="Player cards show up here once players are approved and rated." href="/register" cta="Apply to play" />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <select aria-label="Team" value={team} onChange={(e) => setTeam(e.target.value)} className={FIELD}>
          <option value="">All teams</option>
          {teams.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <select aria-label="Position" value={position} onChange={(e) => setPosition(e.target.value)} className={FIELD}>
          <option value="">All positions</option>
          {["GK", "DEF", "MID", "FWD"].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={FIELD}>
          <option value="overall">Highest rated</option>
          <option value="name">Name</option>
          <option value="team">Team</option>
        </select>
        <span className="text-xs text-muted-foreground">{plural(shown.length, "card")}</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-8">
        {shown.map((c) => (
          <GalleryCard key={c.id} card={c} seasonName={seasonName} />
        ))}
      </div>
    </div>
  );
}

function GalleryCard({ card, seasonName }: { card: CardView; seasonName: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  async function download(kind: "card" | "story" = "card") {
    if (!ref.current) return;
    setBusy(true);
    try {
      const url = kind === "story" ? await storyPng(ref.current, { title: card.name, subtitle: `${seasonName} · ${card.teamName}` }) : await toPng(ref.current, { pixelRatio: 3, cacheBust: true });
      downloadDataUrl(url, cardFileName(card.name, kind));
    } finally {
      setBusy(false);
    }
  }

  return (
    <figure className="m-0 text-center">
      <div className="card-stage rounded-2xl px-3 py-5">
        <PlayerCardView ref={ref} name={card.name} model={card.model} imageUrl={card.imageUrl} isCutout={card.isCutout} framing={card.framing} semester={card.semester} footer={seasonName.toUpperCase()} />
      </div>
      <figcaption className="mt-2 text-xs text-muted-foreground">
        {card.teamName}
        <button onClick={() => download("card")} disabled={busy} className="ml-3 font-bold text-pitch underline disabled:opacity-50" aria-label={`Download ${card.name}'s card as an image`}>
          {busy ? "Preparing…" : "Download PNG"}
        </button>
        <button onClick={() => download("story")} disabled={busy} className="ml-3 font-bold text-pitch underline disabled:opacity-50" aria-label={`Story-size image of ${card.name}'s card`}>
          Story size
        </button>
      </figcaption>
    </figure>
  );
}
