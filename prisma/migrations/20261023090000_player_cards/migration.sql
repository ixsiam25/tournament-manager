-- Phase 2c: player cards — cut-out image, framing, ratings, tier override.
ALTER TABLE "Player"
  ADD COLUMN "cutoutKey" TEXT,
  ADD COLUMN "photoZoom" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "photoX" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "photoY" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "ratings" JSONB,
  ADD COLUMN "cardTier" TEXT;

ALTER TABLE "Registration" ADD COLUMN "cutoutKey" TEXT;
