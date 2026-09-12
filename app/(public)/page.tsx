import { MediaPhoto } from "@/components/SafeImage";
import Link from "next/link";
import { LiveStatusWidget } from "@/components/LiveStatusWidget";
import { PlayerStatList } from "@/components/PlayerStatList";
import { RegistrationOpenBanner } from "@/components/RegistrationOpenBanner";
import { Crest } from "@/components/Crest";
import { Reveal } from "@/components/motion/Reveal";
import { LeagueBento } from "@/components/LeagueBento";
import { JerseyTeaser } from "@/components/JerseyTeaser";
import { getLiveStatus } from "@/lib/liveStatus";
import { getTopScorers } from "@/lib/playerStats";
import { getLeagueStats } from "@/lib/leagueStats";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [data, topScorers, activeSeason, leagueStats] = await Promise.all([
    getLiveStatus(),
    getTopScorers(),
    prisma.season.findFirst({ where: { status: "ACTIVE" } }),
    getLeagueStats(),
  ]);
  // Serialize Dates to ISO strings so the initial payload matches the shape
  // returned by the /api/public/live poll the client component falls back to.
  const initial = JSON.parse(JSON.stringify(data));

  const mostRecentArchived = activeSeason
    ? null
    : await prisma.season.findFirst({
        where: { status: "ARCHIVED" },
        orderBy: { number: "desc" },
        select: { id: true, slug: true, name: true, year: true, championTeamName: true, topScorerName: true },
      });

  const heroPhoto = mostRecentArchived
    ? await prisma.mediaAsset.findFirst({ where: { seasonId: mostRecentArchived.id, isHero: true } })
    : null;

  const registrationOpen = !!activeSeason?.registrationOpen && activeSeason.registrationSelfServeEnabled;

  return (
    <div>
      <JerseyTeaser />

      <div
        className={
          "stripe-texture relative mb-8 overflow-hidden rounded-block-lg border border-line bg-surface px-6 py-10 shadow-block sm:px-10 sm:py-14"
        }
      >
        {heroPhoto && (
          <>
            <MediaPhoto src={`/api/photos/${heroPhoto.key}`} alt="" sizes="800px" />
            <div className="absolute inset-0 bg-background/85" />
          </>
        )}
        <div className="relative">
          <Reveal>
            <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.32em] text-brand">
              Bangladesh Football League
            </p>
          </Reveal>
          {activeSeason ? (
            <>
              <Reveal index={1} distance={16}>
                <h1 className="heading-display text-5xl leading-[0.9] sm:text-7xl">
                  Season {activeSeason.number}
                </h1>
              </Reveal>
              <Reveal index={2}>
                <hr className="my-5 h-px border-0 bg-line" />
                <p className="lede max-w-prose">In progress. Standings, fixtures and live scores below.</p>
              </Reveal>
            </>
          ) : mostRecentArchived ? (
            <>
              <Reveal index={1} distance={16}>
                <div className="flex flex-wrap items-center gap-4">
                  <Crest size={60} name={mostRecentArchived.championTeamName ?? mostRecentArchived.name} />
                  <h1 className="heading-display text-4xl leading-[0.9] sm:text-6xl">
                    {mostRecentArchived.championTeamName ?? "—"}
                  </h1>
                </div>
              </Reveal>
              <Reveal index={2}>
                <hr className="my-5 h-px border-0 bg-line" />
                <p className="lede max-w-prose">
                  Champions of {mostRecentArchived.name}
                  {mostRecentArchived.topScorerName && (
                    <>
                      , the season{" "}
                      <span className="font-semibold not-italic text-foreground">
                        {mostRecentArchived.topScorerName}
                      </span>{" "}
                      finished as leading scorer
                    </>
                  )}
                  .
                </p>
              </Reveal>
              <Reveal index={3}>
                <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
                  <Link
                    href={`/legacy/${mostRecentArchived.slug}`}
                    className="rounded-block bg-foreground px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-background transition-colors hover:bg-brand"
                  >
                    Relive the season
                  </Link>
                  <Link
                    href="/legacy"
                    className="border-b border-line-strong pb-0.5 text-xs font-bold uppercase tracking-[0.12em] transition-colors hover:border-brand hover:text-brand"
                  >
                    Full history
                  </Link>
                </div>
              </Reveal>
            </>
          ) : (
            <>
              <Reveal index={1} distance={16}>
                <h1 className="heading-display text-5xl leading-[0.9] sm:text-7xl">Between Seasons</h1>
              </Reveal>
              <Reveal index={2}>
                <hr className="my-5 h-px border-0 bg-line" />
                <p className="lede max-w-prose">The next campaign hasn&apos;t kicked off yet.</p>
              </Reveal>
            </>
          )}
        </div>
      </div>

      {registrationOpen && activeSeason && <RegistrationOpenBanner seasonName={activeSeason.name} />}

      {activeSeason && (
        <>
          <LiveStatusWidget initial={initial} />
          <div className="mt-8">
            <PlayerStatList
              title="Top Scorers"
              icon="⚽"
              rows={topScorers}
              limit={3}
              viewAllHref="/players"
            />
          </div>
        </>
      )}

      <LeagueBento stats={leagueStats} />
    </div>
  );
}
