import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { StartMatchButton } from "@/components/StartMatchButton";
import { Crest } from "@/components/Crest";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const [teamCount, playerCount, matchCount, liveMatch, upcoming] = await Promise.all([
    prisma.team.count(),
    prisma.player.count(),
    prisma.match.count(),
    prisma.match.findFirst({
      where: { status: "LIVE" },
      include: { homeTeam: true, awayTeam: true },
    }),
    prisma.match.findMany({
      where: { status: "SCHEDULED" },
      include: { homeTeam: true, awayTeam: true },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
      take: 3,
    }),
  ]);

  return (
    <div>
      <h1 className="mb-6 heading-display text-2xl">Dashboard</h1>

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

      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-muted">
        Upcoming matches
      </h2>
      {upcoming.length === 0 ? (
        <p className="text-sm text-muted">No upcoming fixtures.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {upcoming.map((m) => (
            <li key={m.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="flex min-w-0 flex-wrap items-center gap-2 sm:flex-1 sm:gap-3">
                <DashboardTeamLogo logoUrl={m.homeTeam?.logoUrl} name={m.homeTeam?.name} />
                <span className="text-sm font-bold sm:text-base">{m.homeTeam?.name ?? "TBD"}</span>
                <span className="shrink-0 text-xs text-muted sm:text-sm">vs</span>
                <span className="text-sm font-bold sm:text-base">{m.awayTeam?.name ?? "TBD"}</span>
                <DashboardTeamLogo logoUrl={m.awayTeam?.logoUrl} name={m.awayTeam?.name} />
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 sm:items-end">
                <div className="flex items-center justify-between gap-3">
                  {m.scheduledAt && (
                    <p className="text-xs text-muted">{new Date(m.scheduledAt).toLocaleString()}</p>
                  )}
                  <StartMatchButton matchId={m.id} disabled={!m.homeTeamId || !m.awayTeamId} />
                </div>
                {(m.mainReferee || m.assistantReferee) && (
                  <p className="text-xs text-muted">
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

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/admin/teams" className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:bg-surface">
          Manage teams
        </Link>
        <Link href="/admin/players" className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:bg-surface">
          Manage players
        </Link>
        <Link href="/admin/fixtures" className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:bg-surface">
          Manage fixtures
        </Link>
      </div>
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

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 text-center">
      <p className="heading-display text-3xl tabular-nums">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-wide text-muted">{label}</p>
    </div>
  );
}
