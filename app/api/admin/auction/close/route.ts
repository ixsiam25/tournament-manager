import { auctionAction } from "@/lib/auctionRoute";
import { closeAuction } from "@/lib/auctionService";

export const dynamic = "force-dynamic";

/** Closes the auction — refused until every team has a legal squad. */
export async function POST() {
  return auctionAction((ctx) => closeAuction(ctx));
}
