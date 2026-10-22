-- Edition scoping (Phase 1): every live row now belongs to a Season, and
-- Seasons belong to a Tournament. Hand-ordered so existing rows are backfilled
-- BEFORE the NOT NULL constraints land.

-- DropIndex
DROP INDEX "ChampionPrediction_voterId_key";

-- DropIndex
DROP INDEX "Team_name_key";

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sport" TEXT NOT NULL DEFAULT 'football',
    "currentSeasonId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tournament_slug_key" ON "Tournament"("slug");

-- AlterTable (nullable first)
ALTER TABLE "Season" ADD COLUMN "tournamentId" TEXT;
ALTER TABLE "Team" ADD COLUMN "seasonId" TEXT;
ALTER TABLE "Player" ADD COLUMN "seasonId" TEXT;
ALTER TABLE "Match" ADD COLUMN "seasonId" TEXT;
ALTER TABLE "ChampionPrediction" ADD COLUMN "seasonId" TEXT;

-- Backfill: one BFL tournament owning every existing season.
INSERT INTO "Tournament" ("id", "name", "slug", "sport", "updatedAt")
VALUES ('tournament_bfl', 'Bangladesh Football League', 'bfl', 'football', CURRENT_TIMESTAMP);

UPDATE "Season" SET "tournamentId" = 'tournament_bfl';

-- "Current" edition = the ACTIVE season if there is one, else the newest.
UPDATE "Tournament" SET "currentSeasonId" = (
    SELECT "id" FROM "Season"
    ORDER BY ("status" = 'ACTIVE') DESC, "number" DESC
    LIMIT 1
) WHERE "id" = 'tournament_bfl';

-- Live rows predate scoping, so they belong to whatever season was live.
UPDATE "Team" SET "seasonId" = (SELECT "currentSeasonId" FROM "Tournament" WHERE "id" = 'tournament_bfl');
UPDATE "Player" SET "seasonId" = (SELECT "currentSeasonId" FROM "Tournament" WHERE "id" = 'tournament_bfl');
UPDATE "Match" SET "seasonId" = (SELECT "currentSeasonId" FROM "Tournament" WHERE "id" = 'tournament_bfl');
UPDATE "ChampionPrediction" SET "seasonId" = (SELECT "currentSeasonId" FROM "Tournament" WHERE "id" = 'tournament_bfl');

-- Now enforce.
ALTER TABLE "Season" ALTER COLUMN "tournamentId" SET NOT NULL;
ALTER TABLE "Team" ALTER COLUMN "seasonId" SET NOT NULL;
ALTER TABLE "Player" ALTER COLUMN "seasonId" SET NOT NULL;
ALTER TABLE "Match" ALTER COLUMN "seasonId" SET NOT NULL;
ALTER TABLE "ChampionPrediction" ALTER COLUMN "seasonId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ChampionPrediction_seasonId_voterId_key" ON "ChampionPrediction"("seasonId", "voterId");
CREATE INDEX "Match_seasonId_idx" ON "Match"("seasonId");
CREATE INDEX "Player_seasonId_idx" ON "Player"("seasonId");
CREATE INDEX "Season_tournamentId_idx" ON "Season"("tournamentId");
CREATE INDEX "Team_seasonId_idx" ON "Team"("seasonId");
CREATE UNIQUE INDEX "Team_seasonId_name_key" ON "Team"("seasonId", "name");

-- AddForeignKey
ALTER TABLE "Season" ADD CONSTRAINT "Season_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Team" ADD CONSTRAINT "Team_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Player" ADD CONSTRAINT "Player_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Match" ADD CONSTRAINT "Match_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChampionPrediction" ADD CONSTRAINT "ChampionPrediction_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;
