import { NextRequest } from "next/server";
import { z } from "zod";
import { formationAction } from "@/lib/formationRoute";
import { FormationError, draftPick, resetDraft, startDraft, undoDraftPick } from "@/lib/formationService";

export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), order: z.array(z.string().min(1)).min(2) }),
  z.object({ action: z.literal("pick"), playerId: z.string().min(1) }),
  z.object({ action: z.literal("undo") }),
  z.object({ action: z.literal("reset") }),
]);

/** Snake draft controls: start with a team order, pick, undo, end. */
export async function POST(request: NextRequest) {
  const body = schema.safeParse(await request.json().catch(() => null));
  return formationAction(async ({ season, actor }) => {
    if (!body.success) throw new FormationError("Invalid draft request", 400);
    const d = body.data;
    if (d.action === "start") return startDraft(season, d.order, actor);
    if (d.action === "pick") return draftPick(season, d.playerId, actor);
    if (d.action === "undo") return undoDraftPick(season, actor);
    return resetDraft(season, actor);
  });
}
