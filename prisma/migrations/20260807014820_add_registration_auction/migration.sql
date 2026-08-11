-- CreateEnum
CREATE TYPE "RegistrationSource" AS ENUM ('SELF_SERVE', 'ADMIN_MANUAL', 'EXCEL_IMPORT');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AuctionLotStatus" AS ENUM ('QUEUED', 'IN_PROGRESS', 'SOLD', 'UNSOLD');

-- AlterTable
ALTER TABLE "Player" ALTER COLUMN "teamId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Registration" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "personId" TEXT,
    "name" TEXT NOT NULL,
    "affiliation" TEXT NOT NULL,
    "position" "Position",
    "contact" TEXT NOT NULL,
    "photoKey" TEXT,
    "source" "RegistrationSource" NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "reviewedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Registration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuctionSettings" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "budgetPerTeam" INTEGER NOT NULL,
    "basePrice" INTEGER NOT NULL,
    "bidIncrement" INTEGER NOT NULL,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuctionSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuctionLot" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "status" "AuctionLotStatus" NOT NULL DEFAULT 'QUEUED',
    "soldToTeamId" TEXT,
    "soldPrice" INTEGER,
    "soldAt" TIMESTAMP(3),
    "soldByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuctionLot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Registration_seasonId_idx" ON "Registration"("seasonId");

-- CreateIndex
CREATE INDEX "Registration_status_idx" ON "Registration"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AuctionSettings_seasonId_key" ON "AuctionSettings"("seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "AuctionLot_playerId_key" ON "AuctionLot"("playerId");

-- CreateIndex
CREATE INDEX "AuctionLot_seasonId_idx" ON "AuctionLot"("seasonId");

-- CreateIndex
CREATE INDEX "AuctionLot_status_idx" ON "AuctionLot"("status");

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionSettings" ADD CONSTRAINT "AuctionSettings_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionLot" ADD CONSTRAINT "AuctionLot_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionLot" ADD CONSTRAINT "AuctionLot_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionLot" ADD CONSTRAINT "AuctionLot_soldToTeamId_fkey" FOREIGN KEY ("soldToTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionLot" ADD CONSTRAINT "AuctionLot_soldByUserId_fkey" FOREIGN KEY ("soldByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
