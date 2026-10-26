import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentSeason } from "@/lib/currentSeason";
import { getSeasonProgress } from "@/lib/seasonProgress";
import { ApplicationLinkCard } from "@/components/ApplicationLinkCard";
import { StartMatchButton } from "@/components/StartMatchButton";
import { Crest } from "@/components/Crest";
import { getSessionUser } from "@/lib/userAuth";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  // The layout already gated ADMIN|SCORER; re-checked here only to decide
  // whether to show the management quick-links below (SCORER shouldn't).
  const user = await getSessionUser(["ADMIN", "SCORER"]);
  const isAdmin = user?.role === "ADMIN";
  const season = await getCurrentSeason();
  const seasonId = season?.id ?? "none";
  const archived = season?.status === "ARCHIVED";
  const steps = isAdmin && season && !archived ? await getSeasonProgress(season) : [];
  const nextStep = steps.find((st) => st.status === "current");
  const doneCount = steps.filter((st) => st.status === "done").length;
  const pendingApps = isAdmin && season ? await prisma.registration.count({ where: { seasonId, status: "PENDING" } }) : 0;
  const [teamCount, playerCount, matchCount, liveMatch, upcoming] = await Promise.all([
    prisma.team.count({ where: { seasonId } }),
    prisma.player.count({ where: { seasonId, status: "ACTIVE" } }),
    prisma.match.count({ where: { seasonId } }),
    prisma.match.findFirst({
      where: { seasonId, status: "LIVE" },
      include: { homeTeam: true, awayTeam: true },
    }),
    prisma.match.findMany({
      where: { seasonId, status: "SCHEDULED" },
      include: { homeTeam: true, awayTeam: true },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
      take: 3,
    }),
  ]);

  return (
    <div>
      <h1 className="mb-6 heading-display text-2xl">Dashboard</h1>

      {isAdmin && (
        <div className="mb-6 space-y-4">
          {!season || archived ? (
            <section className="rounded-2xl border-2 border-pitch bg-pitch/5 p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-pitch">{season ? `${season.name} is finished` : "Welcome"}</p>
              <h2 className="mt-1 text-xl font-bold">Ready for the next season?</h2>
              <p className="mt-1 text-sm text-muted-foreground">Create it in a couple of minutes — you can change every detail later.</p>
              <Link href="/admin/season/rollover" className="mt-4 inline-block rounded-full bg-pitch px-5 py-2 text-sm font-bold text-white">
                Create a new season
              </Link>
            </section>
          ) : (
            <>
              {nextStep && (
                <section className="rounded-2xl border-2 border-pitch bg-pitch/5 p-5" data-testid="next-step">
                  <p className="text-xs font-bold uppercase tracking-wide text-pitch">
                    {season.name} · Step {doneCount + 1} of {steps.length}
                  </p>
                  <h2 className="mt-1 text-xl font-bold">Next: {nextStep.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{nextStep.detail}</p>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    {nextStep.actions
                      .filter((a) => a.href)
                      .slice(0, 2)
                      .map((a) => (
                        <Link key={a.label} href={a.href!} className={a.primary ? "rounded-full bg-pitch px-5 py-2 text-sm font-bold text-white" : "text-sm font-medium text-pitch underline"}>
                          {a.label}
                        </Link>
                      ))}
                    <Link href="/admin/season" className="text-sm text-muted-foreground underline">
                      See all steps
                    </Link>
                  </div>
                </section>
              )}
              {season.registrationOpen && season.registrationSelfServeEnabled && <ApplicationLinkCard deadline={season.applicationDeadline?.toISOString() ?? null} />}
            </>
          )}
        </div>
      )}

      {liveMatch && (
        <Link
          href={`/admin/live/${liveMatch.id}`}
          className="mb-6 flex items-center justify-between rounded-2xl border border-live/30 bg-live/10 px-5 py-4 text-live"
        >
          <span>
            <span className="font-bold">
              🔴 LIVE: {liveMatch.homeTeam?.name} {liveMatch.homeScore} – {liveMatch.awayScore}{" "}
              {liveMatch.awayTeam?.name}
            </span>
            {(liveMatch.mainReferee || liveMatch.assistantReferee) && (
              <span className="ml-3 text-xs font-medium">
                {liveMatch.mainReferee && <>Ref: {liveMatch.mainReferee}</>}
                {liveMatch.mainReferee && liveMatch.assistantReferee && " · "}
                {liveMatch.assistantReferee && <>Assistant: {liveMatch.assistantReferee}</>}
              </span>
            )}
          </span>
          <span className="text-sm font-medium underline">Open console →</span>
        </Link>
      )}

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Teams" value={teamCount} />
        <StatCard label="Players" value={playerCount} />
        <StatCard label="Matches" value={matchCount} />
      </div>

      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-muted-foreground">
        Upcoming matches
      </h2>
      {upcoming.length === 0 ? (
        <p className="text-sm text-muted-foreground">No upcoming fixtures.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {upcoming.map((m) => (
            <li key={m.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="flex min-w-0 flex-wrap items-center gap-2 sm:flex-1 sm:gap-3">
                <DashboardTeamLogo logoUrl={m.homeTeam?.logoUrl} name={m.homeTeam?.name} />
                <span className="text-sm font-bold sm:text-base">{m.homeTeam?.name ?? "TBD"}</span>
                <span className="shrink-0 text-xs text-muted-foreground sm:text-sm">vs</span>
                <span className="text-sm font-bold sm:text-base">{m.awayTeam?.name ?? "TBD"}</span>
                <DashboardTeamLogo logoUrl={m.awayTeam?.logoUrl} name={m.awayTeam?.name} />
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 sm:items-end">
                <div className="flex items-center justify-between gap-3">
                  {m.scheduledAt && (
                    <p className="text-xs text-muted-foreground">{new Date(m.scheduledAt).toLocaleString()}</p>
                  )}
                  <StartMatchButton matchId={m.id} disabled={!m.homeTeamId || !m.awayTeamId} />
                </div>
                {(m.mainReferee || m.assistantReferee) && (
                  <p className="text-xs text-muted-foreground">
                    {m.mainReferee && (
                      <span>
                        Ref: <span className="font-medium text-foreground">{m.mainReferee}</span>
                      </span>
                    )}
                    {m.mainReferee && m.assistantReferee && <span className="mx-1.5">·</span>}
                    {m.assistantReferee && (
                      <span>
                        Assistant: <span className="font-medium text-foreground">{m.assistantReferee}</span>
                      </span>
                    )}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {isAdmin && (
        <>
          <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-muted-foreground">Jump to</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <QuickLink href="/admin/registrations" title="Applications" text={pendingApps > 0 ? `${pendingApps} waiting for your review` : "Review and approve players who applied"} badge={pendingApps} />
            <QuickLink href="/admin/season/teams" title="Teams" text="Names, logos, captains and managers" />
            <QuickLink href="/admin/players" title="Players" text="Rosters, releases and transfers" />
            <QuickLink href="/admin/fixtures" title="Fixtures" text="Schedule matches and run them live" />
          </div>
        </>
      )}
    </div>
  );
}

function DashboardTeamLogo({ logoUrl, name }: { logoUrl?: string | null; name?: string }) {
  if (!logoUrl) return <Crest size={35} name={name} />;
  return (
    <Image
      src={logoUrl}
      alt={name ?? ""}
      width={50}
      height={50}
      className="h-[35px] w-[35px] shrink-0 rounded-full object-cover sm:h-[50px] sm:w-[50px]"
    />
  );
}

function QuickLink({ href, title, text, badge }: { href: string; title: string; text: string; badge?: number }) {
  return (
    <Link href={href} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4 hover:border-pitch">
      <span>
        <span className="block font-bold">{title}</span>
        <span className="block text-sm text-muted-foreground">{text}</span>
      </span>
      {badge ? <span className="rounded-full bg-live px-2.5 py-0.5 text-xs font-bold text-white">{badge}</span> : <span aria-hidden className="text-muted-foreground">→</span>}
    </Link>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 text-center">
      <p className="heading-display text-3xl tabular-nums">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}
