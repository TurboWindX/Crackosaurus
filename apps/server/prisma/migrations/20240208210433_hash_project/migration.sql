/*
  Warnings:

  - Made the column `projectId` on table `Hash` required. This step will fail if there are existing NULL values in that column.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Hash" (
    "HID" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "jobId" INTEGER,
    "hash" TEXT NOT NULL,
    "hashType" TEXT NOT NULL,
    "cracked" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Hash_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("ID") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Hash_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("PID") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Hash_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("JID") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Hash" ("HID", "cracked", "createdAt", "hash", "hashType", "jobId", "projectId", "updatedAt", "userId") SELECT "HID", "cracked", "createdAt", "hash", "hashType", "jobId", "projectId", "updatedAt", "userId" FROM "Hash";
DROP TABLE "Hash";
ALTER TABLE "new_Hash" RENAME TO "Hash";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
