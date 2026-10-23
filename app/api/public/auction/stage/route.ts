import { NextResponse } from "next/server";
import { getStageState } from "@/lib/auctionStage";

export const dynamic = "force-dynamic";

/** Projector state, polled every couple of seconds by `/stage/auction`. */
export async function GET() {
  return NextResponse.json(await getStageState(), { headers: { "Cache-Control": "no-store" } });
}
