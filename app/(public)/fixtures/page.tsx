import Image from "next/image";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const ROUND_LABELS: Record<string, string> = {
  LEAGUE: "League",
  SEMIFINAL: "Semifinals",
  FINAL: "Final",
};

export default async function FixturesPage() {
  const matches = await prisma.match.findMany({
    include: { homeTeam: true, awayTeam: true },
    orderBy: [{ round: "asc" }, { scheduledAt: "asc" }, { createdAt: "asc" }],
  });

  const byRound = new Map<string, typeof matches>();
  for (const match of matches) {
    const list = byRound.get(match.round) ?? [];
    list.push(match);
    byRound.set(match.round, list);
  }

  let matchNumber = 0;

  return (
    <div>
      <h1 className="mb-6 heading-display text-2xl">Fixtures</h1>
      <div className="space-y-8">
        {["LEAGUE", "SEMIFINAL", "FINAL"].map((round) => {
          const list = byRound.get(round);
          if (!list || list.length === 0) return null;
          return (
            <section key={round}>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
                {ROUND_LABELS[round]}
              </h2>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                {list.map((match) => {
                  matchNumber += 1;
                  return (
                    <li key={match.id} className="flex items-center gap-4 px-6 py-5">
                      <span className="w-8 shrink-0 text-center text-sm font-bold text-muted tabular-nums">
                        {matchNumber}
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
                  );
                })}
              </ul>
            </section>
          );
        })}
        {matches.length === 0 && <p className="text-muted">No fixtures yet.</p>}
      </div>
    </div>
  );
}

function TeamLogo({ logoUrl, name }: { logoUrl?: string | null; name?: string }) {
  if (!logoUrl) return <span className="h-9 w-9 shrink-0 rounded-full bg-line" />;
  return (
    <Image
      src={logoUrl}
      alt={name ?? ""}
      width={36}
      height={36}
      className="shrink-0 rounded-full object-cover"
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
      <span className="min-w-20 shrink-0 rounded-full bg-background px-4 py-1.5 text-center text-base font-bold tabular-nums">
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
