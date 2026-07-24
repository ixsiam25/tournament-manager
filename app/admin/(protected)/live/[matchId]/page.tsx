import { LiveConsole } from "@/components/LiveConsole";

export default async function LiveMatchPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  return <LiveConsole matchId={matchId} />;
}
