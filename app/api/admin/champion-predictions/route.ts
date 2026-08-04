import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/requireAdmin";
import { championPredictionSettingsSchema } from "@/lib/validation";
import {
  getChampionPredictionSettings,
  setChampionPredictionCloseAt,
  setChampionPredictionEnabled,
} from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

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
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

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

  const settings = await getChampionPredictionSettings();
  return NextResponse.json({ settings });
}
