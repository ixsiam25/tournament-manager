import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/userAuth";
import { MediaPanel } from "@/components/MediaPanel";

export default async function AdminMediaPage() {
  const user = await getSessionUser(["ADMIN"]);
  if (!user) redirect("/admin");

  return <MediaPanel />;
}
