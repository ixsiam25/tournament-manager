import { NextRequest } from "next/server";
import { z } from "zod";
import { auctionAction } from "@/lib/auctionRoute";
import { AuctionError, applyDraw, drawProposal } from "@/lib/auctionService";

export const dynamic = "force-dynamic";

const schema = z.object({ seed: z.number().int().min(0).max(2 ** 31), apply: z.boolean().optional() });

/** Fair draw of held/unsold players to teams below the minimum squad. The same
 * seed gives the same draw, so what was previewed is what is applied. */
export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  return auctionAction(async (ctx) => {
    if (!parsed.success) throw new AuctionError("A numeric seed is required", 400);
    return parsed.data.apply ? applyDraw(ctx, parsed.data.seed) : drawProposal(ctx, parsed.data.seed);
  });
}
