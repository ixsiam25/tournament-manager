import { z } from "zod";

export const teamSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  shortName: z.string().trim().max(20).optional().nullable(),
  managerName: z.string().trim().max(80).optional().nullable(),
});

export const playerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  jerseyNumber: z.coerce.number().int().min(0).max(999),
  teamId: z.string().trim().min(1, "Team is required"),
  position: z.enum(["GK", "DEF", "MID", "FWD"]).optional().nullable(),
  isCaptain: z.coerce.boolean().optional(),
});

export const fixtureSchema = z.object({
  round: z.enum(["LEAGUE", "SEMIFINAL", "FINAL"]),
  label: z.string().trim().max(80).optional().nullable(),
  homeTeamId: z.string().trim().min(1).optional().nullable(),
  awayTeamId: z.string().trim().min(1).optional().nullable(),
  scheduledAt: z.string().trim().optional().nullable(),
  venue: z.string().trim().max(120).optional().nullable(),
});

export const eventSchema = z.object({
  type: z.enum(["GOAL", "YELLOW_CARD", "RED_CARD"]),
  teamId: z.string().trim().min(1, "Team is required"),
  playerId: z.string().trim().min(1, "Player is required"),
  assistPlayerId: z.string().trim().min(1).optional().nullable(),
});
