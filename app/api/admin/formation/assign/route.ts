import { NextRequest } from "next/server";
import { z } from "zod";
import { formationAction } from "@/lib/formationRoute";
import { FormationError, assertBoardUsable, movePlayer } from "@/lib/formationService";

export const dynamic = "force-dynamic";

const schema = z.object({ playerId: z.string().min(1), teamId: z.string().min(1).nullable() });

/** Move one player to a team, or back to the pool (teamId null). */
export async function POST(request: NextRequest) {
  const body = schema.safeParse(await request.json().catch(() => null));
  return formationAction(async ({ season, actor }) => {
    if (!body.success) throw new FormationError("playerId and teamId are required", 400);
    assertBoardUsable(season);
    const p = await movePlayer({ season, playerId: body.data.playerId, teamId: body.data.teamId, actor });
    return { teamId: p.teamId, jerseyNumber: p.jerseyNumber };
  });
}
