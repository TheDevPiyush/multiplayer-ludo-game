-- AlterTable
ALTER TABLE "GameRoom" ADD COLUMN     "gameState" JSONB,
ADD COLUMN     "stateVersion" INTEGER NOT NULL DEFAULT 0;

-- DropIndex
DROP INDEX "GamePlayer_userId_idx";

-- CreateIndex
CREATE INDEX "GamePlayer_userId_joinedAt_idx" ON "GamePlayer"("userId", "joinedAt");

-- CreateIndex
CREATE INDEX "GameRoom_status_createdAt_idx" ON "GameRoom"("status", "createdAt");
