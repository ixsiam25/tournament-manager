import { prisma } from "@/lib/db";
import { getCurrentSeason } from "@/lib/currentSeason";
import { ChampionPredictionForm } from "@/components/ChampionPredictionForm";
import { ChampionResultBanner } from "@/components/ChampionResultBanner";
import { VoterIdentityForm } from "@/components/VoterIdentityForm";
import { getChampionResult } from "@/lib/predictions";

export const revalidate = 15;

export default async function PredictionsPage() {
  const season = await getCurrentSeason();
  const [teams, result] = await Promise.all([
    prisma.team.findMany({ where: { seasonId: season?.id ?? "none" }, orderBy: { name: "asc" } }),
    getChampionResult(season?.id),
  ]);

  return (
    <div>
      <h1 className="mb-2 heading-display text-2xl">🏆 Champions Prediction</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Who&rsquo;s taking the {season?.name ?? "season"} trophy? Cast your prediction below.
      </p>
      {result && <ChampionResultBanner result={result} />}
      <VoterIdentityForm />
      <ChampionPredictionForm teams={teams} />
    </div>
  );
}
