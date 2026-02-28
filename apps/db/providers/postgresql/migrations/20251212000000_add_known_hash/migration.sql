-- CreateTable
CREATE TABLE "KnownHash" (
    "id" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "hashType" INTEGER NOT NULL,
    "plaintext" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnownHash_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnownHash_hash_hashType_idx" ON "KnownHash"("hash", "hashType");

-- CreateIndex
CREATE UNIQUE INDEX "KnownHash_hash_hashType_key" ON "KnownHash"("hash", "hashType");
