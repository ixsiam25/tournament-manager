import { NextResponse } from "next/server";
import { getLiveStatus } from "@/lib/liveStatus";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getLiveStatus();
  return NextResponse.json(data);
}
