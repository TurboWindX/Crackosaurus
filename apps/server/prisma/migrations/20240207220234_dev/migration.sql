-- CreateTable
CREATE TABLE "Job" (
    "JID" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "provider" TEXT NOT NULL,
    "instance" TEXT,
    "type" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING'
);

-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Hash" (
    "HID" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "projectId" INTEGER,
    "jobId" INTEGER,
    "hash" TEXT NOT NULL,
    "hashType" TEXT NOT NULL,
    "cracked" TEXT,
    CONSTRAINT "Hash_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("ID") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Hash_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("PID") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Hash_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("JID") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Hash" ("HID", "cracked", "hash", "hashType", "projectId", "userId") SELECT "HID", "cracked", "hash", "hashType", "projectId", "userId" FROM "Hash";
DROP TABLE "Hash";
ALTER TABLE "new_Hash" RENAME TO "Hash";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
