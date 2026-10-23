import { auctionAction } from "@/lib/auctionRoute";
import { nextLot } from "@/lib/auctionService";

export const dynamic = "force-dynamic";

export async function POST() {
  return auctionAction(async (ctx) => ({ lot: await nextLot(ctx) }));
}
