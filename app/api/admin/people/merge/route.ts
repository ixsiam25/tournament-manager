import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { IdentityConflictError, mergePersons } from "@/lib/identity";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ keepId: z.string().min(1), dropId: z.string().min(1) });

/** Folds a duplicate Person into the one to keep (roster slots, registrations
 * and student IDs move over). The caller re-confirms the admin password in the
 * UI first — this cannot be undone. */
export async function POST(request: NextRequest) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "keepId and dropId are required" }, { status: 400 });

  const [keep, drop] = await Promise.all([
    prisma.person.findUnique({ where: { id: parsed.data.keepId }, select: { name: true } }),
    prisma.person.findUnique({ where: { id: parsed.data.dropId }, select: { name: true } }),
  ]);
  try {
    const moved = await mergePersons(parsed.data.keepId, parsed.data.dropId);
    await logAudit({
      actor,
      action: "person.merge",
      entityType: "Person",
      entityId: parsed.data.keepId,
      summary: `Merged "${drop?.name}" into "${keep?.name}"`,
      after: moved,
    });
    return NextResponse.json({ ok: true, moved });
  } catch (e) {
    if (e instanceof IdentityConflictError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
