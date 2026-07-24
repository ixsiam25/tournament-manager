-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MatchEventType" ADD VALUE 'YELLOW_CARD';
ALTER TYPE "MatchEventType" ADD VALUE 'RED_CARD';

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "isCaptain" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "managerName" TEXT;
