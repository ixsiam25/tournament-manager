import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/userAuth";
import { SeasonRolloverWizard } from "@/components/SeasonRolloverWizard";

export default async function SeasonRolloverPage() {
  const user = await getSessionUser(["ADMIN"]);
  if (!user) redirect("/admin");

  return <SeasonRolloverWizard />;
}
