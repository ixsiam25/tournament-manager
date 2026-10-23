import { auctionAction } from "@/lib/auctionRoute";
import { requeueUnsold } from "@/lib/auctionService";

export const dynamic = "force-dynamic";

/** Requeues every UNSOLD lot as a new round. */
export async function POST() {
  return auctionAction(async (ctx) => (await requeueUnsold(ctx)).count);
}
