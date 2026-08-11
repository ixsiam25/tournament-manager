import { NextResponse } from "next/server";
import { requireUser } from "@/lib/userAuth";

export async function GET() {
  const result = await requireUser(["ADMIN", "SCORER"]);
  if (result instanceof NextResponse) return result;
  const { user } = result;
  return NextResponse.json({ name: user.name, username: user.username, role: user.role });
}
