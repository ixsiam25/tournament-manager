import { auctionAction } from "@/lib/auctionRoute";
import { reopenAuction } from "@/lib/auctionService";

export const dynamic = "force-dynamic";

export async function POST() {
  return auctionAction((ctx) => reopenAuction(ctx));
}
