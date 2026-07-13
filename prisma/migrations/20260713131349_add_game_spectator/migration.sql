-- CreateTable
CREATE TABLE "GameSpectator" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameSpectator_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GameSpectator_userId_idx" ON "GameSpectator"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GameSpectator_gameId_userId_key" ON "GameSpectator"("gameId", "userId");

-- AddForeignKey
ALTER TABLE "GameSpectator" ADD CONSTRAINT "GameSpectator_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameSpectator" ADD CONSTRAINT "GameSpectator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
