import { NextResponse } from "next/server";
import { requireUser } from "@/lib/userAuth";
import { getRolloverStatus } from "@/lib/seasonRollover";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;

  const status = await getRolloverStatus();
  return NextResponse.json(status);
}
