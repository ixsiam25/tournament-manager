import { redirect } from "next/navigation";

/** Team management moved into the Season tab (Season setup → Set up the teams). */
export default function TeamsAdminPage() {
  redirect("/admin/season/teams");
}
