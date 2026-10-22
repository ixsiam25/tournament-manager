-- Phase 2b: richer applications (config, edit link, photo framing), extra
-- team-formation strategies, and releasing a player without losing history.

-- AlterEnum
ALTER TYPE "TeamFormation" ADD VALUE 'MANUAL';
ALTER TYPE "TeamFormation" ADD VALUE 'DRAFT';
ALTER TYPE "TeamFormation" ADD VALUE 'BALANCED_RANDOM';

-- CreateEnum
CREATE TYPE "PlayerStatus" AS ENUM ('ACTIVE', 'RELEASED');

-- AlterTable
ALTER TABLE "Season"
  ADD COLUMN "applicationConfig" JSONB,
  ADD COLUMN "applicationDeadline" TIMESTAMP(3),
  ADD COLUMN "formationState" JSONB;

ALTER TABLE "Registration"
  ADD COLUMN "answers" JSONB,
  ADD COLUMN "editTokenHash" TEXT,
  ADD COLUMN "applicantEditedAt" TIMESTAMP(3),
  ADD COLUMN "photoZoom" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "photoX" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "photoY" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Player"
  ADD COLUMN "status" "PlayerStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "releasedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Registration_editTokenHash_key" ON "Registration"("editTokenHash");
