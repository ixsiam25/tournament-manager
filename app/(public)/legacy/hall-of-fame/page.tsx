import Link from "next/link";
import { prisma } from "@/lib/db";
import type { SeasonArchive } from "@/lib/seasonArchive";
import { Crest } from "@/components/Crest";

export const revalidate = 60;

type Aggregate = { personId: string; name: string; count: number };

const MEDAL: Record<1 | 2 | 3, { border: string; chip: string; text: string }> = {
  1: { border: "border-l-gold", chip: "bg-gold/15", text: "text-gold" },
  2: { border: "border-l-silver", chip: "bg-silver/15", text: "text-silver" },
  3: { border: "border-l-bronze", chip: "bg-bronze/15", text: "text-bronze" },
};

export default async function HallOfFamePage() {
  const seasons = await prisma.season.findMany({
    where: { status: "ARCHIVED" },
    orderBy: { number: "asc" },
    select: { slug: true, number: true, name: true, year: true, championTeamName: true, resultsJson: true },
  });

  const people = await prisma.person.findMany({ select: { id: true, name: true } });
  const nameByPersonId = new Map(people.map((p) => [p.id, p.name]));

  const goalsByPerson = new Map<string, number>();
  const appearanceSeasonsByPerson = new Map<string, Set<string>>();
  const championshipCountByTeamName = new Map<string, number>();

  for (const season of seasons) {
    const archive = season.resultsJson as unknown as SeasonArchive | null;
    if (!archive) continue;

    for (const scorer of archive.topScorers) {
      if (!scorer.personId) continue;
      goalsByPerson.set(scorer.personId, (goalsByPerson.get(scorer.personId) ?? 0) + scorer.count);
    }
    for (const player of archive.players) {
      if (!player.personId) continue;
      const set = appearanceSeasonsByPerson.get(player.personId) ?? new Set<string>();
      set.add(season.slug);
      appearanceSeasonsByPerson.set(player.personId, set);
    }
    if (season.championTeamName) {
      championshipCountByTeamName.set(
        season.championTeamName,
        (championshipCountByTeamName.get(season.championTeamName) ?? 0) + 1,
      );
    }
  }

  function toAggregate(map: Map<string, number>): Aggregate[] {
    return [...map.entries()]
      .map(([personId, count]) => ({ personId, name: nameByPersonId.get(personId) ?? "Unknown", count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  const topScorers = toAggregate(goalsByPerson).slice(0, 10);
  const appearanceCounts = new Map<string, number>(
    [...appearanceSeasonsByPerson.entries()].map(([id, set]) => [id, set.size]),
  );
  const mostAppearances = toAggregate(appearanceCounts).slice(0, 10);
  const mostDecoratedTeam = [...championshipCountByTeamName.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

  return (
    <div>
      <div className="stripe-texture relative mb-10 overflow-hidden rounded-block-lg border-2 border-line-strong bg-surface px-6 py-10 shadow-block sm:px-10 sm:py-14">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em] text-brand">The names that stuck</p>
        <h1 className="heading-display text-4xl leading-none sm:text-6xl">Hall of Fame</h1>
        {mostDecoratedTeam && (
          <p className="mt-3 text-sm text-muted">
            Most decorated:{" "}
            <span className="font-bold text-foreground">
              {mostDecoratedTeam[0]} ({mostDecoratedTeam[1]}× champion)
            </span>
          </p>
        )}
      </div>

      <Section title="🏆 Trophy Shelf">
        {seasons.length === 0 ? (
          <p className="text-sm text-muted">No archived seasons yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {[...seasons].reverse().map((s) => (
              <Link
                key={s.slug}
                href={`/legacy/${s.slug}`}
                className="group flex flex-col items-center rounded-block-lg border-2 border-line-strong bg-surface p-4 text-center shadow-block transition-transform hover:-translate-y-1 hover:border-gold"
              >
                <span className="mb-2 text-2xl transition-transform group-hover:scale-110">🏆</span>
                <Crest size={36} name={s.championTeamName ?? s.name} />
                <p className="mt-2 line-clamp-1 text-sm font-bold">{s.championTeamName ?? "—"}</p>
                <p className="text-[11px] uppercase tracking-wide text-muted">
                  S{s.number} · {s.year}
                </p>
              </Link>
            ))}
          </div>
        )}
      </Section>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Section title="All-Time Top Scorers">
          <AggregateList icon="⚽" rows={topScorers} unit="goals" />
        </Section>
        <Section title="Most Appearances">
          <AggregateList icon="👕" rows={mostAppearances} unit="seasons" />
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{title}</h2>
      {children}
    </section>
  );
}

function AggregateList({ icon, rows, unit }: { icon: string; rows: Aggregate[]; unit: string }) {
  return (
    <div className="overflow-hidden rounded-block-lg border-2 border-line-strong bg-surface shadow-block">
      {rows.length === 0 ? (
        <p className="p-5 text-sm text-muted">No data yet.</p>
      ) : (
        <ol className="divide-y-2 divide-line">
          {rows.map((row, i) => {
            const medal = i < 3 ? MEDAL[(i + 1) as 1 | 2 | 3] : null;
            return (
              <li
                key={row.personId}
                className={
                  "flex items-center gap-3 px-5 py-3 " +
                  (medal ? "border-l-4 " + medal.border + " " + medal.chip : "")
                }
              >
                <span className={"w-6 shrink-0 text-center text-sm font-black " + (medal ? medal.text : "text-muted")}>
                  {i + 1}
                </span>
                <span className="flex-1 truncate text-base font-bold">
                  {icon} {row.name}
                </span>
                <span className="shrink-0 text-sm font-bold text-muted">
                  {row.count} {row.count === 1 ? unit.replace(/s$/, "") : unit}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
