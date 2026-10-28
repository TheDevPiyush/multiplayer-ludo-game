-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastReminderAt" TIMESTAMP(3),
ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "pushTokens" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Reminder runs page through users with a recent visit.
CREATE INDEX "User_lastSeenAt_idx" ON "User"("lastSeenAt");
