-- AlterTable
ALTER TABLE "GameRoom" ADD COLUMN "moveLog" JSONB;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "usernameChangedAt" TIMESTAMP(3);
