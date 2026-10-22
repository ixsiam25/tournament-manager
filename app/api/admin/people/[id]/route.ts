import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { IdentityConflictError, setStudentId } from "@/lib/identity";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  studentId: z.string().trim().min(1).max(40).optional(),
});

export async function PATCH(request: NextRequest, { params }: Params) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;
  const { id } = await params;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }
  const before = await prisma.person.findUnique({ where: { id }, include: { identifiers: true } });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    if (parsed.data.name) await prisma.person.update({ where: { id }, data: { name: parsed.data.name } });
    if (parsed.data.studentId) await setStudentId(id, parsed.data.studentId);
  } catch (e) {
    if (e instanceof IdentityConflictError) {
      return NextResponse.json({ error: e.message, otherPersonId: e.otherPersonId }, { status: 409 });
    }
    throw e;
  }

  await logAudit({
    actor,
    action: "person.update",
    entityType: "Person",
    entityId: id,
    summary: `Updated ${before.name}${parsed.data.studentId ? " (student ID set)" : ""}`,
    // Student IDs are organiser-only data; the audit log is organiser-only too.
    before: { name: before.name, studentIds: before.identifiers.map((i) => i.value) },
    after: { name: parsed.data.name ?? before.name, studentId: parsed.data.studentId ?? null },
  });
  return NextResponse.json({ ok: true });
}
