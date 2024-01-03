/*
  Warnings:

  - You are about to drop the `Team` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Team";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "Project" (
    "PID" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_members" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,
    CONSTRAINT "_members_A_fkey" FOREIGN KEY ("A") REFERENCES "Project" ("PID") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_members_B_fkey" FOREIGN KEY ("B") REFERENCES "User" ("ID") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Hash" (
    "HID" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "projectId" INTEGER,
    "hash" TEXT NOT NULL,
    "hashType" TEXT NOT NULL,
    CONSTRAINT "Hash_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("ID") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Hash_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("PID") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Hash" ("HID", "hash", "hashType", "userId") SELECT "HID", "hash", "hashType", "userId" FROM "Hash";
DROP TABLE "Hash";
ALTER TABLE "new_Hash" RENAME TO "Hash";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;

-- CreateIndex
CREATE UNIQUE INDEX "_members_AB_unique" ON "_members"("A", "B");

-- CreateIndex
CREATE INDEX "_members_B_index" ON "_members"("B");
