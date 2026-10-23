import { prisma } from "@/lib/db";
import { Prisma, type Season } from "@/lib/generated/prisma/client";
import type { AuthedUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { findOrCreateFranchise } from "@/lib/franchise";
import { assignJerseys, nextFreeJersey, seasonInPlay } from "@/lib/rosterRules";
import { batchInfo } from "@/lib/batch";
import { resolveApplicationConfig } from "@/lib/applicationConfig";
import {
  balancedDeal,
  isDraftState,
  mulberry32,
  teamOnTheClock,
  type DealTeam,
  type DraftState,
  type PoolPlayer,
} from "@/lib/formation";

export class FormationError extends Error {
  constructor(
    message: string,
    readonly status = 409,
  ) {
    super(message);
    this.name = "FormationError";
  }
}

const playerSelect = {
  id: true,
  name: true,
  jerseyNumber: true,
  position: true,
  isCaptain: true,
  photoUrl: true,
  personId: true,
  teamId: true,
} as const;

export function assertBoardUsable(season: Pick<Season, "teamFormation">) {
  if (season.teamFormation === "UNDECIDED") {
    throw new FormationError("Choose how this season forms its teams first (Season setup → Confirm applicants & choose formation).");
  }
  if (season.teamFormation === "AUCTION") {
    throw new FormationError("This season runs an auction — move players with the auction console instead.");
  }
}

/** Everything the formation board shows: teams with their active squads, the
 * unassigned pool (with each applicant's affiliation) and draft progress. */
export async function getBoard(season: Season) {
  const [teams, pool, regs, inPlay] = await Promise.all([
    prisma.team.findMany({
      where: { seasonId: season.id },
      orderBy: { name: "asc" },
      include: { players: { where: { status: "ACTIVE" }, select: playerSelect, orderBy: { jerseyNumber: "asc" } } },
    }),
    prisma.player.findMany({
      where: { seasonId: season.id, teamId: null, status: "ACTIVE" },
      select: playerSelect,
      orderBy: { name: "asc" },
    }),
    prisma.registration.findMany({
      where: { seasonId: season.id, personId: { not: null }, status: "APPROVED" },
      select: { personId: true, affiliation: true },
    }),
    seasonInPlay(season.id),
  ]);
  const affiliationByPerson = new Map(regs.map((r) => [r.personId!, r.affiliation]));
  const withAffiliation = <T extends { personId: string }>(p: T) => ({ ...p, affiliation: affiliationByPerson.get(p.personId) ?? null });

  const draft = isDraftState(season.formationState) ? season.formationState : null;
  const counts = new Map(teams.map((t) => [t.id, t.players.length]));
  return {
    season: {
      id: season.id,
      name: season.name,
      teamFormation: season.teamFormation,
      squadSizeMin: season.squadSizeMin,
      squadSizeMax: season.squadSizeMax,
      registrationOpen: season.registrationOpen,
      batchMeaning: resolveApplicationConfig(season.applicationConfig).batchMeaning,
      batchDate: (season.startsOn ?? new Date()).toISOString(),
    },
    applications: {
      pending: await prisma.registration.count({ where: { seasonId: season.id, status: "PENDING" } }),
      approved: await prisma.registration.count({ where: { seasonId: season.id, status: "APPROVED" } }),
    },
    inPlay,
    teams: teams.map((t) => ({ id: t.id, name: t.name, players: t.players.map(withAffiliation) })),
    pool: pool.map(withAffiliation),
    draft: draft
      ? {
          order: draft.order,
          picks: draft.picks,
          onTheClock: season.squadSizeMax ? teamOnTheClock(draft, counts, season.squadSizeMax) : draft.order[draft.picks.length % draft.order.length],
        }
      : null,
  };
}

/** Moves one player into a team, or back to the pool (`teamId` null). Enforces
 * squad size, hands out the lowest free jersey, and flags the audit entry as a
 * transfer once the edition is in play. */
export async function movePlayer(args: { season: Season; playerId: string; teamId: string | null; actor: AuthedUser | null }) {
  const { season, playerId, teamId, actor } = args;
  const player = await prisma.player.findUnique({ where: { id: playerId }, include: { team: { select: { name: true } } } });
  if (!player || player.seasonId !== season.id) throw new FormationError("Player not found in this season", 404);
  if (player.status !== "ACTIVE") throw new FormationError("That player has been released");

  let targetName: string | null = null;
  if (teamId) {
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team || team.seasonId !== season.id) throw new FormationError("Team not found in this season", 404);
    targetName = team.name;
    if (team.id === player.teamId) return player;
    if (season.squadSizeMax) {
      const size = await prisma.player.count({ where: { teamId, status: "ACTIVE" } });
      if (size >= season.squadSizeMax) throw new FormationError(`${team.name} already has the maximum of ${season.squadSizeMax} players`);
    }
  } else if (!player.teamId) {
    return player;
  }

  const updated = await prisma.player.update({
    where: { id: playerId },
    data: teamId
      ? { teamId, jerseyNumber: await nextFreeJersey(teamId), isCaptain: false }
      : { teamId: null, jerseyNumber: 0, isCaptain: false },
  });

  const transfer = (await seasonInPlay(season.id)) && !!player.teamId;
  await logAudit({
    actor,
    action: transfer ? "roster.transfer" : "roster.move",
    entityType: "Player",
    entityId: playerId,
    summary: `${transfer ? "Transfer: " : ""}${player.name}: ${player.team?.name ?? "pool"} → ${targetName ?? "pool"}`,
    before: { teamId: player.teamId, jerseyNumber: player.jerseyNumber },
    after: { teamId: updated.teamId, jerseyNumber: updated.jerseyNumber },
  });
  return updated;
}

