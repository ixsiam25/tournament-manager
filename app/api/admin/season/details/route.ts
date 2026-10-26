import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { getActiveSeason } from "@/lib/currentSeason";
import { DEFAULT_FORMAT_CONFIG, type SeasonFormatConfig } from "@/lib/seasonFormat";

export const dynamic = "force-dynamic";

const hhmm = z.string().trim().regex(/^\d{2}:\d{2}$/, "Use HH:MM");

const patchSchema = z.object({
  name: z.string().trim().min(1).max(100),
  year: z.coerce.number().int(),
  targetTeamCount: z.coerce.number().int().positive().nullable(),
  squadSizeMin: z.coerce.number().int().positive(),
  squadSizeMax: z.coerce.number().int().positive(),
  registrationSelfServeEnabled: z.boolean(),
  registrationExcelImportEnabled: z.boolean(),
  formatConfig: z.object({
    matchFormat: z.enum(["SINGLE_ROUND_ROBIN", "DOUBLE_ROUND_ROBIN", "GROUPS_KNOCKOUT"]),
    knockoutStructure: z.enum(["NONE", "SEMIS_FINAL", "QUARTERS_SEMIS_FINAL"]),
    matchDurationMinutes: z.coerce.number().int().positive(),
    bufferMinutes: z.coerce.number().int().min(0),
    dayStartTime: hhmm,
    pitches: z
      .array(z.object({ name: z.string().trim().min(1, "Every pitch needs a name"), availabilityStart: hhmm.optional().nullable(), availabilityEnd: hhmm.optional().nullable() }))
      .min(1, "At least one pitch is required"),
  }),
});

/** The editable settings of the current (open) season. The season number and
 * slug are fixed once created — they are part of its public URLs and ordering. */
export async function GET() {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const season = await getActiveSeason();
  if (!season) return NextResponse.json({ season: null });
  return NextResponse.json({
    season: {
      number: season.number,
      slug: season.slug,
      name: season.name,
      year: season.year,
      targetTeamCount: season.targetTeamCount,
      squadSizeMin: season.squadSizeMin ?? 6,
      squadSizeMax: season.squadSizeMax ?? 8,
      registrationSelfServeEnabled: season.registrationSelfServeEnabled,
      registrationExcelImportEnabled: season.registrationExcelImportEnabled,
      formatConfig: { ...DEFAULT_FORMAT_CONFIG, ...((season.formatConfig as Partial<SeasonFormatConfig> | null) ?? {}) },
    },
  });
}

export async function PATCH(request: NextRequest) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const season = await getActiveSeason();
  if (!season) return NextResponse.json({ error: "There is no open season to edit" }, { status: 409 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  const d = parsed.data;
  if (d.squadSizeMax < d.squadSizeMin) return NextResponse.json({ error: "Squad max can't be less than squad min" }, { status: 400 });

  await prisma.season.update({
    where: { id: season.id },
    data: {
      name: d.name,
      year: d.year,
      targetTeamCount: d.targetTeamCount,
      squadSizeMin: d.squadSizeMin,
      squadSizeMax: d.squadSizeMax,
      registrationSelfServeEnabled: d.registrationSelfServeEnabled,
      registrationExcelImportEnabled: d.registrationExcelImportEnabled,
      formatConfig: d.formatConfig,
    },
  });
  await logAudit({
    actor,
    action: "season.update",
    entityType: "Season",
    entityId: season.id,
    summary: `Edited season details for "${d.name}"`,
    before: { name: season.name, year: season.year, squadSizeMin: season.squadSizeMin, squadSizeMax: season.squadSizeMax, formatConfig: season.formatConfig },
    after: { name: d.name, year: d.year, squadSizeMin: d.squadSizeMin, squadSizeMax: d.squadSizeMax, formatConfig: d.formatConfig },
  });
  return NextResponse.json({ ok: true });
}
