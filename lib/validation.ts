import { z } from "zod";

export const teamSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  shortName: z.string().trim().max(20).optional().nullable(),
  managerName: z.string().trim().max(80).optional().nullable(),
  logoUrl: z.string().trim().max(500).optional().nullable(),
});

export const playerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  jerseyNumber: z.coerce.number().int().min(0).max(999),
  teamId: z.string().trim().min(1, "Team is required"),
  position: z.enum(["GK", "DEF", "MID", "FWD"]).optional().nullable(),
  isCaptain: z.coerce.boolean().optional(),
  photoUrl: z.string().trim().max(500).optional().nullable(),
});

/** Scoped down from playerSchema — a manager may only move their own
 * players between positions, not rename/renumber/recaptain them. */
export const managerPlayerPositionSchema = z.object({
  position: z.enum(["GK", "DEF", "MID", "FWD"]).nullable(),
});

export const fixtureSchema = z.object({
  round: z.enum(["LEAGUE", "SEMIFINAL", "FINAL"]),
  label: z.string().trim().max(80).optional().nullable(),
  homeTeamId: z.string().trim().min(1).optional().nullable(),
  awayTeamId: z.string().trim().min(1).optional().nullable(),
  scheduledAt: z.string().trim().optional().nullable(),
  venue: z.string().trim().max(120).optional().nullable(),
  mainReferee: z.string().trim().max(80).optional().nullable(),
  assistantReferee: z.string().trim().max(80).optional().nullable(),
});

/** How admin resolves a drawn SEMIFINAL/FINAL when finishing it — regulation
 * score alone can't say who advances. `EXTRA_TIME` doesn't finish the match
 * (see the finish route) — it puts the ball back in play for admin to keep
 * logging goals, and can only be chosen once per match. */
export const drawResolutionSchema = z.union([
  z.object({
    method: z.literal("EXTRA_TIME"),
  }),
  z.object({
    method: z.literal("PENALTIES"),
    penaltyHomeScore: z.coerce.number().int().min(0).max(99),
    penaltyAwayScore: z.coerce.number().int().min(0).max(99),
  }),
  z.object({
    method: z.literal("MANUAL"),
    winnerTeamId: z.string().trim().min(1, "Winner is required"),
  }),
]);

export const finishMatchSchema = z.object({
  resolution: drawResolutionSchema.optional(),
});

export const eventSchema = z.object({
  type: z.enum(["GOAL", "YELLOW_CARD", "RED_CARD"]),
  teamId: z.string().trim().min(1, "Team is required"),
  playerId: z.string().trim().min(1, "Player is required"),
  assistPlayerId: z.string().trim().min(1).optional().nullable(),
});

export const predictionSchema = z.object({
  matchId: z.string().trim().min(1, "Match is required"),
  teamId: z.string().trim().min(1, "Team is required"),
  voterId: z.string().trim().min(1, "Voter id is required").max(100),
  voterName: z.string().trim().max(60).optional().nullable(),
  voterSemester: z.string().trim().max(30).optional().nullable(),
});

export const championPredictionSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  closeAt: z.string().trim().min(1).optional().nullable(),
});

export const announcementSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  text: z.string().trim().max(280).optional(),
  level: z.enum(["info", "warn"]).optional(),
  expiresAt: z.string().trim().min(1).optional().nullable(),
});

export const championPredictionSchema = z.object({
  teamId: z.string().trim().min(1, "Team is required"),
  voterId: z.string().trim().min(1, "Voter id is required").max(100),
  voterName: z.string().trim().max(60).optional().nullable(),
  voterSemester: z.string().trim().max(30).optional().nullable(),
});

export const registrationSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  affiliation: z.string().trim().min(1, "Affiliation is required").max(80),
  position: z.enum(["GK", "DEF", "MID", "FWD"]).optional().nullable(),
  contact: z.string().trim().min(1, "Contact is required").max(120),
});

export const registrationReviewSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  notes: z.string().trim().max(300).optional().nullable(),
});
