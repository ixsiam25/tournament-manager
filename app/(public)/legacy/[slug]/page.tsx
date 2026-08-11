import Image from "next/image";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import type { SeasonArchive } from "@/lib/seasonArchive";
import { Crest } from "@/components/Crest";
import { LegacySquadPicker } from "@/components/LegacySquadPicker";

export const revalidate = 60;

const MEDAL: Record<
  1 | 2 | 3,
  { chip: string; block: string; text: string; border: string; label: string }
> = {
  1: { chip: "bg-gold/15", block: "bg-gold/10", text: "text-gold", border: "border-l-gold", label: "1st" },
  2: { chip: "bg-silver/15", block: "bg-silver/10", text: "text-silver", border: "border-l-silver", label: "2nd" },
  3: { chip: "bg-bronze/15", block: "bg-bronze/10", text: "text-bronze", border: "border-l-bronze", label: "3rd" },
};

export default async function LegacySeasonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const season = await prisma.season.findUnique({ where: { slug } });
  if (!season || !season.resultsJson) notFound();

  const archive = season.resultsJson as unknown as SeasonArchive;
  const mediaAssets = await prisma.mediaAsset.findMany({
    where: { seasonId: season.id },
    orderBy: { sortOrder: "asc" },
  });
  const hero = mediaAssets.find((m) => m.isHero) ?? null;

  const semis = archive.matches.filter((m) => m.round === "SEMIFINAL");
  const final = archive.matches.find((m) => m.round === "FINAL") ?? null;

  const totalGoals = archive.matchEvents.filter((e) => e.type === "GOAL").length;
  const totalCards = archive.matchEvents.filter((e) => e.type === "YELLOW_CARD" || e.type === "RED_CARD").length;

  // Referee fields were entered as free text, and assistantReferee sometimes
  // holds more than one name joined with a hyphen (e.g. "Siam-Muhaimin" for
  // two assistants on the same match) — split on it so the officials list
  // doesn't show mashed-together names as if they were one person.
  const officials = [
    ...new Set(
      archive.matches
        .flatMap((m) => [m.mainReferee, m.assistantReferee])
        .filter((n): n is string => !!n)
        .flatMap((n) => n.split("-"))
        .map((n) => n.trim())
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b));

  const championTeam = archive.championResult
    ? archive.teams.find((t) => t.id === archive.championResult!.championTeamId)
    : null;

  const podium = archive.finalStandings.slice(0, 3);

  return (
    <div>
      {/* Hero */}
      <div className="relative mb-8 overflow-hidden rounded-block-lg border-2 border-line-strong shadow-block">
        {hero ? (
          <div className="relative h-64 w-full sm:h-80">
            <Image src={`/api/photos/${hero.key}`} alt={hero.caption} fill sizes="800px" className="object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
          </div>
        ) : (
          <div className="stripe-texture h-40 w-full bg-pitch sm:h-48" />
        )}
        <div className={"px-5 py-6 sm:px-8 sm:py-8 " + (hero ? "absolute inset-x-0 bottom-0 text-white" : "bg-surface")}>
          <p className="text-xs font-bold uppercase tracking-[0.3em] opacity-80">
            Season {season.number} · {season.year}
          </p>
          <h1 className="heading-display mt-1 text-3xl sm:text-5xl">{season.name}</h1>
          {archive.championResult && (
            <div className="mt-4 flex items-center gap-3">
              <Crest size={44} name={archive.championResult.championTeamName} />
              <p className="heading-display text-lg sm:text-xl">
                🏆 {archive.championResult.championTeamName}
              </p>
            </div>
          )}
        </div>
      </div>

      {season.recap && <p className="mb-8 text-muted">{season.recap}</p>}

      {/* Stats strip */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatTile icon="🛡️" label="Teams" value={archive.summary.teams} />
        <StatTile icon="👕" label="Players" value={archive.summary.players} />
        <StatTile icon="🏟️" label="Matches" value={archive.summary.matches} />
        <StatTile icon="⚽" label="Goals" value={totalGoals} />
        <StatTile icon="🟨" label="Cards" value={totalCards} />
      </div>

      {/* Podium */}
      {podium.length === 3 && (
        <Section title="Final Table">
          <div className="flex items-end justify-center gap-3 sm:gap-6">
            <PodiumStep row={podium[1]} rank={2} />
            <PodiumStep row={podium[0]} rank={1} />
            <PodiumStep row={podium[2]} rank={3} />
          </div>
        </Section>
      )}

      {/* Knockout bracket */}
      {(semis.length > 0 || final) && (
        <Section title="Knockout">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch sm:gap-0">
            <div className="flex flex-1 flex-col justify-around gap-4">
              {semis.map((m) => (
                <FrozenMatchCard key={m.id} match={m} />
              ))}
            </div>
            {final && semis.length > 0 && (
              <div className="hidden w-14 shrink-0 sm:block" aria-hidden>
                <BracketConnector />
              </div>
            )}
            {final && (
              <div className="flex flex-1 flex-col justify-center">
                <p className="mb-2 text-center text-xs font-bold uppercase tracking-wide text-gold sm:text-left">
                  🏆 Final
                </p>
                <FrozenMatchCard match={final} highlight />
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Golden boot / assists */}
      <Section title="Golden Boot & Assists">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FrozenPlayerStatList icon="⚽" title="Top Scorers" rows={archive.topScorers} />
          <FrozenPlayerStatList icon="🅰️" title="Top Assists" rows={archive.topAssists} />
        </div>
      </Section>

      {/* Squads — defaults to the champion, dropdown to view any other team */}
      {archive.teams.length > 0 && (
        <Section title="Squads">
          <LegacySquadPicker
            teams={archive.teams}
            players={archive.players}
            defaultTeamId={championTeam?.id ?? archive.teams[0].id}
            championTeamId={championTeam?.id ?? null}
          />
        </Section>
      )}

      {/* Officials */}
      {officials.length > 0 && (
        <Section title="Match Officials">
          <p className="text-sm text-muted">{officials.join(", ")}</p>
        </Section>
      )}

      {/* Gallery */}
      {mediaAssets.length > 0 && (
        <Section title="Gallery">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {mediaAssets.map((m) => (
              <figure
                key={m.id}
                className="group overflow-hidden rounded-block-lg border-2 border-line-strong bg-surface shadow-block"
              >
                <div className="relative aspect-square overflow-hidden">
                  <Image
                    src={`/api/photos/${m.key}`}
                    alt={m.caption}
                    fill
                    sizes="260px"
                    className="object-cover transition-transform duration-300 group-hover:scale-110"
                  />
                </div>
                <figcaption className="px-3 py-2 text-xs text-muted">
                  {m.caption}
                  {m.credit && <span className="opacity-70"> — {m.credit}</span>}
                </figcaption>
              </figure>
            ))}
          </div>
        </Section>
      )}
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

function StatTile({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <div className="rounded-block-lg border-2 border-line-strong bg-surface p-4 text-center shadow-block">
      <p className="text-lg leading-none">{icon}</p>
      <p className="heading-display mt-1 text-2xl tabular-nums">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-wide text-muted">{label}</p>
    </div>
  );
}

const PODIUM_HEIGHT: Record<1 | 2 | 3, string> = {
  1: "h-28 sm:h-36",
  2: "h-20 sm:h-28",
  3: "h-14 sm:h-20",
};

function PodiumStep({ row, rank }: { row: SeasonArchive["finalStandings"][number]; rank: 1 | 2 | 3 }) {
  const medal = MEDAL[rank];
  return (
    <div className="flex w-20 flex-col items-center sm:w-28">
      <Crest size={rank === 1 ? 40 : 32} name={row.teamName} />
      <p className="mt-1.5 line-clamp-1 text-center text-xs font-bold sm:text-sm">{row.teamName}</p>
      <p className="text-[11px] font-bold text-muted">{row.points} pts</p>
      <div
        className={
          "mt-2 flex w-full items-start justify-center rounded-t-block-lg border-2 border-b-0 border-line-strong shadow-block " +
          medal.block +
          " " +
          PODIUM_HEIGHT[rank]
        }
      >
        <span className={"heading-display mt-2 text-2xl sm:text-3xl " + medal.text}>{rank}</span>
      </div>
    </div>
  );
}

function BracketConnector() {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
      <path
        d="M0,15 H45 V50"
        fill="none"
        stroke="var(--line-strong)"
        strokeWidth="3"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M0,85 H45 V50"
        fill="none"
        stroke="var(--line-strong)"
        strokeWidth="3"
        vectorEffect="non-scaling-stroke"
      />
      <path d="M45,50 H100" fill="none" stroke="var(--line-strong)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function FrozenMatchCard({ match, highlight }: { match: SeasonArchive["matches"][number]; highlight?: boolean }) {
  const wasDraw = match.homeScore === match.awayScore;
  const decidedOnPenalties = wasDraw && match.penaltyHomeScore !== null && match.penaltyAwayScore !== null;

  let note: string | null = null;
  if (wasDraw && match.winnerTeam) {
    if (decidedOnPenalties) {
      note = `${match.winnerTeam} won ${
        match.winnerTeam === match.homeTeam
          ? `${match.penaltyHomeScore}–${match.penaltyAwayScore}`
          : `${match.penaltyAwayScore}–${match.penaltyHomeScore}`
      } on pens`;
    } else if (match.extraTimePlayed) {
      note = `${match.winnerTeam} advances (after extra time)`;
    } else {
      note = `${match.winnerTeam} advances`;
    }
  } else if (!wasDraw && match.extraTimePlayed && match.winnerTeam) {
    note = `${match.winnerTeam} won after extra time`;
  }

  return (
    <div
      className={
        "rounded-block-lg border-2 p-4 shadow-block " +
        (highlight ? "border-gold bg-gold/5" : "border-line-strong bg-surface")
      }
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <Crest size={24} name={match.homeTeam} />
          <span className="truncate text-sm font-medium">{match.homeTeam ?? "TBD"}</span>
        </span>
        <span className="shrink-0 rounded-block bg-background px-2.5 py-1 text-sm font-bold tabular-nums">
          {match.homeScore} – {match.awayScore}
        </span>
        <span className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <span className="truncate text-right text-sm font-medium">{match.awayTeam ?? "TBD"}</span>
          <Crest size={24} name={match.awayTeam} />
        </span>
      </div>
      {note && <p className="mt-2 text-center text-xs uppercase tracking-wide text-muted">{note}</p>}
    </div>
  );
}

function FrozenPlayerStatList({
  icon,
  title,
  rows,
}: {
  icon: string;
  title: string;
  rows: { playerId: string; playerName: string; teamName: string; photoUrl: string | null; count: number }[];
}) {
  const top3 = rows.slice(0, 3);
  return (
    <div className="overflow-hidden rounded-block-lg border-2 border-line-strong bg-surface shadow-block">
      <h3 className="border-b-2 border-line-strong px-5 py-4 font-black uppercase tracking-wide">
        {icon} {title}
      </h3>
      {top3.length === 0 ? (
        <p className="p-5 text-sm text-muted">No data.</p>
      ) : (
        <ol className="divide-y-2 divide-line">
          {top3.map((row, i) => {
            const medal = MEDAL[(i + 1) as 1 | 2 | 3];
            return (
              <li key={row.playerId} className={"flex items-center gap-3 border-l-4 px-5 py-3 " + medal.border + " " + medal.chip}>
                <span className={"w-6 shrink-0 text-center text-sm font-black " + medal.text}>{i + 1}</span>
                {row.photoUrl ? (
                  <span className="relative h-14 w-9 shrink-0 overflow-hidden rounded-block border-2 border-line-strong">
                    <Image src={row.photoUrl} alt={row.playerName} fill sizes="36px" className="object-cover" />
                  </span>
                ) : (
                  <span className="h-14 w-9 shrink-0 rounded-block bg-line" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-bold">{row.playerName}</span>
                  <span className="block truncate text-xs text-muted">{row.teamName}</span>
                </span>
                <span className="shrink-0 text-xl font-black tabular-nums">{row.count}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
