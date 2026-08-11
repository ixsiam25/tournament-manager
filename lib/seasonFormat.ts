/**
 * The shape of `Season.formatConfig` — captured once by the rollover
 * wizard's format questionnaire (Stage 4.1) and consumed by the fixture
 * scheduling assistant (Stage 4.2). Kept in its own file since both sides
 * need the same type.
 */

export type MatchFormat = "SINGLE_ROUND_ROBIN" | "DOUBLE_ROUND_ROBIN" | "GROUPS_KNOCKOUT";
export type KnockoutStructure = "NONE" | "SEMIS_FINAL" | "QUARTERS_SEMIS_FINAL";

export type FormatPitch = {
  name: string;
  /** "HH:MM" 24h. Leave both null/undefined for an all-day pitch. */
  availabilityStart?: string | null;
  availabilityEnd?: string | null;
};

export type SeasonFormatConfig = {
  matchFormat: MatchFormat;
  knockoutStructure: KnockoutStructure;
  matchDurationMinutes: number;
  bufferMinutes: number;
  /** "HH:MM" 24h. */
  dayStartTime: string;
  pitches: FormatPitch[];
};

export const DEFAULT_FORMAT_CONFIG: SeasonFormatConfig = {
  matchFormat: "SINGLE_ROUND_ROBIN",
  knockoutStructure: "SEMIS_FINAL",
  matchDurationMinutes: 7,
  bufferMinutes: 3,
  dayStartTime: "17:00",
  pitches: [{ name: "Field 1" }],
};
