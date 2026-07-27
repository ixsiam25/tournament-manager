import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { MANAGER_COOKIE_NAME, verifyManagerSessionToken } from "@/lib/managerAuth";
import { ManagerNav } from "@/components/ManagerNav";

export default async function ManagerProtectedLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get(MANAGER_COOKIE_NAME)?.value;
  const teamId = await verifyManagerSessionToken(token);
  if (!teamId) redirect("/manager/login");

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) redirect("/manager/login");

  return (
    <div className="flex min-h-full flex-col">
      <ManagerNav teamName={team.name} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">{children}</main>
    </div>
  );
}
