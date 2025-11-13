-- Migration to add metadata-only Rule model and nullable Job.ruleId FK

-- Create metadata-only Rule table (content is stored on EFS, not in the DB)
CREATE TABLE IF NOT EXISTS "Rule" (
    "RID" TEXT NOT NULL,
    "name" TEXT,
    "size" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Rule_pkey" PRIMARY KEY ("RID")
);

-- Add ruleId column to Job to reference a single optional Rule (ON DELETE SET NULL)
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "ruleId" TEXT;
ALTER TABLE "Job" ADD CONSTRAINT "Job_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("RID") ON DELETE SET NULL ON UPDATE CASCADE;