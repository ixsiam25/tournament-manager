import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/userAuth";
import { RegistrationsPanel } from "@/components/RegistrationsPanel";

export default async function AdminRegistrationsPage() {
  const user = await getSessionUser(["ADMIN"]);
  if (!user) redirect("/admin");

  return <RegistrationsPanel />;
}