type Move = { playerId: string; teamId: string };

/** Applies many pool→team moves in one batch (jerseys handed out per team). */
async function applyMoves(season: Season, moves: Move[], actor: AuthedUser | null, label: string) {
  if (moves.length === 0) return 0;
  const teamIds = [...new Set(moves.map((m) => m.teamId))];
  const existing = await prisma.player.findMany({
    where: { teamId: { in: teamIds }, jerseyNumber: { gt: 0 } },
    select: { teamId: true, jerseyNumber: true },
  });
  const usedByTeam = new Map(teamIds.map((id) => [id, new Set(existing.filter((p) => p.teamId === id).map((p) => p.jerseyNumber))]));

  const ops = teamIds.flatMap((teamId) => {
    const mine = moves.filter((m) => m.teamId === teamId);
    const numbers = assignJerseys(usedByTeam.get(teamId)!, mine.length);
    return mine.map((m, i) =>
      prisma.player.update({ where: { id: m.playerId }, data: { teamId, jerseyNumber: numbers[i], isCaptain: false } }),
    );
  });
  await prisma.$transaction(ops);
  await logAudit({
    actor,
    action: "roster.bulk_assign",
    entityType: "Season",
    entityId: season.id,
    summary: `${label}: placed ${moves.length} player(s)`,
    after: { moves: moves.length },
  });
  return moves.length;
}

async function poolAndTeams(season: Season) {
  const [pool, teams, regs] = await Promise.all([
    prisma.player.findMany({ where: { seasonId: season.id, teamId: null, status: "ACTIVE" }, select: { id: true, name: true, position: true, personId: true } }),
    prisma.team.findMany({
      where: { seasonId: season.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true, _count: { select: { players: { where: { status: "ACTIVE" } } } } },
    }),
    prisma.registration.findMany({ where: { seasonId: season.id, personId: { not: null }, status: "APPROVED" }, select: { personId: true, affiliation: true } }),
  ]);
  return { pool, teams, affiliationByPerson: new Map(regs.map((r) => [r.personId!, r.affiliation])) };
}

/** BATCH strategy: one team per intake batch ("Fall 24" → a team with that name and
 * its current semester), all alumni batches together in one "Alumni" team. Anything
 * that isn't a batch label (free-text affiliations, old data) groups by its text.
 * Teams are created (or reused) by name; players beyond the squad limit stay in the pool. */
export async function groupByAffiliation(season: Season, actor: AuthedUser | null) {
  assertBoardUsable(season);
  const { pool, teams, affiliationByPerson } = await poolAndTeams(season);
  const max = season.squadSizeMax ?? Infinity;
  const meaning = resolveApplicationConfig(season.applicationConfig).batchMeaning;
  const reference = season.startsOn ?? new Date();

  const groups = new Map<string, { label: string; semester: number | null; players: typeof pool }>();
  let noAffiliation = 0;
  for (const p of pool) {
    const raw = affiliationByPerson.get(p.personId)?.trim();
    if (!raw) {
      noAffiliation++;
      continue;
    }
    const info = batchInfo(raw, reference, meaning);
    const group =
      info.valid && info.status === "alumni"
        ? { key: "alumni", label: "Alumni", semester: null }
        : info.valid
          ? { key: info.label.toLowerCase(), label: info.label, semester: info.semester }
          : { key: raw.toLowerCase(), label: raw, semester: null };
    const g = groups.get(group.key) ?? { label: group.label, semester: group.semester, players: [] };
    g.players.push(p);
    groups.set(group.key, g);
  }

  const moves: Move[] = [];
  let teamsCreated = 0;
  let overflow = 0;
  for (const g of groups.values()) {
    let team = await prisma.team.findFirst({ where: { seasonId: season.id, name: { equals: g.label, mode: "insensitive" } } });
    if (!team) {
      const franchise = await findOrCreateFranchise(season.tournamentId, g.label);
      const taken = await prisma.team.findUnique({ where: { seasonId_franchiseId: { seasonId: season.id, franchiseId: franchise.id } } });
      team = taken ?? (await prisma.team.create({ data: { seasonId: season.id, franchiseId: franchise.id, name: g.label, semester: g.semester } }));
      if (!taken) teamsCreated++;
    }
    const size = teams.find((t) => t.id === team.id)?._count.players ?? 0;
    const room = Math.max(0, max - size);
    g.players.slice(0, room).forEach((p) => moves.push({ playerId: p.id, teamId: team.id }));
    overflow += Math.max(0, g.players.length - room);
  }
  const placed = await applyMoves(season, moves, actor, "Grouped by batch");
  return { placed, teamsCreated, overflow, noAffiliation };
}

