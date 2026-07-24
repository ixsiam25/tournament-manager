import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { playerSchema } from "@/lib/validation";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const teamId = request.nextUrl.searchParams.get("teamId");
  const players = await prisma.player.findMany({
    where: teamId ? { teamId } : undefined,
    include: { team: true },
    orderBy: [{ team: { name: "asc" } }, { jerseyNumber: "asc" }],
  });
  return NextResponse.json({ players });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const parsed = playerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }

  try {
    const player = await prisma.player.create({ data: parsed.data });
    return NextResponse.json({ player }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "That jersey number is already taken on this team" },
      { status: 409 },
    );
  }
}
