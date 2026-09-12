import { prisma } from "@/lib/db";

export type JerseyVoteTally = {
  likes: number;
  dislikes: number;
  total: number;
  likePct: number;
  yourVote: boolean | null;
};

/** Aggregates the kit-reveal thumbs up/down poll. `voterId` (if given) is
 * used only to report the caller's own vote — it never affects the tally
 * itself, which is a plain count of every JerseyVote row. */
export async function getJerseyVoteTally(voterId?: string | null): Promise<JerseyVoteTally> {
  const [grouped, mine] = await Promise.all([
    prisma.jerseyVote.groupBy({ by: ["like"], _count: { _all: true } }),
    voterId
      ? prisma.jerseyVote.findUnique({ where: { voterId }, select: { like: true } })
      : Promise.resolve(null),
  ]);

  const likes = grouped.find((g) => g.like === true)?._count._all ?? 0;
  const dislikes = grouped.find((g) => g.like === false)?._count._all ?? 0;
  const total = likes + dislikes;

  return {
    likes,
    dislikes,
    total,
    likePct: total === 0 ? 50 : Math.round((likes / total) * 100),
    yourVote: mine?.like ?? null,
  };
}
