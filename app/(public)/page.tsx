import Image from "next/image";
import Link from "next/link";
import { LiveStatusWidget } from "@/components/LiveStatusWidget";
import { PlayerStatList } from "@/components/PlayerStatList";
import { RegistrationOpenBanner } from "@/components/RegistrationOpenBanner";
import { Crest } from "@/components/Crest";
import { getLiveStatus } from "@/lib/liveStatus";
import { getTopScorers } from "@/lib/playerStats";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [data, topScorers, activeSeason] = await Promise.all([
    getLiveStatus(),
    getTopScorers(),
    prisma.season.findFirst({ where: { status: "ACTIVE" } }),
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
      <div
        className={
          "relative mb-8 overflow-hidden rounded-block-lg border-2 border-line-strong bg-surface px-6 py-10 shadow-block sm:px-10 sm:py-14 " +
          (heroPhoto ? "" : "stripe-texture")
        }
      >
        {heroPhoto && (
          <>
            <Image
              src={`/api/photos/${heroPhoto.key}`}
              alt=""
              fill
              sizes="800px"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-background/80" />
          </>
        )}
        <div className="relative">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em] text-brand">
            Bangladesh Football League
          </p>
          {activeSeason ? (
            <h1 className="heading-display text-4xl leading-none sm:text-6xl">
              Season <span className="text-pitch">{activeSeason.number}</span>
            </h1>
          ) : mostRecentArchived ? (
            <>
              <p className="text-xs font-bold uppercase tracking-wide text-muted">
                Most Recent Champions · {mostRecentArchived.name}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-4">
                <Crest size={64} name={mostRecentArchived.championTeamName ?? mostRecentArchived.name} />
                <h1 className="heading-display text-3xl leading-none sm:text-5xl">
                  🏆 {mostRecentArchived.championTeamName ?? "—"}
                </h1>
              </div>
              {mostRecentArchived.topScorerName && (
                <p className="mt-3 text-sm text-muted">⚽ Golden Boot: {mostRecentArchived.topScorerName}</p>
              )}
              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  href={`/legacy/${mostRecentArchived.slug}`}
                  className="rounded-block border-2 border-line-strong bg-background px-4 py-2 text-xs font-bold uppercase tracking-wide shadow-block hover:border-gold hover:text-gold"
                >
                  Relive it →
                </Link>
                <Link
                  href="/legacy"
                  className="rounded-block border-2 border-line-strong px-4 py-2 text-xs font-bold uppercase tracking-wide hover:border-pitch hover:text-pitch-dark"
                >
                  Full history
                </Link>
              </div>
            </>
          ) : (
            <h1 className="heading-display text-4xl leading-none sm:text-6xl">Between Seasons</h1>
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
    </div>
  );
}
