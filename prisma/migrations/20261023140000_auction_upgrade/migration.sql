-- Phase 2d: auction upgrade — HELD lots and live bid tracking.
ALTER TYPE "AuctionLotStatus" ADD VALUE 'HELD';

ALTER TABLE "AuctionLot"
  ADD COLUMN "currentBid" INTEGER,
  ADD COLUMN "currentBidTeamId" TEXT,
  ADD COLUMN "heldAt" TIMESTAMP(3);
