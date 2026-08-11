import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/userAuth";
import { ManagerNav } from "@/components/ManagerNav";

export default async function ManagerProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser(["OWNER"]);
  if (!user || !user.teamId) redirect("/manager/login");

  const team = await prisma.team.findUnique({ where: { id: user.teamId } });
  if (!team) redirect("/manager/login");

  return (
    <div className="flex min-h-full flex-col">
      <ManagerNav teamName={team.name} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">{children}</main>
    </div>
  );
}
