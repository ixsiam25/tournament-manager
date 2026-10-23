import { auctionAction } from "@/lib/auctionRoute";
import { holdLot } from "@/lib/auctionService";

export const dynamic = "force-dynamic";

/** Park the lot that is up until the wrap-up step. */
export async function POST() {
  return auctionAction(async (ctx) => ({ lot: await holdLot(ctx) }));
}
