-- AlterTable: add source column to track how a hash was resolved
ALTER TABLE "Hash" ADD COLUMN "source" TEXT;
