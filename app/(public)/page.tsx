import { LiveStatusWidget } from "@/components/LiveStatusWidget";
import { PlayerStatList } from "@/components/PlayerStatList";
import { getLiveStatus } from "@/lib/liveStatus";
import { getTopScorers } from "@/lib/playerStats";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [data, topScorers] = await Promise.all([getLiveStatus(), getTopScorers()]);
  // Serialize Dates to ISO strings so the initial payload matches the shape
  // returned by the /api/public/live poll the client component falls back to.
  const initial = JSON.parse(JSON.stringify(data));

  return (
    <div>
      <div className="stripe-texture relative mb-8 overflow-hidden rounded-block-lg border-2 border-line-strong bg-surface px-6 py-10 shadow-block sm:px-10 sm:py-14">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em] text-brand">
          Bangladesh Football League
        </p>
        <h1 className="heading-display text-4xl leading-none sm:text-6xl">
          Season <span className="text-pitch">IX</span>
        </h1>
        <p className="heading-display mt-2 text-sm tracking-[0.3em] text-gold sm:text-base">
          &ldquo;Show it off&rdquo;
        </p>
      </div>
      <LiveStatusWidget initial={initial} />
      <div className="mt-8">
        <PlayerStatList
          title="Top Scorers"
          icon="⚽"
          rows={topScorers}
          limit={3}
          viewAllHref="/players"
        />
      </div>
    </div>
  );
}
