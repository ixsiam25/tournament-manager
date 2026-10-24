import { NextRequest } from "next/server";
import { z } from "zod";
import { auctionAction } from "@/lib/auctionRoute";
import { AuctionError, sellLot } from "@/lib/auctionService";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  teamId: z.string().trim().min(1),
  /** Defaults to the recorded bid. */
  price: z.coerce.number().int().positive().optional(),
});

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  return auctionAction(async (ctx) => {
    if (!parsed.success) throw new AuctionError(parsed.error.issues[0]?.message ?? "Invalid data", 400);
    return { lot: await sellLot(ctx, parsed.data.teamId, parsed.data.price) };
  });
}
