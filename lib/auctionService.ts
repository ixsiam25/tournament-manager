import { prisma } from "@/lib/db";
import type { AuctionSettings, Season } from "@/lib/generated/prisma/client";
import type { AuthedUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { getTeamAuctionStatuses } from "@/lib/auction";
import { nextFreeJersey } from "@/lib/rosterRules";
import { balancedDeal, mulberry32, type DealTeam, type PoolPlayer } from "@/lib/formation";

/** Organiser-facing auction failure; `status` is the HTTP code the route should use. */
export class AuctionError extends Error {
  constructor(
    message: string,
    readonly status = 409,
  ) {
    super(message);
    this.name = "AuctionError";
  }
}

export type AuctionCtx = { season: Season; settings: AuctionSettings; actor: AuthedUser | null };

function assertOpen(ctx: AuctionCtx) {
  if (ctx.settings.lockedAt) throw new AuctionError("The auction has been closed — reopen it to make changes");
}

const lotWithPlayer = { player: { include: { person: true } } } as const;

async function statusOf(ctx: AuctionCtx, teamId: string) {
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team || team.seasonId !== ctx.season.id) throw new AuctionError("Team not found", 404);
  const status = (await getTeamAuctionStatuses(ctx.season, ctx.settings)).find((t) => t.teamId === teamId)!;
  return { team, status };
}

function assertRoom(ctx: AuctionCtx, teamName: string, squadCount: number) {
  if (ctx.season.squadSizeMax && squadCount >= ctx.season.squadSizeMax) {
    throw new AuctionError(`${teamName}'s squad is already at the max size`, 400);
  }
}

async function inProgress(ctx: AuctionCtx) {
  const lot = await prisma.auctionLot.findFirst({ where: { seasonId: ctx.season.id, status: "IN_PROGRESS" }, include: { player: true } });
  if (!lot) throw new AuctionError("No lot is currently up for auction");
  return lot;
}

/** Brings the next queued lot up. */
export async function nextLot(ctx: AuctionCtx) {
  assertOpen(ctx);
  if (await prisma.auctionLot.findFirst({ where: { seasonId: ctx.season.id, status: "IN_PROGRESS" } })) {
    throw new AuctionError("Resolve the current lot (sold or unsold) before moving on");
  }
  const next = await prisma.auctionLot.findFirst({
    where: { seasonId: ctx.season.id, status: "QUEUED" },
    orderBy: [{ round: "asc" }, { order: "asc" }],
  });
  if (!next) throw new AuctionError("No lots left in the queue");
  const lot = await prisma.auctionLot.update({
    where: { id: next.id },
    data: { status: "IN_PROGRESS", currentBid: null, currentBidTeamId: null },
    include: lotWithPlayer,
  });
  await logAudit({ actor: ctx.actor, action: "auction.lot.next", entityType: "AuctionLot", entityId: lot.id, summary: `Brought up "${lot.player.name}" for auction` });
  return lot;
}

/** Records the live leading bid (an amount — the bidding team isn't tracked; the
 * team is chosen when the player is sold). It must beat the current bid by the
 * increment. If a team is given, its budget and squad limits are checked now;
 * otherwise they are checked at the sale. */
export async function setBid(ctx: AuctionCtx, amount: number, teamId?: string | null) {
  assertOpen(ctx);
  const lot = await inProgress(ctx);
  const { basePrice, bidIncrement } = ctx.settings;
  if (amount < basePrice) throw new AuctionError(`A bid must be at least the base price (${basePrice})`, 400);
  if (lot.currentBid != null && amount < lot.currentBid + bidIncrement) {
    throw new AuctionError(`A bid must beat ${lot.currentBid} by at least ${bidIncrement}`, 400);
  }
  if (teamId) {
    const { team, status } = await statusOf(ctx, teamId);
    if (amount > status.maxAllowableBid) {
      throw new AuctionError(`${team.name} can bid at most ${status.maxAllowableBid} (budget is reserved to fill a legal squad)`, 400);
    }
    assertRoom(ctx, team.name, status.squadCount);
  }
  return prisma.auctionLot.update({ where: { id: lot.id }, data: { currentBid: amount, currentBidTeamId: teamId ?? null } });
}

