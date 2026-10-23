import { NextRequest } from "next/server";
import { z } from "zod";
import { auctionAction } from "@/lib/auctionRoute";
import { AuctionError, assignLot } from "@/lib/auctionService";

export const dynamic = "force-dynamic";

const schema = z.object({ lotId: z.string().min(1), teamId: z.string().min(1), free: z.boolean() });

/** Place a queued/held/unsold player directly with a team — a retained player
 * before bidding, or a wrap-up placement (free, or charged the base price). */
export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  return auctionAction(async (ctx) => {
    if (!parsed.success) throw new AuctionError("lotId, teamId and free are required", 400);
    return assignLot(ctx, parsed.data.lotId, parsed.data.teamId, parsed.data.free);
  });
}
