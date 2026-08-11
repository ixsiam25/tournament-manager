import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { championPredictionSettingsSchema } from "@/lib/validation";
import {
  getChampionPredictionSettings,
  setChampionPredictionCloseAt,
  setChampionPredictionEnabled,
} from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;

  const [predictions, settings] = await Promise.all([
    prisma.championPrediction.findMany({
      include: { team: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    getChampionPredictionSettings(),
  ]);
  return NextResponse.json({ predictions, settings });
}

export async function PATCH(request: NextRequest) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const body = await request.json().catch(() => null);
  const parsed = championPredictionSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }

  if (parsed.data.enabled !== undefined) {
    await setChampionPredictionEnabled(parsed.data.enabled);
  }
  if (parsed.data.closeAt !== undefined) {
    await setChampionPredictionCloseAt(parsed.data.closeAt);
  }
  await logAudit({
    actor,
    action: "champion_predictions.update",
    entityType: "AppSetting",
    summary: "Updated champion-prediction settings",
    after: parsed.data,
  });

  const settings = await getChampionPredictionSettings();
  return NextResponse.json({ settings });
}
