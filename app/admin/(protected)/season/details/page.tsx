import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/userAuth";
import { SeasonDetailsForm } from "@/components/SeasonDetailsForm";

export const dynamic = "force-dynamic";

export default async function SeasonDetailsPage() {
  const user = await getSessionUser(["ADMIN"]);
  if (!user) redirect("/admin");
  return (
    <div>
      <h1 className="mb-2 heading-display text-2xl">Season details</h1>
      <p className="mb-6 text-sm text-muted-foreground">Everything you entered when creating the season can be changed here at any time.</p>
      <SeasonDetailsForm />
    </div>
  );
}
