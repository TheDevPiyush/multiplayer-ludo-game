-- CreateEnum
CREATE TYPE "EntitlementSource" AS ENUM ('COINS', 'PLAY', 'APPSTORE', 'REWARD', 'ADMIN');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "boardTheme" TEXT,
ADD COLUMN     "diceSkin" TEXT,
ADD COLUMN     "pawnSkin" TEXT;

-- CreateTable
CREATE TABLE "Entitlement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "source" "EntitlementSource" NOT NULL,
    "externalId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Entitlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Entitlement_externalId_key" ON "Entitlement"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Entitlement_userId_itemId_key" ON "Entitlement"("userId", "itemId");

-- AddForeignKey
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Supabase exposes public tables through its Data API; only the server (as the table owner) reads this.
ALTER TABLE "Entitlement" ENABLE ROW LEVEL SECURITY;
