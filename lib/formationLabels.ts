/** How teams can be formed, in plain words (shown to applicants and organisers). */
export const FORMATION_OPTIONS: { key: string; label: string; blurb: string }[] = [
  { key: "BATCH", label: "By batch", blurb: "one team per graduation batch (by semester)" },
  { key: "MANUAL", label: "Manual", blurb: "the organizers place every player themselves" },
  { key: "BALANCED_RANDOM", label: "Balanced random", blurb: "a fair random draw that evens out positions" },
  { key: "DRAFT", label: "Snake draft", blurb: "team captains pick in turns" },
  { key: "AUCTION", label: "Auction", blurb: "captains bid for players live" },
];

export const formationLabel = (key: string | null | undefined) => FORMATION_OPTIONS.find((o) => o.key === key)?.label ?? null;
