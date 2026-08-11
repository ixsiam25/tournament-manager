import { AuctionLiveWidget } from "@/components/AuctionLiveWidget";
import { getPublicAuctionStatus } from "@/lib/auction";

export const dynamic = "force-dynamic";

export default async function AuctionPage() {
  const initial = await getPublicAuctionStatus();

  return (
    <div>
      <h1 className="mb-6 heading-display text-2xl">Auction</h1>
      <AuctionLiveWidget initial={initial} />
    </div>
  );
}
