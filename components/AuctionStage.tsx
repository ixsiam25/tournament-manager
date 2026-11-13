"use client";

import { plural } from "@/lib/plural";
import { useEffect, useState } from "react";
import { Crest } from "@/components/Crest";
import { PlayerCardView } from "@/components/PlayerCardView";
import type { StageCard, StageState } from "@/lib/auctionStage";

const POLL_MS = 2000;
const CARD_W = 230;
const CARD_H = 360;

/** Window size, so the cards are scaled to fit whatever screen/projector this is on. */
function useViewport() {
  const [vp, setVp] = useState({ w: 1920, h: 1080 });
  useEffect(() => {
    const read = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);
  return vp;
}

/** The big-screen auction view. It has no controls: the organiser's console
 * drives it, and it simply repaints what the lots' state says every 2 s. */
export function AuctionStage({ initial }: { initial: StageState }) {
  const [state, setState] = useState<StageState>(initial);
  const [offline, setOffline] = useState(false);
  const vp = useViewport();

  useEffect(() => {
    let stopped = false;
    async function poll() {
      try {
        const res = await fetch("/api/public/auction/stage", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const next: StageState = await res.json();
        if (!stopped) {
          setState(next);
          setOffline(false);
        }
      } catch {
        if (!stopped) setOffline(true);
      }
    }
    const t = setInterval(poll, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, []);

  return (
    <main
      className={`card-stage flex flex-col px-10 py-6 text-white ${state.phase === "closing" ? "min-h-screen" : "h-screen overflow-hidden"}`}
      data-phase={state.phase}
    >
      {offline && <p className="fixed right-4 top-3 z-50 rounded bg-amber-500 px-2 py-1 text-xs font-bold text-black">Reconnecting…</p>}
      <Screen state={state} vp={vp} />
    </main>
  );
}

function Header({ seasonName, right }: { seasonName: string; right?: string }) {
  return (
    <header className="mb-4 flex shrink-0 items-center justify-between border-b border-white/15 pb-3">
      <h1 className="text-3xl font-black uppercase tracking-widest">{seasonName} · Auction</h1>
      {right && <span className="text-xl font-bold text-white/70">{right}</span>}
    </header>
  );
}

function Screen({ state, vp }: { state: StageState; vp: { w: number; h: number } }) {
  // Height left for a single big card under the header, and the scale that fills it.
  const heroScale = Math.max(0.6, Math.min((vp.h - 150) / CARD_H, 2.4));
  switch (state.phase) {
    case "off":
      return <h1 className="pt-40 text-center text-3xl font-normal text-white/60">No auction is running right now.</h1>;

    case "poster":
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black" data-testid="stage-poster">
          {state.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- full-screen poster from the media proxy
            <img src={state.posterUrl} alt="" className="h-full w-full object-contain" />
          ) : (
            <p className="heading-display text-7xl text-white/80">{state.seasonName}</p>
          )}
          {state.onBreak && (
            <p className="absolute bottom-10 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-8 py-3 text-3xl font-bold uppercase tracking-[0.2em] text-white" data-testid="stage-break">
              We&rsquo;ll be right back
            </p>
          )}
        </div>
      );

    case "captains":
      return (
        <CaptainsScreen state={state} vp={vp} />
      );

    case "begin":
      return (
        <div className="flex min-h-[80vh] flex-col items-center justify-center text-center" data-testid="stage-begin">
          <p className="text-3xl font-bold uppercase tracking-[0.4em] text-white/60">{state.seasonName} · Auction</p>
          <p className="mt-8 heading-display text-[9rem] leading-none text-amber-300">Let&rsquo;s begin</p>
        </div>
      );

    case "opening":
      return (
        <div>
          <Header seasonName={state.seasonName} />
          <div className="pt-16 text-center">
            <p className="text-7xl font-black uppercase tracking-widest">The auction begins</p>
            <p className="mt-6 text-3xl text-white/70">
              {plural(state.players, "player")} · {plural(state.teams.length, "team")} · base price {state.basePrice}
            </p>
            <div className="mt-14 flex flex-wrap justify-center gap-10">
              {state.teams.map((t) => (
                <div key={t.id} className="flex flex-col items-center gap-3">
                  <Crest size={96} name={t.name} />
                  <span className="text-2xl font-bold">{t.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      );

    case "lot":
      return (
        <>
          <Header seasonName={state.seasonName} right={`${state.sold} sold · ${state.left} to go`} />
          <div className="flex min-h-0 flex-1 items-center justify-center gap-16">
            <BigCard card={state.card} scale={heroScale} />
            <div className="max-w-[46vw]">
              <p className="text-3xl font-bold uppercase tracking-[0.25em] text-white/60">{state.card.position ?? "Player"} · on the block</p>
              <p className="mt-4 text-8xl font-black uppercase leading-[0.95]" data-testid="stage-name">{state.card.name}</p>
              <p className="mt-10 text-3xl text-white/60">Base price {state.basePrice}</p>
            </div>
          </div>
        </>
      );

    case "result":
      return (
        <>
          <Header seasonName={state.seasonName} right={`${state.sold} sold · ${state.left} to go`} />
          <div className="flex min-h-0 flex-1 items-center justify-center gap-16">
            <div className={state.kind === "SOLD" ? "" : "opacity-40"}>
              <BigCard card={state.card} scale={heroScale} />
            </div>
            <div className="max-w-[46vw]">
              <p className="text-8xl font-black uppercase leading-[0.95]">{state.card.name}</p>
              {state.kind === "SOLD" ? (
                <div className="mt-10" data-testid="stage-result">
                  <p className="inline-block -rotate-3 rounded-lg border-[10px] border-red-500 px-10 py-2 text-9xl font-black uppercase leading-none tracking-widest text-red-500">Sold</p>
                  <p className="mt-10 flex items-center gap-5 text-5xl font-bold">
                    <Crest size={80} name={state.team?.name ?? ""} />
                    {state.team?.name}
                  </p>
                  <p className="mt-4 text-7xl font-black text-amber-300" data-testid="stage-price">
                    {state.price}
                  </p>
                </div>
              ) : (
                <p className="mt-10 text-8xl font-black uppercase tracking-widest text-white/60" data-testid="stage-result">
                  Unsold
                </p>
              )}
            </div>
          </div>
        </>
      );

    case "between":
      return (
        <div>
          <Header seasonName={state.seasonName} />
          <div className="pt-28 text-center" data-testid="stage-between">
            <p className="text-6xl font-black uppercase tracking-widest">Next player coming up…</p>
            <p className="mt-8 text-4xl text-white/70">
              {state.sold} sold · {state.left} still to go
            </p>
          </div>
        </div>
      );

    case "closing":
      return (
        <div>
          <Header seasonName={state.seasonName} right="Final squads" />
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4" data-testid="stage-closing">
            {state.squads.map((s) => (
              <section key={s.team.name} className="rounded-2xl border border-white/15 bg-white/5 p-5">
                <h2 className="mb-3 flex items-center gap-3 text-2xl font-black uppercase">
                  <Crest size={40} name={s.team.name} />
                  {s.team.name}
                </h2>
                <ul className="space-y-1 text-xl">
                  {s.players.map((p) => (
                    <li key={p.number + p.name} className="flex gap-3">
                      <span className="w-8 text-right text-white/50">{p.number}</span>
                      <span className="flex-1 font-semibold">{p.name}</span>
                      <span className="text-white/50">{p.position}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      );
  }
}

/** Every captain on one screen: one row up to 8, otherwise two, scaled to fit. */
function CaptainsScreen({ state, vp }: { state: Extract<StageState, { phase: "captains" }>; vp: { w: number; h: number } }) {
  const n = Math.max(1, state.captains.length);
  const rows = n > 8 ? 2 : 1;
  const perRow = Math.ceil(n / rows);
  const gap = 28;
  const byWidth = (vp.w - 80 - gap * (perRow - 1)) / (perRow * CARD_W);
  const byHeight = (vp.h - 120 - rows * 70 - (rows - 1) * 24) / (rows * CARD_H);
  const scale = Math.max(0.4, Math.min(byWidth, byHeight, 1.6));
  return (
    <>
      <Header seasonName={state.seasonName} right="The captains" />
      <div className="flex min-h-0 flex-1 flex-wrap content-center items-center justify-center" style={{ columnGap: gap, rowGap: 24 }} data-testid="stage-captains">
        {state.captains.map((c) => (
          <div key={c.teamName} className="flex flex-col items-center gap-3">
            {c.card ? (
              <BigCard card={c.card} scale={scale} />
            ) : (
              <div style={{ width: CARD_W * scale, height: CARD_H * scale }} className="flex items-center justify-center rounded-2xl border border-white/20 text-white/50">
                No captain yet
              </div>
            )}
            <div className="flex items-center gap-3 text-xl font-black uppercase tracking-wide">
              <Crest size={36} name={c.teamName} />
              {c.teamName}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function BigCard({ card, scale }: { card: StageCard; scale: number }) {
  return (
    <div style={{ width: CARD_W * scale, height: CARD_H * scale }} className="shrink-0">
      <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: CARD_W }}>
        <PlayerCardView name={card.name} model={card.model} imageUrl={card.imageUrl} isCutout={card.isCutout} framing={card.framing} semester={card.semester} />
      </div>
    </div>
  );
}
