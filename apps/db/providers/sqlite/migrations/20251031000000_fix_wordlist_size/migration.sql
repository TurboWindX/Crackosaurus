-- AlterTable: Change Wordlist size column from INTEGER to BIGINT
-- SQLite doesn't support ALTER COLUMN directly, so we need to recreate the table

-- Step 1: Create new table with correct schema
CREATE TABLE "Wordlist_new" (
    "WID" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "size" BIGINT NOT NULL,
    "checksum" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Step 2: Copy data from old table to new table
INSERT INTO "Wordlist_new" ("WID", "name", "size", "checksum", "createdAt", "updatedAt")
SELECT "WID", "name", "size", "checksum", "createdAt", "updatedAt" FROM "Wordlist";

-- Step 3: Drop old table
DROP TABLE "Wordlist";

-- Step 4: Rename new table to original name
ALTER TABLE "Wordlist_new" RENAME TO "Wordlist";
