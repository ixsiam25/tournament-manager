import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/userAuth";
import { FormationBoard } from "@/components/FormationBoard";

export const dynamic = "force-dynamic";

export default async function AdminFormationPage() {
  const user = await getSessionUser(["ADMIN"]);
  if (!user) redirect("/admin");
  return (
    <div>
      <h1 className="mb-2 heading-display text-2xl">Team formation</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Turn approved applicants into squads. Pre-assign anyone you like first (captains, retained players), then run the
        strategy on whoever is left in the pool.
      </p>
      <FormationBoard />
    </div>
  );
}
