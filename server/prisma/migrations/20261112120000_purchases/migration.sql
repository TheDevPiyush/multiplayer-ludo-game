-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "productId" TEXT NOT NULL,
    "rcId" TEXT NOT NULL,
    "storeTransactionId" TEXT,
    "store" TEXT NOT NULL,
    "sandbox" BOOLEAN NOT NULL DEFAULT false,
    "purchasedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_rcId_key" ON "Purchase"("rcId");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_storeTransactionId_key" ON "Purchase"("storeTransactionId");

-- CreateIndex
CREATE INDEX "Purchase_userId_idx" ON "Purchase"("userId");

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Supabase exposes public tables through its Data API; only the server (as the table owner) reads this.
ALTER TABLE "Purchase" ENABLE ROW LEVEL SECURITY;
