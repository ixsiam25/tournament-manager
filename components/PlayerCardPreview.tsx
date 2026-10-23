"use client";

import { PlayerCardView, type CardFraming } from "@/components/PlayerCardView";
import { buildCardModel, type Position } from "@/lib/playerCard";

export type { CardFraming };

/** Applicant-facing preview: an unrated card (ratings are set later by the
 * organisers) showing the typed name, position and chosen photo. */
export function PlayerCardPreview({
  name,
  position,
  photoUrl,
  isCutout,
  framing,
  footer,
  onFramingChange,
}: {
  name: string;
  position: string | null;
  photoUrl: string | null;
  isCutout?: boolean;
  framing: CardFraming;
  footer?: string;
  onFramingChange?: (next: CardFraming) => void;
}) {
  const model = buildCardModel({ position: (position as Position | null) ?? null, ratings: null });
  return (
    <PlayerCardView
      name={name}
      model={model}
      imageUrl={photoUrl}
      isCutout={isCutout}
      framing={framing}
      footer={footer}
      onFramingChange={onFramingChange}
    />
  );
}
