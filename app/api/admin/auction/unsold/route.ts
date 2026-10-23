import { auctionAction } from "@/lib/auctionRoute";
import { markUnsold } from "@/lib/auctionService";

export const dynamic = "force-dynamic";

export async function POST() {
  return auctionAction(async (ctx) => ({ lot: await markUnsold(ctx) }));
}
