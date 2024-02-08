-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Hash" (
    "HID" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT,
    "jobId" TEXT,
    "hash" TEXT NOT NULL,
    "hashType" TEXT NOT NULL,
    "cracked" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Hash_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("PID") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Hash_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("JID") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Hash" ("HID", "cracked", "createdAt", "hash", "hashType", "jobId", "projectId", "updatedAt") SELECT "HID", "cracked", "createdAt", "hash", "hashType", "jobId", "projectId", "updatedAt" FROM "Hash";
DROP TABLE "Hash";
ALTER TABLE "new_Hash" RENAME TO "Hash";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
