/**
 * Every list of matches across the app sorts round-by-round (LEAGUE, then
 * SEMIFINAL, then FINAL) and within a round by actual kickoff time -- never
 * by the free-text `Match.label` field, which is just an admin-editable
 * note (used for descriptive knockout labels like "Final") and isn't kept
 * in sync with kickoff order if a fixture gets rescheduled. Shared here so
 * every query that lists matches for display uses the same ordering
 * instead of each defining its own copy that could drift.
 */
export const MATCH_DISPLAY_ORDER_BY = [
  { round: "asc" as const },
  { scheduledAt: "asc" as const },
  { createdAt: "asc" as const },
];
