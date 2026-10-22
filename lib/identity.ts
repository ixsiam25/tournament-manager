import { prisma } from "@/lib/db";

/** Student IDs are compared exactly, so store one canonical form: trimmed,
 * upper-case, no internal whitespace. Returns null for blank input. */
export function normalizeStudentId(raw: string | null | undefined): string | null {
  const value = raw?.trim().toUpperCase().replace(/\s+/g, "");
  return value ? value : null;
}

/** Thrown when an identifier already belongs to a different Person, or a
 * merge would put one human on two rosters in the same season. The message
 * is safe to show to an admin. */
export class IdentityConflictError extends Error {
  constructor(
    message: string,
    readonly otherPersonId?: string,
  ) {
    super(message);
    this.name = "IdentityConflictError";
  }
}

export async function findPersonByStudentId(studentId: string) {
  const row = await prisma.personIdentifier.findUnique({
    where: { type_value: { type: "STUDENT_ID", value: studentId } },
    include: { person: true },
  });
  return row?.person ?? null;
}

export type PersonMatch = {
  personId: string;
  /** How the match was made — the UI shows weaker matches as suggestions. */
  by: "studentId" | "name" | "created";
};

/**
 * Resolves the Person for someone being added to a roster.
 *
 * - With a student ID: that ID's owner wins; otherwise a new Person is created
 *   and the ID attached. Names are NOT used to guess a link here — two
 *   different people share names, and a wrong link silently merges careers.
 * - Without a student ID (legacy / manual adds): reuse a Person only when
 *   exactly one has that exact name (case-insensitive), else create one.
 */
export async function findOrCreatePerson(input: { name: string; studentId?: string | null }): Promise<PersonMatch> {
  const studentId = normalizeStudentId(input.studentId);
  if (studentId) {
    const owner = await findPersonByStudentId(studentId);
    if (owner) return { personId: owner.id, by: "studentId" };
    const person = await prisma.person.create({
      data: { name: input.name, identifiers: { create: { type: "STUDENT_ID", value: studentId } } },
    });
    return { personId: person.id, by: "created" };
  }

  const sameName = await prisma.person.findMany({
    where: { name: { equals: input.name, mode: "insensitive" } },
    select: { id: true },
    take: 2,
  });
  if (sameName.length === 1) return { personId: sameName[0].id, by: "name" };
  const person = await prisma.person.create({ data: { name: input.name } });
  return { personId: person.id, by: "created" };
}

/** Attaches a student ID to a Person. Idempotent; refuses when the ID is
 * already owned by someone else (that's a merge, not a link). */
export async function setStudentId(personId: string, raw: string): Promise<void> {
  const studentId = normalizeStudentId(raw);
  if (!studentId) throw new IdentityConflictError("Student ID is empty");
  const owner = await prisma.personIdentifier.findUnique({
    where: { type_value: { type: "STUDENT_ID", value: studentId } },
    include: { person: { select: { id: true, name: true } } },
  });
  if (owner) {
    if (owner.personId === personId) return;
    throw new IdentityConflictError(`Student ID ${studentId} already belongs to ${owner.person.name} — merge the two people instead`, owner.personId);
  }
  await prisma.personIdentifier.create({ data: { personId, type: "STUDENT_ID", value: studentId } });
}

export type MergeResult = { players: number; registrations: number; identifiers: number };

/**
 * Folds `dropId` into `keepId`: roster slots, registrations and identifiers
 * move over, then the duplicate Person is deleted. Refuses if both people
 * already have a roster slot in the same season (one human can't be on two
 * rosters in one edition — that needs a manual decision first).
 */
export async function mergePersons(keepId: string, dropId: string): Promise<MergeResult> {
  if (keepId === dropId) throw new IdentityConflictError("Pick two different people to merge");
  const [keep, drop] = await Promise.all([
    prisma.person.findUnique({ where: { id: keepId }, include: { players: { select: { seasonId: true } } } }),
    prisma.person.findUnique({ where: { id: dropId }, include: { players: { select: { seasonId: true } } } }),
  ]);
  if (!keep || !drop) throw new IdentityConflictError("Person not found");

  const keepSeasons = new Set(keep.players.map((p) => p.seasonId));
  const clash = drop.players.filter((p) => keepSeasons.has(p.seasonId));
  if (clash.length > 0) {
    throw new IdentityConflictError(
      `Both ${keep.name} and ${drop.name} have a roster slot in the same season — remove one of those slots first`,
    );
  }

  const [players, registrations, identifiers] = await prisma.$transaction([
    prisma.player.updateMany({ where: { personId: dropId }, data: { personId: keepId } }),
    prisma.registration.updateMany({ where: { personId: dropId }, data: { personId: keepId } }),
    prisma.personIdentifier.updateMany({ where: { personId: dropId }, data: { personId: keepId } }),
  ]);
  await prisma.person.delete({ where: { id: dropId } });
  return { players: players.count, registrations: registrations.count, identifiers: identifiers.count };
}
