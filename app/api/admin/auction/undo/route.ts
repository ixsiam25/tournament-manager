import { auctionAction } from "@/lib/auctionRoute";
import { undoLast } from "@/lib/auctionService";

export const dynamic = "force-dynamic";

/** Reverts the most recently resolved lot (sold, unsold or held) back to the
 * queue. Password-gated client-side, like undoing a live match event. */
export async function POST() {
  return auctionAction((ctx) => undoLast(ctx));
}
