import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { formationAction } from "@/lib/formationRoute";
import { FormationError } from "@/lib/formationService";

export const dynamic = "force-dynamic";

const schema = z.object({ teamFormation: z.enum(["BATCH", "MANUAL", "DRAFT", "BALANCED_RANDOM", "AUCTION"]) });

/** Changes how this edition builds its teams. Allowed any time before play
 * starts; an AUCTION needs its settings (budget etc.) configured separately. */
export async function PATCH(request: NextRequest) {
  const body = schema.safeParse(await request.json().catch(() => null));
  return formationAction(async ({ season, actor }) => {
    if (!body.success) throw new FormationError("Unknown formation strategy", 400);
    if (season.teamFormation === body.data.teamFormation) return { teamFormation: season.teamFormation };
    const soldLots = await prisma.auctionLot.count({ where: { seasonId: season.id, status: "SOLD" } });
    if (soldLots > 0) throw new FormationError("Players have already been sold in the auction — the strategy can't change now");
    const updated = await prisma.season.update({ where: { id: season.id }, data: { teamFormation: body.data.teamFormation } });
    if (updated.teamFormation === "AUCTION") {
      // Pool players approved under another strategy still need auction lots.
      const unlotted = await prisma.player.findMany({
        where: { seasonId: season.id, teamId: null, status: "ACTIVE", auctionLot: null },
        select: { id: true },
        orderBy: { name: "asc" },
      });
      const maxOrder = await prisma.auctionLot.aggregate({ where: { seasonId: season.id }, _max: { order: true } });
      let order = (maxOrder._max.order ?? -1) + 1;
      if (unlotted.length > 0) {
        await prisma.auctionLot.createMany({
          data: unlotted.map((p) => ({ seasonId: season.id, playerId: p.id, order: order++, status: "QUEUED" as const })),
        });
      }
    }
    await logAudit({
      actor,
      action: "season.formation_strategy",
      entityType: "Season",
      entityId: season.id,
      summary: `Team formation: ${season.teamFormation} → ${updated.teamFormation}`,
      before: { teamFormation: season.teamFormation },
      after: { teamFormation: updated.teamFormation },
    });
    return { teamFormation: updated.teamFormation };
  });
}
