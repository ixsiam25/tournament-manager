-- CreateEnum
CREATE TYPE "TeamFormation" AS ENUM ('BATCH', 'AUCTION');

-- CreateEnum
CREATE TYPE "SeasonStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MediaTag" AS ENUM ('TROPHY', 'ACTION', 'TEAM', 'CROWD');

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "personId" TEXT;

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "SeasonStatus" NOT NULL DEFAULT 'ACTIVE',
    "teamFormation" "TeamFormation" NOT NULL DEFAULT 'BATCH',
    "startsOn" TIMESTAMP(3),
    "endsOn" TIMESTAMP(3),
    "recap" TEXT,
    "heroMediaId" TEXT,
    "championTeamName" TEXT,
    "runnerUpTeamName" TEXT,
    "topScorerName" TEXT,
    "resultsJson" JSONB,
    "targetTeamCount" INTEGER,
    "squadSizeMin" INTEGER,
    "squadSizeMax" INTEGER,
    "registrationOpen" BOOLEAN NOT NULL DEFAULT false,
    "registrationSelfServeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "registrationExcelImportEnabled" BOOLEAN NOT NULL DEFAULT false,
    "formatConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "credit" TEXT,
    "tag" "MediaTag" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isHero" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Season_number_key" ON "Season"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Season_slug_key" ON "Season"("slug");

-- CreateIndex
CREATE INDEX "MediaAsset_seasonId_idx" ON "MediaAsset"("seasonId");

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
