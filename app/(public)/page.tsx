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
      <h1 className="mb-6 heading-display text-2xl">Current Status</h1>
      <LiveStatusWidget initial={initial} />
    </div>
  );
}
