import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { frozenSeasonResponse } from "@/lib/seasonGuard";
import { clampFraming } from "@/lib/applicationConfig";
import { TIERS, sanitizeRatings } from "@/lib/playerCard";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  ratings: z.record(z.string(), z.number()).optional(),
  cardTier: z.enum(TIERS as [string, ...string[]]).nullable().optional(),
  photoZoom: z.number().optional(),
  photoX: z.number().optional(),
  photoY: z.number().optional(),
});

/** Sets a player's card: organiser ratings, tier override and photo framing. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;
  const { id } = await params;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid card data" }, { status: 400 });

  const player = await prisma.player.findUnique({ where: { id } });
  if (!player) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const frozen = await frozenSeasonResponse(player.seasonId);
  if (frozen) return frozen;

  const d = parsed.data;
  const data: Record<string, unknown> = {};
  if (d.ratings !== undefined) data.ratings = sanitizeRatings(d.ratings, player.position);
  if (d.cardTier !== undefined) data.cardTier = d.cardTier;
  if (d.photoZoom !== undefined || d.photoX !== undefined || d.photoY !== undefined) {
    const f = clampFraming({ photoZoom: d.photoZoom ?? player.photoZoom, photoX: d.photoX ?? player.photoX, photoY: d.photoY ?? player.photoY });
    Object.assign(data, f);
  }
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });

  const updated = await prisma.player.update({ where: { id }, data });
  await logAudit({
    actor,
    action: "player.card",
    entityType: "Player",
    entityId: id,
    summary: `Updated ${player.name}'s card (${Object.keys(data).join(", ")})`,
    before: { ratings: player.ratings, cardTier: player.cardTier, photoZoom: player.photoZoom, photoX: player.photoX, photoY: player.photoY },
    after: { ratings: updated.ratings, cardTier: updated.cardTier, photoZoom: updated.photoZoom, photoX: updated.photoX, photoY: updated.photoY },
  });
  return NextResponse.json({ ok: true });
}
