import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { AutoRefresh } from "@/components/AutoRefresh";

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
            {t.logoUrl && (
              <Image
                src={t.logoUrl}
                alt={t.name}
                width={16}
                height={16}
                className="rounded-block object-cover"
              />
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
                  <li key={match.id} className="flex items-center gap-4 px-6 py-5">
                    <span className="w-8 shrink-0 text-center text-sm font-bold text-muted tabular-nums">
                      {number}
                    </span>
                    <div className="flex flex-1 items-center justify-between gap-3">
                      <span className="flex flex-1 items-center justify-end gap-3 text-right text-lg font-medium">
                        {match.homeTeam?.name ?? "TBD"}
                        <TeamLogo logoUrl={match.homeTeam?.logoUrl} name={match.homeTeam?.name} />
                      </span>
                      <ScoreOrTime match={match} />
                      <span className="flex flex-1 items-center gap-3 text-lg font-medium">
                        <TeamLogo logoUrl={match.awayTeam?.logoUrl} name={match.awayTeam?.name} />
                        {match.awayTeam?.name ?? "TBD"}
                      </span>
                    </div>
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

function TeamLogo({ logoUrl, name }: { logoUrl?: string | null; name?: string }) {
  if (!logoUrl) return <span className="h-9 w-9 shrink-0 rounded-block bg-line" />;
  return (
    <Image
      src={logoUrl}
      alt={name ?? ""}
      width={36}
      height={36}
      className="shrink-0 rounded-block border border-line-strong object-cover"
    />
  );
}

function ScoreOrTime({
  match,
}: {
  match: { status: string; homeScore: number; awayScore: number; scheduledAt: Date | null };
}) {
  if (match.status === "FINISHED" || match.status === "LIVE") {
    return (
      <span className="min-w-20 shrink-0 rounded-block bg-background px-4 py-1.5 text-center text-base font-bold tabular-nums">
        {match.homeScore} – {match.awayScore}
      </span>
    );
  }
  return (
    <span className="min-w-20 shrink-0 text-center text-sm text-muted">
      {match.scheduledAt ? new Date(match.scheduledAt).toLocaleDateString() : "TBD"}
    </span>
  );
}
