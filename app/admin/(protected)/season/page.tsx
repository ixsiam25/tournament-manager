import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/userAuth";
import { SeasonSetup } from "@/components/SeasonSetup";

export const dynamic = "force-dynamic";

export default async function AdminSeasonPage() {
  const user = await getSessionUser(["ADMIN"]);
  if (!user) redirect("/admin");
  return (
    <div>
      <h1 className="mb-2 heading-display text-2xl">Season setup</h1>
      <p className="mb-6 text-sm text-muted-foreground">From a new season to matchday: each step unlocks the next, and the highlighted one is what to do now.</p>
      <SeasonSetup />
    </div>
  );
}
