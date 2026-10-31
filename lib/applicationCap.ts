import { prisma } from "@/lib/db";
import { resolveApplicationConfig } from "@/lib/applicationConfig";
import type { Season } from "@/lib/generated/prisma/client";

export type ApplicationUsage = { cap: number | null; used: number; full: boolean };

/**
 * How many applications count against the season's limit (pending + approved —
 * a rejected application frees its place) and whether the public form is full.
 * Admin manual adds and Excel imports are never blocked by the limit.
 */
export async function applicationUsage(season: Pick<Season, "id" | "applicationConfig">): Promise<ApplicationUsage> {
  const cap = resolveApplicationConfig(season.applicationConfig).maxApplications;
  const used = await prisma.registration.count({ where: { seasonId: season.id, status: { not: "REJECTED" } } });
  return { cap, used, full: cap !== null && used >= cap };
}