export async function clearBid(ctx: AuctionCtx) {
  assertOpen(ctx);
  const lot = await inProgress(ctx);
  return prisma.auctionLot.update({ where: { id: lot.id }, data: { currentBid: null, currentBidTeamId: null } });
}

async function awardPlayer(ctx: AuctionCtx, lot: { id: string; playerId: string }, teamId: string, price: number) {
  const jerseyNumber = await nextFreeJersey(teamId);
  const [updatedLot] = await prisma.$transaction([
    prisma.auctionLot.update({
      where: { id: lot.id },
      data: { status: "SOLD", soldToTeamId: teamId, soldPrice: price, soldAt: new Date(), soldByUserId: ctx.actor?.id ?? null, currentBid: null, currentBidTeamId: null },
    }),
    prisma.player.update({ where: { id: lot.playerId }, data: { teamId, jerseyNumber, isCaptain: false } }),
  ]);
  return updatedLot;
}

/** Sells the lot that is up. */
export async function sellLot(ctx: AuctionCtx, teamId: string, priceInput?: number | null) {
  assertOpen(ctx);
  const lot = await inProgress(ctx);
  const price = priceInput ?? lot.currentBid;
  if (price == null) throw new AuctionError("Enter the price — no bid has been recorded for this player", 400);
  const { team, status } = await statusOf(ctx, teamId);
  if (price < ctx.settings.basePrice) throw new AuctionError(`Price must be at least the base price (${ctx.settings.basePrice})`, 400);
  if (price > status.maxAllowableBid) {
    throw new AuctionError(`Price exceeds ${team.name}'s max allowable bid (${status.maxAllowableBid}, reserving budget to fill a legal squad)`, 400);
  }
  assertRoom(ctx, team.name, status.squadCount);
  const updated = await awardPlayer(ctx, lot, teamId, price);
  await logAudit({ actor: ctx.actor, action: "auction.lot.sell", entityType: "AuctionLot", entityId: lot.id, summary: `Sold "${lot.player.name}" to "${team.name}" for ${price}` });
  return updated;
}

/** Nobody took the player this time. They stay on the "unsold" list: run them
 * through again as another round, or place them in the wrap-up. */
export async function markUnsold(ctx: AuctionCtx) {
  assertOpen(ctx);
  const lot = await inProgress(ctx);
  const updated = await prisma.auctionLot.update({ where: { id: lot.id }, data: { status: "UNSOLD", currentBid: null, currentBidTeamId: null } });
  await logAudit({ actor: ctx.actor, action: "auction.lot.unsold", entityType: "AuctionLot", entityId: lot.id, summary: `"${lot.player.name}" went unsold` });
  return updated;
}

/** Gives a not-yet-sold player (queued, held or unsold) to a team directly:
 * a retained player before bidding starts, or a wrap-up placement. `free`
 * costs no budget; otherwise the base price is charged. */
export async function assignLot(ctx: AuctionCtx, lotId: string, teamId: string, free: boolean) {
  assertOpen(ctx);
  const lot = await prisma.auctionLot.findFirst({
    where: { id: lotId, seasonId: ctx.season.id, status: { in: ["QUEUED", "HELD", "UNSOLD"] } },
    include: { player: true },
  });
  if (!lot) throw new AuctionError("That lot can't be assigned (it is up now, or already sold)", 404);
  const { team, status } = await statusOf(ctx, teamId);
  const price = free ? 0 : ctx.settings.basePrice;
  if (price > status.maxAllowableBid) throw new AuctionError(`${team.name} can't afford the base price`, 400);
  assertRoom(ctx, team.name, status.squadCount);
  const updated = await awardPlayer(ctx, lot, teamId, price);
  await logAudit({
    actor: ctx.actor,
    action: "auction.lot.assign",
    entityType: "AuctionLot",
    entityId: lot.id,
    summary: `Placed "${lot.player.name}" with "${team.name}" ${free ? "(no charge)" : `for the base price ${price}`}`,
  });
  return updated;
}

