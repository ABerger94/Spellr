-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "Game_status_isPublic_idx" ON "Game"("status", "isPublic");
