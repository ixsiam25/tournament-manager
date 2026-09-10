import Link from "next/link";
import { Crest } from "@/components/Crest";
import { Reveal } from "@/components/motion/Reveal";
import { CountUp } from "@/components/motion/CountUp";
import { TiltCard } from "@/components/motion/TiltCard";
import type { LeagueStats } from "@/lib/leagueStats";

const SHELL =
  "h-full rounded-block-lg border border-line bg-surface p-4 shadow-block";
const LABEL = "text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground";

/**
 * All-time league record as a bento grid. Every figure is read from the
 * archived seasons — nothing here is placeholder copy.
 *
 * Renders nothing until at least one season has been archived; a grid of
 * zeroes says less than no grid at all.
 */
export function LeagueBento({ stats }: { stats: LeagueStats }) {
  if (stats.seasonsPlayed === 0) return null;

  return (
    <section className="mt-8">
      <h2 className={LABEL + " mb-3 border-b border-line pb-2"}>The Record</h2>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.champion && (
          <Reveal index={0} className="col-span-2 md:row-span-2">
            <TiltCard glow="var(--gold)" className="h-full rounded-block-lg">
              <Link
                href={`/legacy/${stats.champion.slug}`}
                className={
                  SHELL +
                  " stripe-texture group flex flex-col justify-between overflow-hidden transition-colors hover:border-gold"
                }
              >
                <span className={LABEL + " text-gold"}>Reigning Champions</span>
                <span className="my-4 flex items-center gap-4">
                  <Crest size={56} name={stats.champion.teamName} />
                  <span className="heading-display text-2xl leading-none sm:text-3xl">
                    {stats.champion.teamName}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {stats.champion.seasonName} · {stats.champion.year}
                  <span className="ml-2 inline-block transition-transform group-hover:translate-x-1">→</span>
                </span>
              </Link>
            </TiltCard>
          </Reveal>
        )}

        <Stat index={1} label="Seasons" value={stats.seasonsPlayed} tone="text-brand" />
        <Stat index={2} label="Teams last season" value={stats.teamsLastSeason} />

        {stats.goldenBoot && (
          <Reveal index={3} className="col-span-2">
            <div className={SHELL + " flex h-full flex-col justify-between"}>
              <span className={LABEL + " text-gold"}>⚽ All-Time Golden Boot</span>
              <span className="mt-2 flex items-end justify-between gap-3">
                <span className="heading-display truncate text-xl leading-none sm:text-2xl">
                  {stats.goldenBoot.name}
                </span>
                <span className="heading-display shrink-0 text-2xl leading-none text-gold sm:text-3xl">
                  <CountUp value={stats.goldenBoot.goals} />
                </span>
              </span>
            </div>
          </Reveal>
        )}

        <Stat index={4} label="Matches played" value={stats.matchesPlayed} />
        <Stat index={5} label="Goals scored" value={stats.goalsScored} tone="text-pitch" />

        <Reveal index={6} className="col-span-2">
          <TiltCard glow="var(--pitch)" className="h-full rounded-block-lg">
            <Link
              href="/legacy/hall-of-fame"
              className={SHELL + " group flex h-full flex-col justify-between overflow-hidden transition-colors hover:border-pitch"}
            >
              <span className={LABEL}>🏆 Hall of Fame</span>
              <span className="mt-2 text-sm">
                {stats.mostDecorated ? (
                  <>
                    <span className="font-bold">{stats.mostDecorated.teamName}</span>{" "}
                    <span className="text-muted-foreground">
                      leads with {stats.mostDecorated.titles}{" "}
                      {stats.mostDecorated.titles === 1 ? "title" : "titles"}
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Every name that stuck</span>
                )}
                <span className="ml-2 inline-block transition-transform group-hover:translate-x-1">→</span>
              </span>
            </Link>
          </TiltCard>
        </Reveal>
      </div>
    </section>
  );
}

function Stat({
  index,
  label,
  value,
  tone = "text-foreground",
}: {
  index: number;
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <Reveal index={index}>
      <div className={SHELL + " flex h-full flex-col justify-between"}>
        <span className={LABEL}>{label}</span>
        <span className={"heading-display mt-3 text-3xl leading-none sm:text-4xl " + tone}>
          <CountUp value={value} />
        </span>
      </div>
    </Reveal>
  );
}