/** Reverts the most recently resolved lot (sold or unsold) to QUEUED,
 * un-assigning the player if they had been placed on a team. */
export async function undoLast(ctx: AuctionCtx) {
  assertOpen(ctx);
  const lot = await prisma.auctionLot.findFirst({
    where: { seasonId: ctx.season.id, status: { in: ["SOLD", "UNSOLD", "HELD"] } },
    orderBy: { updatedAt: "desc" },
    include: { player: true, soldToTeam: true },
  });
  if (!lot) throw new AuctionError("Nothing to undo");
  const wasSold = lot.status === "SOLD";
  await prisma.$transaction([
    prisma.auctionLot.update({
      where: { id: lot.id },
      data: { status: "QUEUED", soldToTeamId: null, soldPrice: null, soldAt: null, soldByUserId: null, heldAt: null, currentBid: null, currentBidTeamId: null },
    }),
    ...(wasSold ? [prisma.player.update({ where: { id: lot.playerId }, data: { teamId: null, jerseyNumber: 0 } })] : []),
  ]);
  await logAudit({
    actor: ctx.actor,
    action: "auction.lot.undo",
    entityType: "AuctionLot",
    entityId: lot.id,
    summary: `Undid ${wasSold ? `sale of "${lot.player.name}" to "${lot.soldToTeam?.name}"` : `"${lot.player.name}" being ${lot.status === "HELD" ? "held" : "unsold"}`}`,
  });
}

/** Requeues every UNSOLD lot as a new round. */
export async function requeueUnsold(ctx: AuctionCtx) {
  assertOpen(ctx);
  const unsold = await prisma.auctionLot.findMany({ where: { seasonId: ctx.season.id, status: "UNSOLD" } });
  if (unsold.length === 0) throw new AuctionError("No unsold lots to requeue");
  const nextRound = Math.max(...unsold.map((l) => l.round)) + 1;
  await prisma.$transaction(unsold.map((lot, i) => prisma.auctionLot.update({ where: { id: lot.id }, data: { status: "QUEUED", round: nextRound, order: i } })));
  await logAudit({ actor: ctx.actor, action: "auction.requeue_unsold", entityType: "AuctionLot", summary: `Requeued ${unsold.length} unsold lot(s) for round ${nextRound}` });
  return { count: unsold.length };
}

// ---- wrap-up: fair draw + close --------------------------------------

/** Held/unsold players who still need a team. */
async function leftovers(ctx: AuctionCtx) {
  return prisma.auctionLot.findMany({
    where: { seasonId: ctx.season.id, status: { in: ["HELD", "UNSOLD"] } },
    include: { player: { select: { id: true, name: true, position: true } } },
    orderBy: { updatedAt: "asc" },
  });
}

/** A fair draw of the held/unsold players to the teams still below the minimum
 * squad: each team receives only as many as it needs, positions spread evenly. */
export async function drawProposal(ctx: AuctionCtx, seed: number) {
  const [lots, statuses] = await Promise.all([leftovers(ctx), getTeamAuctionStatuses(ctx.season, ctx.settings)]);
  const min = ctx.season.squadSizeMin ?? 0;
  const teams: DealTeam[] = statuses
    .map((t) => ({ id: t.teamId, name: t.teamName, count: 0, max: Math.max(0, min - t.squadCount) }))
    .filter((t) => t.max > 0);
  const pool: PoolPlayer[] = lots.map((l) => ({ id: l.id, name: l.player.name, position: l.player.position, rating: null }));
  if (teams.length === 0) return { moves: [] as { lotId: string; teamId: string }[], leftOver: lots.length, stillNeeded: 0 };
  const deal = balancedDeal(pool, teams, mulberry32(seed));
  const placed = new Set(deal.assignments.keys());
  const stillNeeded = teams.reduce((sum, t) => sum + t.max, 0) - placed.size;
  return {
    moves: [...deal.assignments].map(([lotId, teamId]) => ({ lotId, teamId })),
    leftOver: lots.length - placed.size,
    stillNeeded: Math.max(0, stillNeeded),
  };
}

