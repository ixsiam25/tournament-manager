-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "penaltyAwayScore" INTEGER,
ADD COLUMN     "penaltyHomeScore" INTEGER,
ADD COLUMN     "winnerTeamId" TEXT;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_winnerTeamId_fkey" FOREIGN KEY ("winnerTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
