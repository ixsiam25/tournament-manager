import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;

  const seasons = await prisma.season.findMany({
    select: { id: true, number: true, name: true, slug: true, status: true },
    orderBy: { number: "desc" },
  });
  return NextResponse.json({ seasons });
}
