-- CreateTable
CREATE TABLE "JerseyVote" (
    "id" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "like" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JerseyVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JerseyVote_voterId_key" ON "JerseyVote"("voterId");
