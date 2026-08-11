import Link from "next/link";
import { prisma } from "@/lib/db";
import { Crest } from "@/components/Crest";

export const revalidate = 60;

export default async function LegacyIndexPage() {
  const seasons = await prisma.season.findMany({
    where: { status: "ARCHIVED" },
    orderBy: { number: "desc" },
    select: {
      slug: true,
      number: true,
      name: true,
      year: true,
      championTeamName: true,
      topScorerName: true,
      resultsJson: true,
    },
  });

  return (
    <div>
      <div className="stripe-texture relative mb-10 overflow-hidden rounded-block-lg border-2 border-line-strong bg-surface px-6 py-10 shadow-block sm:px-10 sm:py-14">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em] text-brand">Every season. Every champion.</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="heading-display text-4xl leading-none sm:text-6xl">Legacy</h1>
          <Link
            href="/legacy/hall-of-fame"
            className="rounded-block border-2 border-line-strong bg-background px-4 py-2 text-xs font-bold uppercase tracking-wide shadow-block transition-transform hover:-translate-y-0.5 hover:border-gold hover:text-gold"
          >
            🏆 Hall of Fame →
          </Link>
        </div>
      </div>

      {seasons.length === 0 ? (
        <p className="text-muted">No past seasons archived yet.</p>
      ) : (
        <ol className="relative">
          {/* The timeline spine — a single vertical line every season card hangs off. */}
          <div
            aria-hidden
            className="absolute left-[27px] top-2 bottom-2 w-0.5 bg-line-strong sm:left-[35px]"
          />
          {seasons.map((s, i) => {
            const stats = s.resultsJson as { summary?: { teams: number; matches: number } } | null;
            return (
              <li
                key={s.slug}
                className="animate-card-in relative mb-6 pl-16 sm:pl-20"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="absolute left-0 top-0 flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-line-strong bg-pitch text-white shadow-block sm:h-[70px] sm:w-[70px]">
                  <span className="heading-display text-lg sm:text-2xl">{s.number}</span>
                </div>
                <Link
                  href={`/legacy/${s.slug}`}
                  className="block rounded-block-lg border-2 border-line-strong bg-surface p-5 shadow-block transition-transform hover:-translate-y-0.5 hover:border-pitch sm:p-6"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-muted">
                      Season {s.number} · {s.year}
                    </p>
                    {i === 0 && (
                      <span className="rounded-block bg-gold/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold">
                        Most recent
                      </span>
                    )}
                  </div>
                  <p className="mt-1 heading-display text-xl sm:text-2xl">{s.name}</p>
                  <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
                    {s.championTeamName && (
                      <span className="flex items-center gap-2">
                        <Crest size={30} name={s.championTeamName} />
                        <span>
                          <span className="block text-[10px] font-bold uppercase tracking-wide text-muted">
                            Champions
                          </span>
                          <span className="block font-bold">{s.championTeamName}</span>
                        </span>
                      </span>
                    )}
                    {s.topScorerName && (
                      <span>
                        <span className="block text-[10px] font-bold uppercase tracking-wide text-muted">
                          ⚽ Golden Boot
                        </span>
                        <span className="block font-bold">{s.topScorerName}</span>
                      </span>
                    )}
                    {stats?.summary && (
                      <span className="ml-auto text-xs text-muted">
                        {stats.summary.teams} teams · {stats.summary.matches} matches
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
