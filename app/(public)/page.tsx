import { LiveStatusWidget } from "@/components/LiveStatusWidget";
import { getLiveStatus } from "@/lib/liveStatus";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const data = await getLiveStatus();
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
          Season <span className="text-pitch">VIII</span>
        </h1>
      </div>
      <LiveStatusWidget initial={initial} />
    </div>
  );
}
