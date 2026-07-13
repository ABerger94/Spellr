-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Game_status_lastActivityAt_idx" ON "Game"("status", "lastActivityAt");
