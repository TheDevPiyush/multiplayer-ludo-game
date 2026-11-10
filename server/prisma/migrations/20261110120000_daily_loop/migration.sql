-- AlterTable
ALTER TABLE "User" ADD COLUMN     "coins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "dailyClaimDay" TEXT,
ADD COLUMN     "dailyStreak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "xp" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CoinLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoinLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissionProgress" (
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "claimedAt" TIMESTAMP(3),

    CONSTRAINT "MissionProgress_pkey" PRIMARY KEY ("userId","day","missionId")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoinLedger_key_key" ON "CoinLedger"("key");

-- CreateIndex
CREATE INDEX "CoinLedger_userId_reason_day_idx" ON "CoinLedger"("userId", "reason", "day");

-- CreateIndex
CREATE INDEX "CoinLedger_userId_createdAt_idx" ON "CoinLedger"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "CoinLedger" ADD CONSTRAINT "CoinLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionProgress" ADD CONSTRAINT "MissionProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Only the game server reads and writes these (as owner, which bypasses RLS); Supabase's public API gets nothing.
ALTER TABLE "CoinLedger" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MissionProgress" ENABLE ROW LEVEL SECURITY;
