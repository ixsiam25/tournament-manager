-- Phase 2: persistent team identity (Franchise), person identifiers
-- (student ID), required Player.personId, one roster slot per person per
-- season. Hand-ordered so backfills run before NOT NULL / unique constraints.

-- CreateEnum
CREATE TYPE "IdentifierType" AS ENUM ('STUDENT_ID');

-- CreateTable
CREATE TABLE "Franchise" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "names" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Franchise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonIdentifier" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "type" "IdentifierType" NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonIdentifier_pkey" PRIMARY KEY ("id")
);

-- AlterTable (nullable first)
ALTER TABLE "Team" ADD COLUMN "franchiseId" TEXT;
ALTER TABLE "Registration" ADD COLUMN "studentId" TEXT;

-- Backfill franchises: one per distinct team name within a tournament.
INSERT INTO "Franchise" ("id", "tournamentId", "name", "shortName", "updatedAt")
SELECT 'franchise_' || md5(s."tournamentId" || '|' || t."name"), s."tournamentId", t."name", MAX(t."shortName"), CURRENT_TIMESTAMP
FROM "Team" t JOIN "Season" s ON s."id" = t."seasonId"
GROUP BY s."tournamentId", t."name";

UPDATE "Team" t SET "franchiseId" = 'franchise_' || md5(s."tournamentId" || '|' || t."name")
FROM "Season" s WHERE s."id" = t."seasonId";

-- Backfill persons for any player that has none (deterministic ids).
INSERT INTO "Person" ("id", "name", "updatedAt")
SELECT 'person_' || p."id", p."name", CURRENT_TIMESTAMP FROM "Player" p WHERE p."personId" IS NULL;
UPDATE "Player" SET "personId" = 'person_' || "id" WHERE "personId" IS NULL;

-- Enforce. (Player.personId turns required, so its FK changes from SET NULL to RESTRICT.)
ALTER TABLE "Player" DROP CONSTRAINT "Player_personId_fkey";
ALTER TABLE "Team" ALTER COLUMN "franchiseId" SET NOT NULL;
ALTER TABLE "Player" ALTER COLUMN "personId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Franchise_tournamentId_name_key" ON "Franchise"("tournamentId", "name");
CREATE INDEX "Franchise_tournamentId_idx" ON "Franchise"("tournamentId");
CREATE UNIQUE INDEX "PersonIdentifier_type_value_key" ON "PersonIdentifier"("type", "value");
CREATE INDEX "PersonIdentifier_personId_idx" ON "PersonIdentifier"("personId");
CREATE INDEX "Team_franchiseId_idx" ON "Team"("franchiseId");
CREATE UNIQUE INDEX "Team_seasonId_franchiseId_key" ON "Team"("seasonId", "franchiseId");
CREATE UNIQUE INDEX "Player_seasonId_personId_key" ON "Player"("seasonId", "personId");
CREATE INDEX "Registration_studentId_idx" ON "Registration"("studentId");

-- AddForeignKey
ALTER TABLE "Franchise" ADD CONSTRAINT "Franchise_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PersonIdentifier" ADD CONSTRAINT "PersonIdentifier_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Team" ADD CONSTRAINT "Team_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES "Franchise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Player" ADD CONSTRAINT "Player_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
