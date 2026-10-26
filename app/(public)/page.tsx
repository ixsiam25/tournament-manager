import { MediaPhoto } from "@/components/SafeImage";
import Link from "next/link";
import { LiveStatusWidget } from "@/components/LiveStatusWidget";
import { PlayerStatList } from "@/components/PlayerStatList";
import { Crest } from "@/components/Crest";
import { Reveal } from "@/components/motion/Reveal";
import { LeagueBento } from "@/components/LeagueBento";
import { JerseyTeaser } from "@/components/JerseyTeaser";
import { getLiveStatus } from "@/lib/liveStatus";
import { getTopScorers } from "@/lib/playerStats";
import { getLeagueStats } from "@/lib/leagueStats";
import { prisma } from "@/lib/db";
import { getActiveSeason } from "@/lib/currentSeason";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [data, topScorers, activeSeason, leagueStats] = await Promise.all([
    getLiveStatus(),
    getTopScorers(),
    getActiveSeason(),
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
  const counts = activeSeason
    ? {
        teams: await prisma.team.count({ where: { seasonId: activeSeason.id } }),
        players: await prisma.player.count({ where: { seasonId: activeSeason.id, status: "ACTIVE" } }),
        matches: await prisma.match.count({ where: { seasonId: activeSeason.id } }),
      }
    : { teams: 0, players: 0, matches: 0 };
  const nextFixture = data.status === "IDLE" ? data.nextFixture : null;

  return (
    <div>
      <section className="relative mb-8 overflow-hidden rounded-3xl bg-gradient-to-br from-[#7a1128] via-[#4a0b1a] to-[#14100f] p-7 text-white shadow-lg sm:p-10">
        {heroPhoto && (
          <>
            <MediaPhoto src={`/api/photos/${heroPhoto.key}`} alt="" sizes="800px" />
            <div className="absolute inset-0 bg-black/60" />
          </>
        )}
        {/* pitch markings: a quiet nod to the game, behind the text */}
        <svg aria-hidden className="pointer-events-none absolute -right-10 -top-6 h-64 w-64 text-white/[0.07]" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="1.2">
          <circle cx="50" cy="50" r="30" />
          <circle cx="50" cy="50" r="2" fill="currentColor" />
          <path d="M50 0v100M0 50h100" />
        </svg>
        <div className="relative">
          <Reveal>
            <p className="mb-4 flex flex-wrap items-center gap-3 text-[11px] font-bold uppercase tracking-[0.32em] text-white/70">
              Bangladesh Football League
              {activeSeason && (
                <span className={"rounded-full px-2.5 py-1 text-[10px] tracking-[0.18em] " + (data.status === "LIVE" ? "animate-pulse bg-red-500 text-white" : registrationOpen ? "bg-emerald-400 text-black" : "bg-white/15 text-white")}>
                  {data.status === "LIVE" ? "● Live now" : registrationOpen ? "Registration open" : "In progress"}
                </span>
              )}
            </p>
          </Reveal>
          {activeSeason ? (
            <>
              <Reveal index={1} distance={16}>
                <h1 className="heading-display text-6xl leading-[0.9] sm:text-8xl">Season {activeSeason.number}</h1>
              </Reveal>
              <Reveal index={2}>
                <p className="mt-4 max-w-prose text-lg text-white/80">
                  {registrationOpen ? "Applications are open — sign up, get your own player card, and join the league." : "Fixtures, standings and live scores, all in one place."}
                </p>
                <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3">
                  {[
                    ["Teams", counts.teams],
                    ["Players", counts.players],
                    ["Matches", counts.matches],
                  ].map(([label, n]) => (
                    <div key={label as string}>
                      <dd className="heading-display text-4xl tabular-nums">{n}</dd>
                      <dt className="text-[11px] uppercase tracking-[0.2em] text-white/60">{label}</dt>
                    </div>
                  ))}
                </dl>
              </Reveal>
              {nextFixture && data.status !== "LIVE" && (
                <Reveal index={3}>
                  <Link href="/fixtures" className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl bg-black/30 px-5 py-4 backdrop-blur-sm transition hover:bg-black/40">
                    <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">Next match</span>
                    <span className="flex items-center gap-2 font-bold">
                      <Crest size={28} name={nextFixture.homeTeam?.name ?? "TBD"} />
                      {nextFixture.homeTeam?.name ?? "TBD"}
                      <span className="text-white/50">vs</span>
                      {nextFixture.awayTeam?.name ?? "TBD"}
                      <Crest size={28} name={nextFixture.awayTeam?.name ?? "TBD"} />
                    </span>
                    {nextFixture.scheduledAt && <span className="text-sm text-white/70">{new Date(nextFixture.scheduledAt).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
                  </Link>
                </Reveal>
              )}
              <Reveal index={4}>
                <div className="mt-7 flex flex-wrap gap-3">
                  {registrationOpen && (
                    <Link href="/register" className="rounded-full bg-white px-6 py-3 text-sm font-bold text-[#5a0c1d] shadow-lg transition hover:scale-[1.03]">
                      Register to play →
                    </Link>
                  )}
                  <Link href="/standings" className="rounded-full border border-white/40 px-5 py-3 text-sm font-bold transition hover:bg-white/10">
                    Standings
                  </Link>
                  <Link href="/fixtures" className="rounded-full border border-white/40 px-5 py-3 text-sm font-bold transition hover:bg-white/10">
                    Fixtures
                  </Link>
                </div>
              </Reveal>
            </>
          ) : mostRecentArchived ? (
            <>
              <Reveal index={1} distance={16}>
                <div className="flex flex-wrap items-center gap-4">
                  <Crest size={72} name={mostRecentArchived.championTeamName ?? mostRecentArchived.name} />
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-amber-300">🏆 Champions</p>
                    <h1 className="heading-display text-4xl leading-[0.95] sm:text-6xl">{mostRecentArchived.championTeamName ?? "—"}</h1>
                  </div>
                </div>
              </Reveal>
              <Reveal index={2}>
                <p className="mt-4 max-w-prose text-lg text-white/80">
                  {mostRecentArchived.name}
                  {mostRecentArchived.topScorerName && (
                    <>
                      {" "}· <span className="font-semibold text-white">{mostRecentArchived.topScorerName}</span> finished as leading scorer
                    </>
                  )}
                  .
                </p>
              </Reveal>
              <Reveal index={3}>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Link href={`/legacy/${mostRecentArchived.slug}`} className="rounded-full bg-white px-6 py-3 text-sm font-bold text-[#5a0c1d] shadow-lg transition hover:scale-[1.03]">
                    Relive the season →
                  </Link>
                  <Link href="/legacy" className="rounded-full border border-white/40 px-5 py-3 text-sm font-bold transition hover:bg-white/10">
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
                <p className="mt-4 max-w-prose text-lg text-white/80">The next campaign hasn&apos;t kicked off yet.</p>
              </Reveal>
            </>
          )}
        </div>
      </section>

      <JerseyTeaser />

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
