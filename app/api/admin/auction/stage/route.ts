import { NextRequest, NextResponse } from "next/server";
import { auctionAction } from "@/lib/auctionRoute";
import { STAGE_MODES, setStageMode, type StageMode } from "@/lib/auctionService";

export const dynamic = "force-dynamic";

/** Presentation control: which screen the projector shows (poster, captains, let's begin, live, break). */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const mode = body?.mode as StageMode | undefined;
  if (!mode || !STAGE_MODES.includes(mode)) return NextResponse.json({ error: "mode must be one of " + STAGE_MODES.join(", ") }, { status: 400 });
  return auctionAction(async (ctx) => {
    await setStageMode(ctx, mode);
    return { mode };
  });
}
