-- Add parentJobId to Job for per-sibling cascade successor tracking.
-- advanceCascades previously keyed existingNext on (cascadeId, cascadeStepIndex),
-- so the first completed sibling blocked all other siblings from advancing their
-- own not-found hashes. Keying on parentJobId instead gives each sibling an
-- independent successor slot.
ALTER TABLE "Job" ADD COLUMN "parentJobId" TEXT;
ALTER TABLE "Job" ADD CONSTRAINT "Job_parentJobId_fkey"
  FOREIGN KEY ("parentJobId") REFERENCES "Job"("JID")
  ON DELETE SET NULL ON UPDATE CASCADE;
