import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/userAuth";
import { PeoplePanel } from "@/components/PeoplePanel";

export const dynamic = "force-dynamic";

export default async function AdminPeoplePage() {
  const user = await getSessionUser(["ADMIN"]);
  if (!user) redirect("/admin");
  return (
    <div>
      <h1 className="mb-2 heading-display text-2xl">People</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        One row per real person across every season. Add a student ID to link someone&rsquo;s past seasons; merge
        duplicates. Student IDs are visible to organisers only.
      </p>
      <PeoplePanel />
    </div>
  );
}
