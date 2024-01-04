/*
  Warnings:

  - A unique constraint covering the columns `[hash]` on the table `Hash` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Hash_hash_key" ON "Hash"("hash");
