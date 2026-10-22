import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { getActiveSeason } from "@/lib/currentSeason";
import { applicationConfigSchema, resolveApplicationConfig } from "@/lib/applicationConfig";

export const dynamic = "force-dynamic";

/** The active season's application-form settings: which fields to ask, custom
 * questions, intro text and the closing deadline. */
export async function GET() {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const season = await getActiveSeason();
  if (!season) return NextResponse.json({ season: null });
  return NextResponse.json({
    season: { id: season.id, name: season.name, registrationOpen: season.registrationOpen },
    config: resolveApplicationConfig(season.applicationConfig),
    deadline: season.applicationDeadline?.toISOString() ?? null,
  });
}

const putSchema = z.object({
  config: applicationConfigSchema,
  deadline: z.string().datetime().nullable(),
});

export async function PUT(request: NextRequest) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const season = await getActiveSeason();
  if (!season) return NextResponse.json({ error: "No active season" }, { status: 409 });

  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }

  const updated = await prisma.season.update({
    where: { id: season.id },
    data: {
      applicationConfig: parsed.data.config,
      applicationDeadline: parsed.data.deadline ? new Date(parsed.data.deadline) : null,
    },
  });
  await logAudit({
    actor,
    action: "season.application_config",
    entityType: "Season",
    entityId: season.id,
    summary: "Updated the application form settings",
    before: { config: season.applicationConfig, deadline: season.applicationDeadline },
    after: { config: updated.applicationConfig, deadline: updated.applicationDeadline },
  });
  return NextResponse.json({ ok: true });
}
