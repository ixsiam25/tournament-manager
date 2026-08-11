import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/userAuth";
import { UsersPanel } from "@/components/UsersPanel";

export default async function AdminUsersPage() {
  const user = await getSessionUser(["ADMIN"]);
  if (!user) redirect("/admin");

  return <UsersPanel />;
}
