import { NextResponse } from "next/server";
import { getPublicAuctionStatus } from "@/lib/auction";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getPublicAuctionStatus();
  return NextResponse.json(status);
}
