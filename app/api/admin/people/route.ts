import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { normalizeStudentId } from "@/lib/identity";

export const dynamic = "force-dynamic";

/** People directory for organisers: every Person with their student IDs and
 * which edition/team they played for. `?q=` matches name or student ID.
 * `?unlinked=1` narrows to people without a student ID — the worklist for
 * linking past seasons by hand. Student IDs are organiser-only data. */
export async function GET(request: NextRequest) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const unlinked = request.nextUrl.searchParams.get("unlinked") === "1";
  const normalized = normalizeStudentId(q);

  const people = await prisma.person.findMany({
    where: {
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              ...(normalized ? [{ identifiers: { some: { value: { contains: normalized } } } }] : []),
            ],
          }
        : {}),
      ...(unlinked ? { identifiers: { none: {} } } : {}),
    },
    include: {
      identifiers: { select: { id: true, type: true, value: true } },
      players: {
        select: { season: { select: { id: true, name: true, number: true } }, team: { select: { name: true } } },
        orderBy: { season: { number: "desc" } },
      },
    },
    orderBy: { name: "asc" },
    take: 200,
  });

  return NextResponse.json({
    people: people.map((p) => ({
      id: p.id,
      name: p.name,
      studentIds: p.identifiers.filter((i) => i.type === "STUDENT_ID").map((i) => i.value),
      appearances: p.players.map((pl) => ({ season: pl.season.name, team: pl.team?.name ?? null })),
    })),
  });
}
