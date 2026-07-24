-- CreateEnum
CREATE TYPE "Position" AS ENUM ('GK', 'DEF', 'MID', 'FWD');

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "position" "Position";
