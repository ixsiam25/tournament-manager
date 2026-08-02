import { prisma } from "@/lib/db";
import { ChampionPredictionForm } from "@/components/ChampionPredictionForm";
import { ChampionResultBanner } from "@/components/ChampionResultBanner";
import { VoterIdentityForm } from "@/components/VoterIdentityForm";
import { getChampionResult } from "@/lib/predictions";

export const revalidate = 15;

export default async function PredictionsPage() {
  const [teams, result] = await Promise.all([
    prisma.team.findMany({ orderBy: { name: "asc" } }),
    getChampionResult(),
  ]);

  return (
    <div>
      <h1 className="mb-2 heading-display text-2xl">🏆 Champions Prediction</h1>
      <p className="mb-6 text-sm text-muted">
        Who&rsquo;s taking the Season IX trophy? Cast your prediction below.
      </p>
      {result && <ChampionResultBanner result={result} />}
      <VoterIdentityForm />
      <ChampionPredictionForm teams={teams} />
    </div>
  );
}
