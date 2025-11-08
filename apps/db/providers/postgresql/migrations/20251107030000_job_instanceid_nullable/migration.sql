-- Make Job.instanceId nullable to match Prisma model
ALTER TABLE "Job" ALTER COLUMN "instanceId" DROP NOT NULL;