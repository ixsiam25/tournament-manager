import { prisma } from "@/lib/db";
import { buildSeasonArchive } from "@/lib/seasonArchive";
import { putObject } from "@/lib/mediaStore";
import type { SeasonFormatConfig } from "@/lib/seasonFormat";
import { getActiveSeason, DEFAULT_TOURNAMENT_SLUG } from "./currentSeason";

export type PreflightResult = {
  ok: boolean;
  liveMatchCount: number;
  unfinishedMatchCount: number;
  unresolvedDrawCount: number;
};

/** Refuses unless every match is FINISHED, none are LIVE, and any drawn
 * knockout has a `winnerTeamId` set. Only meaningful when there's an
 * active season with matches to check — see `getRolloverStatus`. */
export async function checkPreflight(seasonId: string): Promise<PreflightResult> {
  const [liveMatchCount, unfinishedMatchCount, unresolvedDraws] = await Promise.all([
    prisma.match.count({ where: { seasonId, status: "LIVE" } }),
    prisma.match.count({ where: { seasonId, status: { not: "FINISHED" } } }),
    prisma.match.count({
      where: {
        seasonId,
        round: { in: ["SEMIFINAL", "FINAL"] },
        status: "FINISHED",
        winnerTeamId: null,
      },
    }),
  ]);
  return {
    ok: liveMatchCount === 0 && unfinishedMatchCount === 0 && unresolvedDraws === 0,
    liveMatchCount,
    unfinishedMatchCount,
    unresolvedDrawCount: unresolvedDraws,
  };
}

export type RolloverStatus = {
  activeSeason: { id: string; number: number; name: string } | null;
  preflight: PreflightResult | null;
  nextSeasonNumber: number;
};

export async function getRolloverStatus(): Promise<RolloverStatus> {
  const [current, maxSeason] = await Promise.all([
    getActiveSeason(),
    prisma.season.aggregate({ _max: { number: true } }),
  ]);
  const activeSeason = current ? { id: current.id, number: current.number, name: current.name } : null;

  return {
    activeSeason,
    preflight: activeSeason ? await checkPreflight(activeSeason.id) : null,
    nextSeasonNumber: (maxSeason._max.number ?? 0) + 1,
  };
}

/** Freezes the current active season — builds the archive, writes it to
 * `Season.resultsJson` and an R2 copy. The live rows stay in place (they
 * carry a seasonId); freezing only locks the edition against further edits. */
export async function freezeActiveSeason(): Promise<{ seasonId: string; archive: Awaited<ReturnType<typeof buildSeasonArchive>>; backupStored: boolean }> {
  const season = await getActiveSeason();
  if (!season) throw new Error("No active season to freeze");

  const preflight = await checkPreflight(season.id);
  if (!preflight.ok) {
    throw new Error("Preflight failed — every match must be FINISHED and every knockout draw resolved before freezing");
  }

  const archive = await buildSeasonArchive(season.id);
  const final = archive.matches.find((m) => m.round === "FINAL");
  const runnerUpTeamName =
    final && archive.championResult
      ? final.homeTeam === archive.championResult.championTeamName
        ? final.awayTeam
        : final.homeTeam
      : null;

  await prisma.season.update({
    where: { id: season.id },
    data: {
      status: "ARCHIVED",
      resultsJson: archive as object,
      championTeamName: archive.championResult?.championTeamName ?? null,
      runnerUpTeamName,
      topScorerName: archive.topScorers[0]?.playerName ?? null,
    },
  });

  // The DB row above is the source of truth; this R2 copy is an independent
  // backup. By now the season is already ARCHIVED, so a store failure must
  // not turn the freeze into an error — report it instead of throwing.
  let backupStored = true;
  try {
    await putObject(`archives/season-${season.slug}.json`, JSON.stringify(archive, null, 2), "application/json");
  } catch (error) {
    backupStored = false;
    console.error(`[rollover] archive backup to R2 failed for ${season.slug}:`, error);
  }

  return { seasonId: season.id, archive, backupStored };
}

export type OpenSeasonInput = {
  number: number;
  name: string;
  slug: string;
  year: number;
  teamFormation: "UNDECIDED" | "BATCH" | "AUCTION" | "MANUAL" | "DRAFT" | "BALANCED_RANDOM";
  targetTeamCount?: number | null;
  squadSizeMin: number;
  squadSizeMax: number;
  registrationSelfServeEnabled: boolean;
  registrationExcelImportEnabled: boolean;
  /** Open the public application form right away (the usual flow). */
  openRegistrationNow?: boolean;
  formatConfig: SeasonFormatConfig;
};

/** Creates the next edition as ACTIVE and makes it the tournament's current
 * one. Nothing is deleted: earlier editions keep their live rows (teams,
 * players, matches, predictions), all scoped by seasonId. */
export async function openNextSeason(input: OpenSeasonInput): Promise<{ seasonId: string }> {
  const season = await prisma.$transaction(async (tx) => {
    const tournament = await tx.tournament.findUnique({ where: { slug: DEFAULT_TOURNAMENT_SLUG } });
    if (!tournament) throw new Error(`Tournament "${DEFAULT_TOURNAMENT_SLUG}" not found`);
    const created = await tx.season.create({
      data: {
        tournamentId: tournament.id,
        number: input.number,
        name: input.name,
        slug: input.slug,
        year: input.year,
        status: "ACTIVE",
        teamFormation: input.teamFormation,
        targetTeamCount: input.targetTeamCount ?? null,
        squadSizeMin: input.squadSizeMin,
        squadSizeMax: input.squadSizeMax,
        registrationOpen: (input.openRegistrationNow ?? true) && input.registrationSelfServeEnabled,
        registrationSelfServeEnabled: input.registrationSelfServeEnabled,
        registrationExcelImportEnabled: input.registrationExcelImportEnabled,
        formatConfig: input.formatConfig as object,
      },
    });

    await tx.tournament.update({ where: { id: tournament.id }, data: { currentSeasonId: created.id } });

    return created;
  });

  return { seasonId: season.id };
}
