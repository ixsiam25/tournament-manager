import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/userAuth";
import { TeamSetup } from "@/components/TeamSetup";

export const dynamic = "force-dynamic";

export default async function AdminSeasonTeamsPage() {
  const user = await getSessionUser(["ADMIN"]);
  if (!user) redirect("/admin");
  return (
    <div>
      <h1 className="mb-2 heading-display text-2xl">Set up the teams</h1>
      <TeamSetup />
    </div>
  );
}
