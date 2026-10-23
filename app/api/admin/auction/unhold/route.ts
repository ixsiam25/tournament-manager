import { NextRequest } from "next/server";
import { z } from "zod";
import { auctionAction } from "@/lib/auctionRoute";
import { AuctionError, unholdLot } from "@/lib/auctionService";

export const dynamic = "force-dynamic";

const schema = z.object({ lotId: z.string().min(1) });

/** Put a held lot back at the end of the queue. */
export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  return auctionAction(async (ctx) => {
    if (!parsed.success) throw new AuctionError("lotId is required", 400);
    return unholdLot(ctx, parsed.data.lotId);
  });
}
