import { redirect } from "next/navigation";
import { FixtureEditor } from "@/components/FixtureEditor";
import { getSessionUser } from "@/lib/userAuth";

export default async function FixtureEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser(["ADMIN"]);
  if (!user) redirect("/admin");

  const { id } = await params;
  return <FixtureEditor matchId={id} />;
}
