import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/userAuth";
import { AuditLogPanel } from "@/components/AuditLogPanel";

export default async function AdminAuditPage() {
  const user = await getSessionUser(["ADMIN"]);
  if (!user) redirect("/admin");

  return <AuditLogPanel />;
}
