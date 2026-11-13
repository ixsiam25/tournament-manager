import { prisma } from "@/lib/db";
import { DEFAULT_FORMAT_CONFIG, type SeasonFormatConfig } from "@/lib/seasonFormat";

/**
 * Creates the empty knockout fixtures (Semifinal 1, Semifinal 2, Final — teams
 * TBD) the season's format asks for, skipping any round that already has
 * fixtures. Returns how many were created. The semis are filled from the table
 * once the league ends, the final from the semifinal winners.
 */
export async function ensureKnockoutSlots(seasonId: string): Promise<number> {
  const season = await prisma.season.findUnique({ where: { id: seasonId }, select: { formatConfig: true } });
  const config = { ...DEFAULT_FORMAT_CONFIG, ...((season?.formatConfig as Partial<SeasonFormatConfig> | null) ?? {}) };
  if (config.knockoutStructure === "NONE") return 0;

  const [semis, finals] = await Promise.all([
    prisma.match.count({ where: { seasonId, round: "SEMIFINAL" } }),
    prisma.match.count({ where: { seasonId, round: "FINAL" } }),
  ]);
  const data = [
    ...(semis === 0 ? [{ seasonId, round: "SEMIFINAL" as const, label: "Semifinal 1" }, { seasonId, round: "SEMIFINAL" as const, label: "Semifinal 2" }] : []),
    ...(finals === 0 ? [{ seasonId, round: "FINAL" as const, label: "Final" }] : []),
  ];
  if (data.length > 0) await prisma.match.createMany({ data });
  return data.length;
}
