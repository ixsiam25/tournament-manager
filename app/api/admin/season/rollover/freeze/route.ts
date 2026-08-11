import { NextResponse } from "next/server";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { freezeActiveSeason } from "@/lib/seasonRollover";

export const dynamic = "force-dynamic";

export async function POST() {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  try {
    const { seasonId, archive } = await freezeActiveSeason();
    await logAudit({
      actor,
      action: "season.freeze",
      entityType: "Season",
      entityId: seasonId,
      summary: `Froze season — champion: ${archive.championResult?.championTeamName ?? "unresolved"}`,
    });
    return NextResponse.json({ seasonId, archive });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to freeze season" }, { status: 409 });
  }
}
