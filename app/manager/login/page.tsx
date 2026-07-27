import { prisma } from "@/lib/db";
import { ManagerLoginForm } from "@/components/ManagerLoginForm";

export const dynamic = "force-dynamic";

export default async function ManagerLoginPage() {
  const teams = await prisma.team.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return <ManagerLoginForm teams={teams} />;
}
