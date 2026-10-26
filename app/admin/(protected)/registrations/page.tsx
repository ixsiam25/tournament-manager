import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/userAuth";
import { getCurrentSeason } from "@/lib/currentSeason";
import { ApplicationLinkCard } from "@/components/ApplicationLinkCard";
import { RegistrationsPanel } from "@/components/RegistrationsPanel";

export const dynamic = "force-dynamic";

export default async function AdminRegistrationsPage() {
  const user = await getSessionUser(["ADMIN"]);
  if (!user) redirect("/admin");
  const season = await getCurrentSeason();
  const showLink = season?.status === "ACTIVE" && season.registrationOpen && season.registrationSelfServeEnabled;

  return (
    <div className="space-y-6">
      {showLink && <ApplicationLinkCard deadline={season.applicationDeadline?.toISOString() ?? null} />}
      <RegistrationsPanel />
    </div>
  );
}
