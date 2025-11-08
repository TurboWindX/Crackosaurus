-- Add missing Job columns introduced since initial migration
-- Safe: adds nullable columns and constraints where appropriate

ALTER TABLE "Job"
ADD COLUMN IF NOT EXISTS "instanceType" TEXT;

ALTER TABLE "Job"
ADD COLUMN IF NOT EXISTS "approvalStatus" TEXT DEFAULT 'PENDING';

ALTER TABLE "Job"
ADD COLUMN IF NOT EXISTS "submittedById" TEXT;

ALTER TABLE "Job"
ADD COLUMN IF NOT EXISTS "approvedById" TEXT;

ALTER TABLE "Job"
ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);

ALTER TABLE "Job"
ADD COLUMN IF NOT EXISTS "rejectionNote" TEXT;

-- Add foreign key constraints for submittedById and approvedById if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Job_submittedById_fkey'
  ) THEN
    ALTER TABLE "Job" ADD CONSTRAINT "Job_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("ID") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Job_approvedById_fkey'
  ) THEN
    ALTER TABLE "Job" ADD CONSTRAINT "Job_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("ID") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;
