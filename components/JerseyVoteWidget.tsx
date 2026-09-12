"use client";

import { useEffect, useState } from "react";
import { getVoterId } from "@/lib/voterIdentity";

type Tally = { likes: number; dislikes: number; total: number; likePct: number; yourVote: boolean | null };

/**
 * A one-question design poll for the kit reveal — 👍/👎, one vote per
 * browser via the same voterId scheme as ChampionPrediction. Not a
 * measured survey, just a quick temperature check on the design.
 */
export function JerseyVoteWidget() {
  const [tally, setTally] = useState<Tally | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const voterId = getVoterId();
      const res = await fetch(`/api/jersey-vote?voterId=${encodeURIComponent(voterId)}`, { cache: "no-store" });
      if (!res.ok || cancelled) return;
      setTally(await res.json());
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function vote(like: boolean) {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/jersey-vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voterId: getVoterId(), like }),
      });
      if (res.ok) setTally(await res.json());
    } finally {
      setSubmitting(false);
    }
  }

  const total = tally?.total ?? 0;
  const likePct = tally?.likePct ?? 50;
  const voted = tally?.yourVote !== null && tally?.yourVote !== undefined;

  return (
    <div className="rounded-block-lg border border-line bg-surface p-4 shadow-block sm:p-6">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.15em] text-gold">Design Poll</p>
      <p className="mb-4 text-sm text-muted-foreground">
        {voted ? "Thanks for voting — change your mind any time." : "Do you like the new kit? Cast your vote."}
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => vote(true)}
          disabled={submitting}
          aria-pressed={tally?.yourVote === true}
          className={
            "flex flex-1 items-center justify-center gap-2 rounded-block border-2 py-3 text-sm font-bold uppercase tracking-wide transition-colors disabled:opacity-50 " +
            (tally?.yourVote === true ? "border-gold bg-gold/10 text-gold" : "border-line hover:border-line-strong")
          }
        >
          👍 Love it
        </button>
        <button
          type="button"
          onClick={() => vote(false)}
          disabled={submitting}
          aria-pressed={tally?.yourVote === false}
          className={
            "flex flex-1 items-center justify-center gap-2 rounded-block border-2 py-3 text-sm font-bold uppercase tracking-wide transition-colors disabled:opacity-50 " +
            (tally?.yourVote === false ? "border-brand bg-brand/10 text-brand" : "border-line hover:border-line-strong")
          }
        >
          👎 Not for me
        </button>
      </div>

      {total > 0 && (
        <div className="mt-5 border-t-2 border-line pt-4">
          <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
            <span>{likePct}% love it</span>
            <span>
              {total} vote{total === 1 ? "" : "s"}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-block bg-line">
            <div className="h-full bg-gold transition-all" style={{ width: `${likePct}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
