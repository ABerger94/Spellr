-- AlterTable
ALTER TABLE "GameEvent" ADD COLUMN     "visibleToSeats" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
