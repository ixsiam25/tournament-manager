import { plural } from "@/lib/plural";
import { prisma } from "@/lib/db";
import type { Season } from "@/lib/generated/prisma/client";

export type StepStatus = "done" | "current" | "todo";
export type StepAction = { label: string; href?: string; action?: "openRegistration" | "closeRegistration"; primary?: boolean };
export type SetupStep = { key: string; title: string; status: StepStatus; detail: string; actions: StepAction[] };

const FORMATION_LABELS: Record<string, string> = {
  UNDECIDED: "Not chosen yet",
  BATCH: "By batch (Fall/Spring intake)",
  MANUAL: "Manual",
  BALANCED_RANDOM: "Balanced random",
  DRAFT: "Snake draft",
  AUCTION: "Auction",
};

/**
 * Where an edition is in its life, derived from the data (nothing to keep in
 * sync): created → applications → review & choose how teams are formed → form
 * the teams → fixtures → matchdays → wrap up. The first unfinished step is the
 * "current" one and carries the organiser's next action.
 */
export async function getSeasonProgress(season: Season): Promise<SetupStep[]> {
  const [regs, teams, pool, matches, finished, settings] = await Promise.all([
    prisma.registration.groupBy({ by: ["status"], where: { seasonId: season.id }, _count: { _all: true } }),
    prisma.team.findMany({ where: { seasonId: season.id }, select: { id: true, _count: { select: { players: { where: { status: "ACTIVE" } } } } } }),
    prisma.player.count({ where: { seasonId: season.id, teamId: null, status: "ACTIVE" } }),
    prisma.match.count({ where: { seasonId: season.id } }),
    prisma.match.count({ where: { seasonId: season.id, status: "FINISHED" } }),
    prisma.auctionSettings.findUnique({ where: { seasonId: season.id } }),
  ]);
  const n = (s: string) => regs.find((r) => r.status === s)?._count._all ?? 0;
  const pending = n("PENDING");
  const approved = n("APPROVED");
  const total = pending + approved + n("REJECTED");
  const min = season.squadSizeMin ?? 0;
  const strategy = season.teamFormation;
  const isAuction = strategy === "AUCTION";

  const deadline = season.applicationDeadline ? ` · closes ${season.applicationDeadline.toISOString().slice(0, 16).replace("T", " ")} UTC` : "";
  const applicationsDone = !season.registrationOpen && pending === 0 && total > 0;
  const formationDone = strategy !== "UNDECIDED";
  const teamsReady =
    teams.length >= 2 && pool === 0 && teams.every((t) => t._count.players >= min) && (!isAuction || !!settings?.lockedAt);
  const teamsNote = isAuction
    ? `${plural(teams.length, "team")} · ${plural(pool, "player")} not yet placed${settings?.lockedAt ? " · auction closed" : ""}`
    : `${plural(teams.length, "team")} · ${plural(pool, "player")} waiting in the pool`;

  const steps: Omit<SetupStep, "status">[] & { done?: boolean }[] = [];
  const add = (step: Omit<SetupStep, "status">, done: boolean) => steps.push({ ...step, done } as never);

  add({ key: "created", title: "Season created", detail: `${season.name} · created ${season.createdAt.toISOString().slice(0, 10)}`, actions: [] }, true);

  add(
    {
      key: "applications",
      title: "Applications",
      detail: `${season.registrationOpen ? "Open" : "Closed"} · ${total} application(s): ${pending} waiting for review, ${approved} approved${deadline}${season.registrationSelfServeEnabled ? "" : " · public form is off"}`,
      actions: [
        season.registrationOpen
          ? { label: "Close registration", action: "closeRegistration", primary: !applicationsDone }
          : { label: "Reopen registration", action: "openRegistration" },
        { label: pending > 0 ? `Review ${pending} application(s)` : "Open applications list", href: "/admin/registrations", primary: !season.registrationOpen && pending > 0 },
        { label: "Form settings", href: "/admin/settings" },
      ],
    },
    applicationsDone,
  );

  add(
    {
      key: "formation",
      title: "Confirm applicants & choose how teams are formed",
      detail: formationDone ? `Chosen: ${FORMATION_LABELS[strategy]}` : approved === 0 ? "Not chosen yet — approve some applicants first" : `Not chosen yet — ${approved} approved applicant(s) are waiting`,
      actions: [{ label: formationDone ? "Change formation" : "Confirm & choose formation", href: "/admin/formation", primary: !formationDone && applicationsDone }],
    },
    formationDone,
  );

  // Batch seasons create their teams from the applications' batches, so there is
  // nothing to set up first; every other method needs the teams to exist.
  if (strategy !== "BATCH") {
    add(
      {
        key: "teamsetup",
        title: "Set up the teams (name, logo, captain, manager)",
        detail: !formationDone ? "Waiting for the formation choice" : teams.length >= 2 ? `${plural(teams.length, "team")} created` : teams.length === 1 ? "1 team so far — add at least one more" : "No teams yet",
        actions: formationDone ? [{ label: teams.length >= 2 ? "Edit the teams" : "Set up the teams", href: "/admin/season/teams", primary: teams.length < 2 }] : [],
      },
      formationDone && teams.length >= 2,
    );
  }

  add(
    {
      key: "teams",
      title: "Form the teams",
      detail: formationDone ? teamsNote : "Waiting for the formation choice",
      actions: formationDone
        ? [
            isAuction ? { label: "Open the auction", href: "/admin/auction", primary: true } : { label: "Open the formation board", href: "/admin/formation", primary: true },
            { label: "Team details (logos, managers, captains)", href: "/admin/season/teams" },
            { label: "Player cards", href: "/admin/cards" },
          ]
        : [],
    },
    teamsReady,
  );

  add({ key: "fixtures", title: "Fixtures", detail: matches > 0 ? `${matches} match(es) scheduled` : "No fixtures yet", actions: [{ label: matches > 0 ? "Edit fixtures" : "Create fixtures", href: "/admin/fixtures", primary: true }] }, matches > 0);

  add({ key: "play", title: "Matchdays", detail: matches > 0 ? `${finished} of ${matches} played` : "Waiting for fixtures", actions: matches > 0 ? [{ label: "Open the dashboard", href: "/admin", primary: true }] : [] }, matches > 0 && finished === matches);

  add({ key: "wrapup", title: "Wrap up", detail: "Freeze the results and open the next season", actions: [{ label: "Season rollover", href: "/admin/season/rollover" }] }, season.status === "ARCHIVED");

  let currentAssigned = false;
  return (steps as (Omit<SetupStep, "status"> & { done: boolean })[]).map(({ done, ...step }) => {
    const status: StepStatus = done ? "done" : currentAssigned ? "todo" : ((currentAssigned = true), "current");
    return { ...step, status };
  });
}