/** BALANCED_RANDOM: deal the pool across teams (preview first, then apply with
 * the same seed so what was previewed is exactly what lands). */
export async function balancedProposal(season: Season, seed: number) {
  assertBoardUsable(season);
  const { pool, teams } = await poolAndTeams(season);
  if (teams.length < 2) throw new FormationError("Create at least two teams first");
  const max = season.squadSizeMax ?? Math.ceil((pool.length + teams.reduce((s, t) => s + t._count.players, 0)) / teams.length);
  const dealTeams: DealTeam[] = teams.map((t) => ({ id: t.id, name: t.name, count: t._count.players, max }));
  const dealPool: PoolPlayer[] = pool.map((p) => ({ id: p.id, name: p.name, position: p.position, rating: null }));
  const deal = balancedDeal(dealPool, dealTeams, mulberry32(seed));
  return {
    moves: [...deal.assignments].map(([playerId, teamId]) => ({ playerId, teamId })),
    leftover: deal.leftover,
  };
}

export async function applyBalanced(season: Season, seed: number, actor: AuthedUser | null) {
  const proposal = await balancedProposal(season, seed);
  const placed = await applyMoves(season, proposal.moves, actor, `Balanced random deal (seed ${seed})`);
  return { placed, leftover: proposal.leftover.length };
}

// ---- snake draft ------------------------------------------------------

async function saveDraft(seasonId: string, state: DraftState | null) {
  await prisma.season.update({ where: { id: seasonId }, data: { formationState: state ?? Prisma.DbNull } });
}

export async function startDraft(season: Season, order: string[], actor: AuthedUser | null) {
  assertBoardUsable(season);
  if (new Set(order).size !== order.length || order.length < 2) throw new FormationError("A draft needs at least two different teams", 400);
  const teams = await prisma.team.findMany({ where: { seasonId: season.id, id: { in: order } }, select: { id: true } });
  if (teams.length !== order.length) throw new FormationError("Unknown team in the draft order", 400);
  await saveDraft(season.id, { kind: "DRAFT", order, picks: [] });
  await logAudit({ actor, action: "formation.draft_start", entityType: "Season", entityId: season.id, summary: `Started a snake draft with ${order.length} teams` });
}

export async function draftPick(season: Season, playerId: string, actor: AuthedUser | null) {
  assertBoardUsable(season);
  if (!isDraftState(season.formationState)) throw new FormationError("No draft is running");
  const state = season.formationState;
  const counts = new Map(
    (await prisma.team.findMany({ where: { id: { in: state.order } }, select: { id: true, _count: { select: { players: { where: { status: "ACTIVE" } } } } } })).map(
      (t) => [t.id, t._count.players],
    ),
  );
  const teamId = season.squadSizeMax ? teamOnTheClock(state, counts, season.squadSizeMax) : state.order[state.picks.length % state.order.length];
  if (!teamId) throw new FormationError("Every team in the draft is full");
  const player = await prisma.player.findUnique({ where: { id: playerId } });
  if (!player || player.seasonId !== season.id || player.teamId) throw new FormationError("That player isn't in the pool");

  await movePlayer({ season, playerId, teamId, actor });
  await saveDraft(season.id, { ...state, picks: [...state.picks, { playerId, teamId }] });
  return { teamId };
}

export async function undoDraftPick(season: Season, actor: AuthedUser | null) {
  assertBoardUsable(season);
  if (!isDraftState(season.formationState) || season.formationState.picks.length === 0) throw new FormationError("Nothing to undo");
  const state = season.formationState;
  const last = state.picks[state.picks.length - 1];
  await movePlayer({ season, playerId: last.playerId, teamId: null, actor });
  await saveDraft(season.id, { ...state, picks: state.picks.slice(0, -1) });
}

export async function resetDraft(season: Season, actor: AuthedUser | null) {
  await saveDraft(season.id, null);
  await logAudit({ actor, action: "formation.draft_reset", entityType: "Season", entityId: season.id, summary: "Ended the draft (players stay where they are)" });
}
