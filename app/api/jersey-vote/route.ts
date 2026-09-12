import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getJerseyVoteTally } from "@/lib/jerseyVotes";
import { jerseyVoteSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const voterId = request.nextUrl.searchParams.get("voterId");
  const tally = await getJerseyVoteTally(voterId);
  return NextResponse.json(tally);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = jerseyVoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { voterId, like } = parsed.data;

  await prisma.jerseyVote.upsert({
    where: { voterId },
    create: { voterId, like },
    update: { like },
  });

  const tally = await getJerseyVoteTally(voterId);
  return NextResponse.json(tally);
}
