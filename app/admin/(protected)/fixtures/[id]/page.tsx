import { FixtureEditor } from "@/components/FixtureEditor";

export default async function FixtureEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FixtureEditor matchId={id} />;
}
