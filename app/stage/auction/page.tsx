import { AuctionStage } from "@/components/AuctionStage";
import { getStageState } from "@/lib/auctionStage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Auction — projector view", robots: { index: false, follow: false } };

/** Chrome-less big-screen view for the room. Open it on the projector and leave
 * it: the organiser's console advances it. */
export default async function AuctionStagePage() {
  return <AuctionStage initial={await getStageState()} />;
}
