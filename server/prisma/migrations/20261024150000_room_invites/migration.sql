-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ROOM_INVITE';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "gameCode" TEXT;

-- CreateIndex
CREATE INDEX "Notification_userId_actorId_gameCode_idx" ON "Notification"("userId", "actorId", "gameCode");
