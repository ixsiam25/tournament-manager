-- CreateTable
CREATE TABLE "ChampionPrediction" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "voterName" TEXT,
    "voterSemester" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChampionPrediction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChampionPrediction_voterId_key" ON "ChampionPrediction"("voterId");

-- AddForeignKey
ALTER TABLE "ChampionPrediction" ADD CONSTRAINT "ChampionPrediction_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
