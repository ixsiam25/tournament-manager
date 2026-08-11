"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Crest } from "@/components/Crest";
import type { PublicAuctionStatus } from "@/lib/auction";

const POLL_MS = 7000;

export function AuctionLiveWidget({ initial }: { initial: PublicAuctionStatus }) {
  const [data, setData] = useState<PublicAuctionStatus>(initial);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch("/api/public/auction", { cache: "no-store" });
        if (!res.ok) return;
        const next: PublicAuctionStatus = await res.json();
        setData(next);
      } catch {
        // network hiccup — try again on the next tick
      }
    }

    intervalRef.current = setInterval(poll, POLL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  if (!data.active) {
    return <p className="text-muted">No auction is running right now.</p>;
  }

  const { currentLot, teams, soldCount, queuedCount } = data;

  return (
    <div className="space-y-6">
      <div className="rounded-block-lg border-2 border-line-strong bg-surface p-6 shadow-block">
        <div className="mb-4 flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-block bg-live px-2.5 py-1 text-xs font-black uppercase tracking-wide text-white">
            <span className="h-1.5 w-1.5 animate-pulse-live rounded-full bg-white" />
            Live
          </span>
          <span className="text-xs font-bold uppercase tracking-wide text-muted">
            {soldCount} sold · {queuedCount} left
          </span>
        </div>
        {currentLot ? (
          <div className="flex items-center gap-4">
            {currentLot.photoUrl ? (
              <div className="relative h-24 w-16 overflow-hidden rounded-lg border border-line-strong">
                <Image src={currentLot.photoUrl} alt={currentLot.playerName} fill sizes="64px" className="object-cover" />
              </div>
            ) : (
              <div className="h-24 w-16 rounded-lg bg-line" />
            )}
            <div>
              <p className="text-xl font-bold">{currentLot.playerName}</p>
              <p className="text-sm text-muted">
                {currentLot.position ?? "No position"} · base {currentLot.basePrice}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-muted">Between lots…</p>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">Team budgets</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {teams.map((t) => (
            <div key={t.teamName} className="flex items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3">
              <span className="flex items-center gap-2 font-bold">
                <Crest size={22} name={t.teamName} />
                {t.teamName}
              </span>
              <span className="text-right text-sm text-muted">
                {t.remainingBudget} left
                <br />
                squad {t.squadCount}
              </span>
            </div>
          ))}
          {teams.length === 0 && <p className="text-sm text-muted">No teams yet.</p>}
        </div>
      </div>
    </div>
  );
}
