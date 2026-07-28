import { prisma } from "@/lib/db";
import { ChampionPredictionForm } from "@/components/ChampionPredictionForm";
import { VoterIdentityForm } from "@/components/VoterIdentityForm";

export const revalidate = 15;

export default async function PredictionsPage() {
  const teams = await prisma.team.findMany({ orderBy: { name: "asc" } });

  return (
    <div>
      <h1 className="mb-2 heading-display text-2xl">🏆 Champions Prediction</h1>
      <p className="mb-6 text-sm text-muted">
        Who&rsquo;s taking the Season IX trophy? Cast your prediction below.
      </p>
      <VoterIdentityForm />
      <ChampionPredictionForm teams={teams} />
    </div>
  );
}
