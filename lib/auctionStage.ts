import { prisma } from "@/lib/db";
import { getActiveSeason } from "@/lib/currentSeason";
import { getTeamAuctionStatuses } from "@/lib/auction";
import { getCards, type CardView } from "@/lib/cardData";

/** How long a SOLD / UNSOLD / HELD result stays on the big screen before the
 * stage falls back to the budget board. */
export const RESULT_SECONDS = 12;

/** Only what the room may see: names. Budgets and squad sizes stay on the organiser's console. */
export type StageTeam = { id: string; name: string };
export type StageCard = Pick<CardView, "name" | "model" | "imageUrl" | "isCutout" | "framing" | "badge" | "position">;

export type StageState =
  | { phase: "off" }
  | { phase: "opening"; seasonName: string; players: number; basePrice: number; teams: StageTeam[] }
  | {
      phase: "lot";
      seasonName: string;
      card: StageCard;
      basePrice: number;
      bidIncrement: number;
      currentBid: number | null;
      leader: { name: string } | null;
      sold: number;
      left: number;
    }
  | {
      phase: "result";
      seasonName: string;
      kind: "SOLD" | "UNSOLD";
      card: StageCard;
      price: number | null;
      team: { name: string } | null;
    }
  | { phase: "between"; seasonName: string; sold: number; left: number }
  | { phase: "closing"; seasonName: string; squads: { team: { name: string }; players: { name: string; number: number; position: string | null }[] }[] };

const toStageCard = (c: CardView): StageCard => ({
  name: c.name,
  model: c.model,
  imageUrl: c.imageUrl,
  isCutout: c.isCutout,
  framing: c.framing,
  badge: c.badge,
  position: c.position,
});

/**
 * What the projector should show right now, derived entirely from the lots'
 * state (so the organiser's console is the only remote control): the opening
 * slide, the lot that is up with its live bid, a short SOLD/UNSOLD/HELD result,
 * the budget board between lots, and the closing squads once the auction is
 * closed. Shared by the public API route and the server-rendered first paint.
 */
export async function getStageState(now = new Date()): Promise<StageState> {
  const season = await getActiveSeason();
  if (!season || season.teamFormation !== "AUCTION") return { phase: "off" };
  const settings = await prisma.auctionSettings.findUnique({ where: { seasonId: season.id } });
  if (!settings) return { phase: "off" };

  const statuses = await getTeamAuctionStatuses(season, settings);
  const teams: StageTeam[] = statuses.map((t) => ({ id: t.teamId, name: t.teamName }));
  const seasonName = season.name;

  if (settings.lockedAt) {
    const players = await prisma.player.findMany({
      where: { seasonId: season.id, teamId: { not: null }, status: "ACTIVE" },
      select: { name: true, jerseyNumber: true, position: true, teamId: true },
      orderBy: { jerseyNumber: "asc" },
    });
    return {
      phase: "closing",
      seasonName,
      squads: teams.map((t) => ({
        team: { name: t.name },
        players: players.filter((p) => p.teamId === t.id).map((p) => ({ name: p.name, number: p.jerseyNumber, position: p.position })),
      })),
    };
  }

  const [current, lastResolved, sold, left, total] = await Promise.all([
    prisma.auctionLot.findFirst({ where: { seasonId: season.id, status: "IN_PROGRESS" } }),
    prisma.auctionLot.findFirst({ where: { seasonId: season.id, status: { in: ["SOLD", "UNSOLD", "HELD"] } }, orderBy: { updatedAt: "desc" }, include: { soldToTeam: { select: { name: true } } } }),
    prisma.auctionLot.count({ where: { seasonId: season.id, status: "SOLD" } }),
    prisma.auctionLot.count({ where: { seasonId: season.id, status: "QUEUED" } }),
    prisma.auctionLot.count({ where: { seasonId: season.id } }),
  ]);

  const cardFor = async (playerId: string) => {
    const [card] = await getCards(season.id, { playerIds: [playerId] });
    return card ? toStageCard(card) : null;
  };

  if (current) {
    const card = await cardFor(current.playerId);
    if (card) {
      const leader = current.currentBidTeamId ? teams.find((t) => t.id === current.currentBidTeamId) : null;
      return { phase: "lot", seasonName, card, basePrice: settings.basePrice, bidIncrement: settings.bidIncrement, currentBid: current.currentBid, leader: leader ? { name: leader.name } : null, sold, left };
    }
  }

  if (lastResolved && now.getTime() - lastResolved.updatedAt.getTime() < RESULT_SECONDS * 1000) {
    const card = await cardFor(lastResolved.playerId);
    if (card) {
      return {
        phase: "result",
        seasonName,
        kind: lastResolved.status === "SOLD" ? "SOLD" : "UNSOLD",
        card,
        price: lastResolved.status === "SOLD" ? lastResolved.soldPrice : null,
        team: lastResolved.soldToTeam ? { name: lastResolved.soldToTeam.name } : null,
      };
    }
  }

  if (!lastResolved) return { phase: "opening", seasonName, players: total, basePrice: settings.basePrice, teams };
  return { phase: "between", seasonName, sold, left };
}
