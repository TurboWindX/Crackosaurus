-- Add instanceType column to Job table
ALTER TABLE "Job"
ADD COLUMN IF NOT EXISTS "instanceType" TEXT;