export async function applyDraw(ctx: AuctionCtx, seed: number) {
  assertOpen(ctx);
  const proposal = await drawProposal(ctx, seed);
  for (const move of proposal.moves) await assignLot(ctx, move.lotId, move.teamId, true);
  await logAudit({ actor: ctx.actor, action: "auction.draw", entityType: "Season", entityId: ctx.season.id, summary: `Fair draw (seed ${seed}) placed ${proposal.moves.length} player(s)` });
  return { placed: proposal.moves.length, leftOver: proposal.leftOver };
}

/** What stands between the auction and "closed". */
export async function closeChecks(ctx: AuctionCtx) {
  const [statuses, queued, current, lots] = await Promise.all([
    getTeamAuctionStatuses(ctx.season, ctx.settings),
    prisma.auctionLot.count({ where: { seasonId: ctx.season.id, status: "QUEUED" } }),
    prisma.auctionLot.count({ where: { seasonId: ctx.season.id, status: "IN_PROGRESS" } }),
    leftovers(ctx),
  ]);
  const min = ctx.season.squadSizeMin ?? 0;
  const blockers: string[] = [];
  if (current > 0) blockers.push("A lot is still up for auction");
  if (queued > 0) blockers.push(`${queued} player(s) are still queued`);
  for (const t of statuses) if (t.squadCount < min) blockers.push(`${t.teamName} has ${t.squadCount} of the minimum ${min} players`);
  return { blockers, leftOut: lots.length, teams: statuses.map((t) => ({ name: t.teamName, squad: t.squadCount })) };
}

export async function closeAuction(ctx: AuctionCtx) {
  assertOpen(ctx);
  const checks = await closeChecks(ctx);
  if (checks.blockers.length > 0) throw new AuctionError(`Can't close yet: ${checks.blockers.join("; ")}`);
  await prisma.auctionSettings.update({ where: { id: ctx.settings.id }, data: { lockedAt: new Date() } });
  await logAudit({ actor: ctx.actor, action: "auction.close", entityType: "Season", entityId: ctx.season.id, summary: `Closed the auction (${checks.leftOut} player(s) left out)` });
  return checks;
}

export async function reopenAuction(ctx: AuctionCtx) {
  if (!ctx.settings.lockedAt) throw new AuctionError("The auction isn't closed");
  await prisma.auctionSettings.update({ where: { id: ctx.settings.id }, data: { lockedAt: null } });
  await logAudit({ actor: ctx.actor, action: "auction.reopen", entityType: "Season", entityId: ctx.season.id, summary: "Reopened the auction" });
}

/**
 * Places a player with a team at no charge, whatever the auction's state — used
 * when the organiser names a team's captain before bidding starts. If the player
 * already has an unsold/queued lot it is closed out as a free sale so the auction
 * never offers them again.
 */
export async function placePlayerFree(args: { playerId: string; teamId: string; actor: AuthedUser | null }) {
  const { playerId, teamId, actor } = args;
  const jerseyNumber = await nextFreeJersey(teamId);
  const lot = await prisma.auctionLot.findFirst({ where: { playerId, status: { in: ["QUEUED", "UNSOLD", "HELD"] } } });
  await prisma.$transaction([
    ...(lot
      ? [prisma.auctionLot.update({ where: { id: lot.id }, data: { status: "SOLD", soldToTeamId: teamId, soldPrice: 0, soldAt: new Date(), soldByUserId: actor?.id ?? null } })]
      : []),
    prisma.player.update({ where: { id: playerId }, data: { teamId, jerseyNumber, isCaptain: false } }),
  ]);
}
