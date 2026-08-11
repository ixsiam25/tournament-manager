import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;

  const season = await prisma.season.findFirst({ where: { status: "ACTIVE" } });
  if (!season) return NextResponse.json({ error: "No active season" }, { status: 409 });
  if (season.teamFormation !== "AUCTION") {
    return NextResponse.json({ error: "The active season isn't an AUCTION season" }, { status: 409 });
  }

  const settings = await prisma.auctionSettings.findUnique({ where: { seasonId: season.id } });
  return NextResponse.json({ season, settings });
}

const bodySchema = z.object({
  budgetPerTeam: z.coerce.number().int().positive(),
  basePrice: z.coerce.number().int().positive(),
  bidIncrement: z.coerce.number().int().positive(),
});

export async function POST(request: NextRequest) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const season = await prisma.season.findFirst({ where: { status: "ACTIVE" } });
  if (!season) return NextResponse.json({ error: "No active season" }, { status: 409 });
  if (season.teamFormation !== "AUCTION") {
    return NextResponse.json({ error: "The active season isn't an AUCTION season" }, { status: 409 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }

  const settings = await prisma.auctionSettings.upsert({
    where: { seasonId: season.id },
    create: { seasonId: season.id, ...parsed.data },
    update: parsed.data,
  });

  await logAudit({
    actor,
    action: "auction.settings.update",
    entityType: "AuctionSettings",
    entityId: settings.id,
    summary: `Set auction settings: budget ${settings.budgetPerTeam}, base ${settings.basePrice}, increment ${settings.bidIncrement}`,
  });

  return NextResponse.json({ settings });
}
