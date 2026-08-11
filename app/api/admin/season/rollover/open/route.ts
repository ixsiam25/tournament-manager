import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { openNextSeason, getRolloverStatus } from "@/lib/seasonRollover";

export const dynamic = "force-dynamic";

const formatConfigSchema = z.object({
  matchFormat: z.enum(["SINGLE_ROUND_ROBIN", "DOUBLE_ROUND_ROBIN", "GROUPS_KNOCKOUT"]),
  knockoutStructure: z.enum(["NONE", "SEMIS_FINAL", "QUARTERS_SEMIS_FINAL"]),
  matchDurationMinutes: z.coerce.number().int().positive(),
  bufferMinutes: z.coerce.number().int().min(0),
  dayStartTime: z.string().trim().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
  pitches: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        availabilityStart: z.string().trim().regex(/^\d{2}:\d{2}$/).optional().nullable(),
        availabilityEnd: z.string().trim().regex(/^\d{2}:\d{2}$/).optional().nullable(),
      }),
    )
    .min(1, "At least one pitch is required"),
});

const openSeasonSchema = z.object({
  number: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(100),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Slug can only contain lowercase letters, numbers and dashes"),
  year: z.coerce.number().int(),
  teamFormation: z.enum(["BATCH", "AUCTION"]),
  targetTeamCount: z.coerce.number().int().positive().optional().nullable(),
  squadSizeMin: z.coerce.number().int().positive(),
  squadSizeMax: z.coerce.number().int().positive(),
  registrationSelfServeEnabled: z.boolean(),
  registrationExcelImportEnabled: z.boolean(),
  formatConfig: formatConfigSchema,
});

export async function POST(request: NextRequest) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const body = await request.json().catch(() => null);
  const parsed = openSeasonSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }
  if (parsed.data.squadSizeMax < parsed.data.squadSizeMin) {
    return NextResponse.json({ error: "Squad max can't be less than squad min" }, { status: 400 });
  }

  // If there's still an active season, it must be frozen (ARCHIVED) before
  // wiping — refuse to silently discard an unfrozen season's live data.
  const status = await getRolloverStatus();
  if (status.activeSeason) {
    return NextResponse.json(
      { error: `"${status.activeSeason.name}" is still active — freeze it first.` },
      { status: 409 },
    );
  }

  try {
    const { seasonId } = await openNextSeason(parsed.data);
    await logAudit({
      actor,
      action: "season.open",
      entityType: "Season",
      entityId: seasonId,
      summary: `Opened season "${parsed.data.name}" (${parsed.data.teamFormation}), wiped live tables`,
    });
    return NextResponse.json({ seasonId }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to open season" }, { status: 500 });
  }
}
