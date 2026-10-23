import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/userAuth";
import { CardEditor } from "@/components/CardEditor";

export const dynamic = "force-dynamic";

export default async function AdminCardsPage() {
  const user = await getSessionUser(["ADMIN"]);
  if (!user) redirect("/admin");
  return (
    <div>
      <h1 className="mb-2 heading-display text-2xl">Player cards</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Set each player&rsquo;s six ratings (30–99). The overall is weighted by position and the tier follows it
        (bronze under 60, silver 60–74, gold 75+). During the tournament goals and assists add a capped form bonus.
        You can override the tier, re-frame the photo, and fix or replace the background-removed cut-out.
      </p>
      <CardEditor />
    </div>
  );
}
