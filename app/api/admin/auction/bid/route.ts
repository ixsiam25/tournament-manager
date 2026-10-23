import { NextRequest } from "next/server";
import { z } from "zod";
import { auctionAction } from "@/lib/auctionRoute";
import { AuctionError, clearBid, setBid } from "@/lib/auctionService";

export const dynamic = "force-dynamic";

const schema = z.union([z.object({ teamId: z.string().min(1), amount: z.coerce.number().int().positive() }), z.object({ clear: z.literal(true) })]);

/** Record (or clear) the live leading bid for the lot that is up. */
export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  return auctionAction(async (ctx) => {
    if (!parsed.success) throw new AuctionError("A team and an amount are required", 400);
    return "clear" in parsed.data ? clearBid(ctx) : setBid(ctx, parsed.data.teamId, parsed.data.amount);
  });
}
