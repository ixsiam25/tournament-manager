import { prisma } from "@/lib/db";
import { getCurrentSeasonId } from "@/lib/currentSeason";
import { ManagerLoginForm } from "@/components/ManagerLoginForm";

export const dynamic = "force-dynamic";

export default async function ManagerLoginPage() {
  const seasonId = await getCurrentSeasonId();
  const teams = await prisma.team.findMany({
    where: { seasonId: seasonId ?? "none" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return <ManagerLoginForm teams={teams} />;
}
