-- AlterTable
ALTER TABLE "AuctionSettings" ADD COLUMN     "posterKey" TEXT,
ADD COLUMN     "stageMode" TEXT NOT NULL DEFAULT 'LIVE';

