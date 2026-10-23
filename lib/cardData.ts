import { prisma } from "@/lib/db";
import { buildCardModel, type CardModel, type Position, type Ratings, type Tier } from "@/lib/playerCard";

export type CardView = {
  id: string;
  name: string;
  teamId: string | null;
  teamName: string | null;
  /** Short club badge text for the card (≤ 4 chars). */
  badge: string;
  number: number;
  position: Position | null;
  model: CardModel;
  /** Raw ratings + override, for the organiser editor. */
  ratings: Ratings;
  cardTier: Tier | null;
  /** Same-origin image URL: the cut-out if there is one, else the photo. */
  imageUrl: string | null;
  /** The plain (non-cut-out) photo, same-origin — input for re-running background removal. */
  photoSrc: string | null;
  isCutout: boolean;
  hasPhoto: boolean;
  framing: { zoom: number; x: number; y: number };
  goals: number;
  assists: number;
};

/** Photos uploaded by managers are stored as direct R2 URLs; the card must load
 * (and PNG-export) its image from our own origin, so route those through the
 * photo proxy. Legacy `/photos/...` static files and `/api/photos/...` stay as is. */
export function sameOriginImage(url: string | null | undefined): string | null {
  if (!url) return null;
  const host = process.env.R2_PUBLIC_URL;
  if (host && url.startsWith(`https://${host}/`)) return `/api/photos/${url.slice(`https://${host}/`.length)}`;
  return url;
}

function badgeFor(team: { name: string; shortName: string | null } | null): string {
  if (!team) return "BFL";
  const short = team.shortName?.trim();
  if (short) return short.slice(0, 4).toUpperCase();
  const words = team.name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words.map((w) => w[0]).join("") : team.name.slice(0, 3);
  return letters.slice(0, 4).toUpperCase();
}

/** Cards for one edition: ratings → model, plus the live goals/assists that
 * drive the form bonus. `includePool` also returns unassigned players (admin). */
export async function getCards(seasonId: string, opts: { includePool?: boolean; teamId?: string | null; playerIds?: string[] } = {}): Promise<CardView[]> {
  const players = await prisma.player.findMany({
    where: {
      seasonId,
      status: "ACTIVE",
      ...(opts.playerIds ? { id: { in: opts.playerIds } } : {}),
      ...(opts.teamId ? { teamId: opts.teamId } : {}),
      ...(opts.includePool || opts.teamId || opts.playerIds ? {} : { teamId: { not: null } }),
    },
    include: { team: { select: { name: true, shortName: true } } },
    orderBy: [{ team: { name: "asc" } }, { name: "asc" }],
  });
  if (players.length === 0) return [];

  const events = await prisma.matchEvent.groupBy({
    by: ["playerId", "type"],
    where: { type: { in: ["GOAL", "ASSIST"] }, playerId: { in: players.map((p) => p.id) }, match: { status: { in: ["LIVE", "FINISHED"] } } },
    _count: { _all: true },
  });
  const stat = (playerId: string, type: "GOAL" | "ASSIST") => events.find((e) => e.playerId === playerId && e.type === type)?._count._all ?? 0;

  return players.map((p) => {
    const goals = stat(p.id, "GOAL");
    const assists = stat(p.id, "ASSIST");
    const model = buildCardModel({ position: p.position, ratings: p.ratings, cardTier: p.cardTier, stats: { goals, assists } });
    const cutout = p.cutoutKey ? `/api/photos/${p.cutoutKey}` : null;
    const photo = sameOriginImage(p.photoUrl);
    return {
      id: p.id,
      name: p.name,
      teamId: p.teamId,
      teamName: p.team?.name ?? null,
      badge: badgeFor(p.team),
      number: p.jerseyNumber,
      position: p.position,
      model,
      ratings: Object.fromEntries(model.stats.filter((s) => s.value !== null).map((s) => [s.key, s.value as number])) as Ratings,
      cardTier: (p.cardTier as Tier | null) ?? null,
      imageUrl: cutout ?? photo,
      photoSrc: photo,
      isCutout: !!cutout,
      hasPhoto: !!(cutout ?? photo),
      framing: { zoom: p.photoZoom, x: p.photoX, y: p.photoY },
      goals,
      assists,
    };
  });
}
