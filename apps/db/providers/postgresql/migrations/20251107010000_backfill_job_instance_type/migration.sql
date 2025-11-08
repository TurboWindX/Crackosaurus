-- Backfill Job.instanceType from Instance.type for already-assigned jobs
-- This is safe and idempotent (only updates NULL instanceType values)
UPDATE "Job" j
SET "instanceType" = i."type"
FROM "Instance" i
WHERE j."instanceId" = i."IID" AND (j."instanceType" IS NULL OR j."instanceType" = '');
