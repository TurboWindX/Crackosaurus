/*
  Warnings:

  - The primary key for the `Instance` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Job` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `User` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Hash` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Project` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Instance" (
    "IID" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "type" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Instance" ("IID", "createdAt", "provider", "status", "tag", "type", "updatedAt") SELECT "IID", "createdAt", "provider", "status", "tag", "type", "updatedAt" FROM "Instance";
DROP TABLE "Instance";
ALTER TABLE "new_Instance" RENAME TO "Instance";
CREATE TABLE "new_Job" (
    "JID" TEXT NOT NULL PRIMARY KEY,
    "instanceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Job_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance" ("IID") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Job" ("JID", "createdAt", "instanceId", "status", "updatedAt") SELECT "JID", "createdAt", "instanceId", "status", "updatedAt" FROM "Job";
DROP TABLE "Job";
ALTER TABLE "new_Job" RENAME TO "Job";
CREATE TABLE "new_User" (
    "ID" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "permissions" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("ID", "createdAt", "password", "permissions", "updatedAt", "username") SELECT "ID", "createdAt", "password", "permissions", "updatedAt", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE TABLE "new_Hash" (
    "HID" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "jobId" TEXT,
    "hash" TEXT NOT NULL,
    "hashType" TEXT NOT NULL,
    "cracked" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Hash_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("PID") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Hash_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("JID") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Hash" ("HID", "cracked", "createdAt", "hash", "hashType", "jobId", "projectId", "updatedAt") SELECT "HID", "cracked", "createdAt", "hash", "hashType", "jobId", "projectId", "updatedAt" FROM "Hash";
DROP TABLE "Hash";
ALTER TABLE "new_Hash" RENAME TO "Hash";
CREATE TABLE "new__ProjectToUser" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_ProjectToUser_A_fkey" FOREIGN KEY ("A") REFERENCES "Project" ("PID") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ProjectToUser_B_fkey" FOREIGN KEY ("B") REFERENCES "User" ("ID") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new__ProjectToUser" ("A", "B") SELECT "A", "B" FROM "_ProjectToUser";
DROP TABLE "_ProjectToUser";
ALTER TABLE "new__ProjectToUser" RENAME TO "_ProjectToUser";
CREATE UNIQUE INDEX "_ProjectToUser_AB_unique" ON "_ProjectToUser"("A", "B");
CREATE INDEX "_ProjectToUser_B_index" ON "_ProjectToUser"("B");
CREATE TABLE "new_Project" (
    "PID" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Project" ("PID", "createdAt", "name", "updatedAt") SELECT "PID", "createdAt", "name", "updatedAt" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE UNIQUE INDEX "Project_name_key" ON "Project"("name");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
