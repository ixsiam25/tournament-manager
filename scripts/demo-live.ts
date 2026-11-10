// Puts the demo projector on a live lot with a bid on it (dev branch only).
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
(async () => {
  const { prisma } = await import("../lib/db");
  const s = await prisma.season.findUniqueOrThrow({ where: { slug: "demo-x" } });
  await prisma.auctionSettings.update({ where: { seasonId: s.id }, data: { stageMode: "LIVE" } });
  const lot = await prisma.auctionLot.findFirstOrThrow({ where: { seasonId: s.id, status: "QUEUED" }, orderBy: { order: "asc" } });
  await prisma.auctionLot.update({ where: { id: lot.id }, data: { status: "IN_PROGRESS", currentBid: 120 } });
  console.log("live lot set");
  process.exit(0);
})();
