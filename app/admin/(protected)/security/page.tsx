import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/userAuth";
import { SecurityPanel } from "@/components/SecurityPanel";

export const dynamic = "force-dynamic";

export default async function AdminSecurityPage() {
  const user = await getSessionUser(["ADMIN"]);
  if (!user) redirect("/admin");

  const teams = await prisma.team.findMany({
    select: { id: true, name: true, users: { where: { role: "OWNER" }, select: { isActive: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <SecurityPanel
      teams={teams.map((t) => ({
        id: t.id,
        name: t.name,
        hasManagerPassword: t.users.length > 0,
        blocked: t.users.length > 0 && !t.users[0].isActive,
      }))}
    />
  );
}
