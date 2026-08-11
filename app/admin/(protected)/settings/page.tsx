import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/userAuth";
import { AnnouncementSettingsPanel } from "@/components/AnnouncementSettingsPanel";

export default async function AdminSettingsPage() {
  const user = await getSessionUser(["ADMIN"]);
  if (!user) redirect("/admin");

  return (
    <div>
      <h1 className="mb-6 heading-display text-2xl">Settings</h1>
      <AnnouncementSettingsPanel />
    </div>
  );
}
