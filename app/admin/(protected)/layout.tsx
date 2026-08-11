import { redirect } from "next/navigation";
import { AdminNav } from "@/components/AdminNav";
import { getSessionUser } from "@/lib/userAuth";

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser(["ADMIN", "SCORER"]);
  if (!user) redirect("/admin/login");

  return (
    <div className="flex min-h-full flex-col">
      <AdminNav role={user.role} name={user.name} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-8">{children}</main>
    </div>
  );
}
