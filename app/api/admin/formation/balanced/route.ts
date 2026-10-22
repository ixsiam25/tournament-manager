import { NextRequest } from "next/server";
import { z } from "zod";
import { formationAction } from "@/lib/formationRoute";
import { FormationError, applyBalanced, balancedProposal } from "@/lib/formationService";

export const dynamic = "force-dynamic";

const schema = z.object({ seed: z.number().int().min(0).max(2 ** 31), apply: z.boolean().optional() });

/** Preview (default) or apply a balanced random deal of the pool. The same
 * seed always yields the same deal, so what was previewed is what is applied. */
export async function POST(request: NextRequest) {
  const body = schema.safeParse(await request.json().catch(() => null));
  return formationAction(async ({ season, actor }) => {
    if (!body.success) throw new FormationError("A numeric seed is required", 400);
    return body.data.apply ? applyBalanced(season, body.data.seed, actor) : balancedProposal(season, body.data.seed);
  });
}
