import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/userAuth";
import { AuctionConsole } from "@/components/AuctionConsole";

export default async function AdminAuctionPage() {
  const user = await getSessionUser(["ADMIN"]);
  if (!user) redirect("/admin");

  return <AuctionConsole />;
}
