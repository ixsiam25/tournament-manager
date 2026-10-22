import { formationAction } from "@/lib/formationRoute";
import { groupByAffiliation } from "@/lib/formationService";

export const dynamic = "force-dynamic";

/** BATCH: one team per affiliation, created or reused by name. */
export async function POST() {
  return formationAction(({ season, actor }) => groupByAffiliation(season, actor));
}
