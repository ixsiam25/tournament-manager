"use client";

import { PlayerPhoto } from "@/components/SafeImage";
import { useEffect, useRef, useState } from "react";
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
    return <p className="text-muted-foreground">No auction is running right now.</p>;
  }

  const { currentLot, soldCount, queuedCount } = data;

  return (
    <div className="space-y-6">
      <div className="rounded-block-lg border border-line bg-surface p-6 shadow-block">
        <div className="mb-4 flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-block bg-live px-2.5 py-1 text-xs font-black uppercase tracking-wide text-white">
            <span className="h-1.5 w-1.5 animate-pulse-live rounded-full bg-white" />
            Live
          </span>
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {soldCount} sold · {queuedCount} left
          </span>
        </div>
        {currentLot ? (
          <div className="flex items-center gap-4">
            {currentLot.photoUrl ? (
              <div className="relative h-24 w-16 overflow-hidden rounded-lg border border-line-strong">
                <PlayerPhoto src={currentLot.photoUrl} alt={currentLot.playerName} sizes="64px" />
              </div>
            ) : (
              <div className="h-24 w-16 rounded-lg bg-line" />
            )}
            <div>
              <p className="text-xl font-bold">{currentLot.playerName}</p>
              <p className="text-sm text-muted-foreground">
                {currentLot.position ?? "No position"} · base {currentLot.basePrice}
              </p>
              {currentLot.currentBid != null && (
                <p className="mt-1 text-sm font-bold">
                  Current bid {currentLot.currentBid}
                  {currentLot.leaderName ? ` · ${currentLot.leaderName}` : ""}
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground">Between lots…</p>
        )}
      </div>

    </div>
  );
}
