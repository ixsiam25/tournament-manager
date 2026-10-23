import { getCurrentSeason } from "@/lib/currentSeason";
import { getCards } from "@/lib/cardData";
import { CardGallery } from "@/components/CardGallery";

export const revalidate = 30;

export default async function CardsPage() {
  const season = await getCurrentSeason();
  const cards = season ? await getCards(season.id) : [];
  return (
    <div>
      <h1 className="mb-2 heading-display text-2xl">Player cards</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {season ? `${season.name} — ` : ""}ratings are set by the organisers; goals and assists add a form bonus as the tournament goes on.
      </p>
      <CardGallery cards={cards} seasonName={season?.name ?? ""} />
    </div>
  );
}
