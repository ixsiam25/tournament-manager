import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminNav } from "@/components/AdminNav";
import { ADMIN_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/adminAuth";

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get(ADMIN_COOKIE_NAME)?.value;
  const authed = await verifyAdminSessionToken(token);
  if (!authed) redirect("/admin/login");

  return (
    <div className="flex min-h-full flex-col">
      <AdminNav />
      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-8">{children}</main>
    </div>
  );
}
