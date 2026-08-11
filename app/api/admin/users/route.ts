import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { hashPassword } from "@/lib/passwords";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// This page manages ADMIN/SCORER (staff) accounts only — team OWNER
// accounts are created/reset from /admin/security, alongside the rest of
// that team's settings.
const createUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(30)
    .regex(/^[a-z0-9._-]+$/i, "Username can only contain letters, numbers, dots, dashes and underscores"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["ADMIN", "SCORER"]),
});

export async function GET() {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;

  const users = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "SCORER"] } },
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const body = await request.json().catch(() => null);
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }

  const passwordHash = await hashPassword(parsed.data.password);
  try {
    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        username: parsed.data.username,
        passwordHash,
        role: parsed.data.role,
      },
      select: { id: true, name: true, username: true, role: true, isActive: true, createdAt: true },
    });
    await logAudit({
      actor,
      action: "user.create",
      entityType: "User",
      entityId: user.id,
      summary: `Created ${user.role} account "${user.username}" for ${user.name}`,
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "That username is already taken" }, { status: 409 });
  }
}
