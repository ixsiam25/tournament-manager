import { prisma } from "@/lib/db";
import { findOrCreatePerson } from "@/lib/identity";
import type { Registration, Season } from "@/lib/generated/prisma/client";

/**
 * Turns an approved `Registration` into a real `Player` — linking (or
 * creating) the stable `Person` identity, then either handing the player
 * straight to a team (`BATCH`) or queuing an `AuctionLot` for it
 * (`AUCTION`). Shared between the single-approve, bulk-approve and
 * manual-add (auto-approved) routes so the branching logic only lives in
 * one place.
 */
export type ApprovalResult = { personId: string; createdPlayer: boolean; alreadyOnRoster: boolean };

export async function approveRegistration(registration: Registration, season: Season): Promise<ApprovalResult> {
  // A student ID pins the Person exactly; without one we only reuse a Person
  // when exactly one shares the name (see lib/identity.ts).
  let personId = registration.personId;
  if (!personId) {
    personId = (await findOrCreatePerson({ name: registration.name, studentId: registration.studentId })).personId;
  }

  let createdPlayer = false;
  const alreadyOnRoster = !!(await prisma.player.findUnique({
    where: { seasonId_personId: { seasonId: season.id, personId } },
    select: { id: true },
  }));

  if (season.teamFormation === "AUCTION" && !alreadyOnRoster) {
    const player = await prisma.player.create({
      data: {
        seasonId: season.id,
        name: registration.name,
        // Jersey numbers are assigned once a player is actually on a
        // team's squad after the auction — 0 is a harmless placeholder
        // since [teamId, jerseyNumber] uniqueness doesn't apply while
        // teamId is null.
        jerseyNumber: 0,
        position: registration.position,
        photoUrl: registration.photoKey ? `/api/photos/${registration.photoKey}` : null,
        personId,
      },
    });
    const maxOrder = await prisma.auctionLot.aggregate({ where: { seasonId: season.id }, _max: { order: true } });
    await prisma.auctionLot.create({
      data: {
        seasonId: season.id,
        playerId: player.id,
        order: (maxOrder._max.order ?? -1) + 1,
        status: "QUEUED",
      },
    });
    createdPlayer = true;
  }
  // BATCH-formation seasons don't have a well-defined "which team" without
  // further admin input (affiliation is free text, not a team id) — the
  // plan's BATCH branch assumes that mapping is handled by the season's
  // committee outside this flow, so no Player is created here for BATCH;
  // admin adds them to a team directly via the existing /admin/players form.

  await prisma.registration.update({
    where: { id: registration.id },
    data: { personId },
  });
  return { personId, createdPlayer, alreadyOnRoster };
}
