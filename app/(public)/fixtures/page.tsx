import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Crest } from "@/components/Crest";
import { MATCH_DISPLAY_ORDER_BY } from "@/lib/matchOrder";

export const revalidate = 15;

const ROUND_LABELS: Record<string, string> = {
  LEAGUE: "League",
  SEMIFINAL: "Semifinals",
  FINAL: "Final",
};

export default async function FixturesPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  const { team: teamFilter } = await searchParams;

  const [matches, teams] = await Promise.all([
    prisma.match.findMany({
      include: { homeTeam: true, awayTeam: true },
      orderBy: MATCH_DISPLAY_ORDER_BY,
    }),
    prisma.team.findMany({ orderBy: { name: "asc" } }),
  ]);

  // Number against the full set first so match numbers stay stable whether
  // or not a team filter is applied.
  const numbered = matches.map((match, i) => ({ match, number: i + 1 }));
  const filtered = teamFilter
    ? numbered.filter(
        ({ match }) => match.homeTeamId === teamFilter || match.awayTeamId === teamFilter,
      )
    : numbered;

  const byRound = new Map<string, typeof filtered>();
  for (const item of filtered) {
    const list = byRound.get(item.match.round) ?? [];
    list.push(item);
    byRound.set(item.match.round, list);
  }

  const activeTeam = teams.find((t) => t.id === teamFilter);

  return (
    <div>
      <AutoRefresh />
      <h1 className="mb-4 heading-display text-2xl">Fixtures</h1>

      <p className="mb-6 rounded-block border-2 border-line-strong bg-surface px-4 py-3 text-xs text-muted sm:text-sm">
        Times below are per the published plan. The BFL committee reserves the right to adjust or
        overwrite any kickoff time on the day as needed.
      </p>

      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          href="/fixtures"
          className={
            "rounded-block border-2 px-3 py-1.5 text-xs font-bold uppercase tracking-wide " +
            (!teamFilter
              ? "border-pitch bg-pitch/10 text-pitch-dark"
              : "border-line text-muted hover:border-line-strong hover:text-foreground")
          }
        >
          All teams
        </Link>
        {teams.map((t) => (
          <Link
            key={t.id}
            href={`/fixtures?team=${t.id}`}
            className={
              "flex items-center gap-1.5 rounded-block border-2 px-3 py-1.5 text-xs font-bold uppercase tracking-wide " +
              (teamFilter === t.id
                ? "border-pitch bg-pitch/10 text-pitch-dark"
                : "border-line text-muted hover:border-line-strong hover:text-foreground")
            }
          >
            {t.logoUrl ? (
              <Image
                src={t.logoUrl}
                alt={t.name}
                width={20}
                height={20}
                className="rounded-block object-cover"
              />
            ) : (
              <Crest size={18} name={t.name} />
            )}
            {t.name}
          </Link>
        ))}
      </div>

      <div className="space-y-8">
        {["LEAGUE", "SEMIFINAL", "FINAL"].map((round) => {
          const list = byRound.get(round);
          if (!list || list.length === 0) return null;
          return (
            <section key={round}>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
                {ROUND_LABELS[round]}
              </h2>
              <ul className="divide-y-2 divide-line overflow-hidden rounded-block-lg border-2 border-line-strong bg-surface shadow-block">
                {list.map(({ match, number }) => (
                  <li
                    key={match.id}
                    className={
                      "flex items-center gap-3 border-l-4 px-4 py-4 sm:gap-4 sm:px-6 sm:py-5 " +
                      statusRowClass(match.status)
                    }
                  >
                    <span className="w-5 shrink-0 text-center text-xs font-bold text-muted tabular-nums sm:w-8 sm:text-sm">
                      {number}
                    </span>
                    <div className="flex min-w-0 flex-1 items-center justify-center gap-2 sm:gap-3">
                      <TeamName team={match.homeTeam} align="right" />
                      <span className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                        <TeamLogo logoUrl={match.homeTeam?.logoUrl} name={match.homeTeam?.name} />
                        <span className="text-sm font-bold text-muted sm:text-base">-</span>
                        <TeamLogo logoUrl={match.awayTeam?.logoUrl} name={match.awayTeam?.name} />
                      </span>
                      <TeamName team={match.awayTeam} align="left" />
                    </div>
                    <ScoreOrTime match={match} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-muted">
            {activeTeam ? `No fixtures found for ${activeTeam.name}.` : "No fixtures yet."}
          </p>
        )}
      </div>
    </div>
  );
}

function statusRowClass(status: string): string {
  if (status === "LIVE") return "border-l-live bg-live/10";
  if (status === "FINISHED") return "border-l-pitch bg-pitch/5";
  return "border-l-transparent bg-background/60";
}

function TeamName({
  team,
  align,
}: {
  team: { id: string; name: string } | null;
  align: "left" | "right";
}) {
  // Tailwind's build-time scanner needs each class name spelled out in full
  // (it doesn't execute this code), so the two alignments are two full
  // strings rather than one interpolated `text-${align}`.
  const alignClass = align === "right" ? "text-right" : "text-left";

  if (!team) {
    return (
      <span className={`min-w-0 flex-1 truncate text-sm font-medium sm:text-lg ${alignClass}`}>
        TBD
      </span>
    );
  }
  return (
    <Link
      href={`/teams/${team.id}`}
      className={`min-w-0 flex-1 truncate text-sm font-medium hover:underline sm:text-lg ${alignClass}`}
    >
      {team.name}
    </Link>
  );
}

function TeamLogo({ logoUrl, name }: { logoUrl?: string | null; name?: string }) {
  if (!logoUrl)
    return (
      <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center sm:h-[45px] sm:w-[45px]">
        <Crest size={30} name={name} />
      </span>
    );
  return (
    <Image
      src={logoUrl}
      alt={name ?? ""}
      width={45}
      height={45}
      className="h-[30px] w-[30px] shrink-0 rounded-block border border-line-strong object-cover sm:h-[45px] sm:w-[45px]"
    />
  );
}

// The whole tournament runs in one evening across two pitches, so a kickoff
// time plus which field is the only useful thing to show — and it has to be
// pinned to JST or the server and the client disagree about the hour.
const KICKOFF_TIME = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Tokyo",
});

function ScoreOrTime({
  match,
}: {
  match: {
    status: string;
    homeScore: number;
    awayScore: number;
    scheduledAt: Date | null;
    venue: string | null;
    winnerTeamId: string | null;
    homeTeamId: string | null;
    penaltyHomeScore: number | null;
    penaltyAwayScore: number | null;
    extraTimePlayed: boolean;
    homeTeam: { name: string } | null;
    awayTeam: { name: string } | null;
  };
}) {
  if (match.status === "FINISHED" || match.status === "LIVE") {
    const wasDraw = match.homeScore === match.awayScore;
    const decidedOnPenalties = wasDraw && match.penaltyHomeScore !== null && match.penaltyAwayScore !== null;
    const winnerName =
      match.winnerTeamId === match.homeTeamId ? match.homeTeam?.name : match.awayTeam?.name;

    // A drawn regulation score that extra time then broke isn't "wasDraw"
    // anymore (the running score already includes extra-time goals), so
    // that case is called out separately from the still-level-after-ET
    // cases below.
    let resultNote: string | null = null;
    if (wasDraw && match.winnerTeamId) {
      if (decidedOnPenalties) {
        resultNote = `${winnerName} won ${
          match.winnerTeamId === match.homeTeamId
            ? `${match.penaltyHomeScore}–${match.penaltyAwayScore}`
            : `${match.penaltyAwayScore}–${match.penaltyHomeScore}`
        } on pens`;
      } else if (match.extraTimePlayed) {
        resultNote = `${winnerName} advances (after extra time)`;
      } else {
        resultNote = `${winnerName} advances`;
      }
    } else if (!wasDraw && match.extraTimePlayed && match.winnerTeamId) {
      resultNote = `${winnerName} won after extra time`;
    }

    return (
      <span className="flex min-w-14 shrink-0 flex-col items-center gap-0.5 sm:min-w-20">
        <span className="rounded-block bg-background px-2.5 py-1 text-center text-sm font-bold tabular-nums sm:px-4 sm:py-1.5 sm:text-base">
          {match.homeScore} – {match.awayScore}
        </span>
        {resultNote && (
          <span className="text-center text-[10px] uppercase tracking-wide text-muted sm:text-xs">
            {resultNote}
          </span>
        )}
      </span>
    );
  }
  return (
    <span className="flex min-w-14 shrink-0 flex-col items-center gap-0.5 text-center sm:min-w-20">
      <span className="text-xs font-bold tabular-nums text-foreground sm:text-sm">
        {match.scheduledAt ? KICKOFF_TIME.format(match.scheduledAt) : "TBD"}
      </span>
      {match.venue && (
        <span className="text-[10px] uppercase tracking-wide text-muted sm:text-xs">
          {match.venue}
        </span>
      )}
    </span>
  );
}
