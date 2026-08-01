import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Crest } from "@/components/Crest";

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
      orderBy: [{ round: "asc" }, { scheduledAt: "asc" }, { createdAt: "asc" }],
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
                width={16}
                height={16}
                className="rounded-block object-cover"
              />
            ) : (
              <Crest size={14} name={t.name} />
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
                      <span className="min-w-0 flex-1 truncate text-right text-sm font-medium sm:text-lg">
                        {match.homeTeam?.name ?? "TBD"}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                        <TeamLogo logoUrl={match.homeTeam?.logoUrl} name={match.homeTeam?.name} />
                        <span className="text-sm font-bold text-muted sm:text-base">-</span>
                        <TeamLogo logoUrl={match.awayTeam?.logoUrl} name={match.awayTeam?.name} />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium sm:text-lg">
                        {match.awayTeam?.name ?? "TBD"}
                      </span>
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

function TeamLogo({ logoUrl, name }: { logoUrl?: string | null; name?: string }) {
  if (!logoUrl)
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center sm:h-9 sm:w-9">
        <Crest size={24} name={name} />
      </span>
    );
  return (
    <Image
      src={logoUrl}
      alt={name ?? ""}
      width={36}
      height={36}
      className="h-6 w-6 shrink-0 rounded-block border border-line-strong object-cover sm:h-9 sm:w-9"
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
  };
}) {
  if (match.status === "FINISHED" || match.status === "LIVE") {
    return (
      <span className="min-w-14 shrink-0 rounded-block bg-background px-2.5 py-1 text-center text-sm font-bold tabular-nums sm:min-w-20 sm:px-4 sm:py-1.5 sm:text-base">
        {match.homeScore} – {match.awayScore}
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
