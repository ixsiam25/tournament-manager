import { prisma } from "@/lib/db";
import { SecurityPanel } from "@/components/SecurityPanel";

export const dynamic = "force-dynamic";

export default async function AdminSecurityPage() {
  const teams = await prisma.team.findMany({
    select: { id: true, name: true, managerPasswordHash: true, managerLoginBlocked: true },
    orderBy: { name: "asc" },
  });

  return (
    <SecurityPanel
      teams={teams.map((t) => ({
        id: t.id,
        name: t.name,
        hasManagerPassword: !!t.managerPasswordHash,
        blocked: t.managerLoginBlocked,
      }))}
    />
  );
}
