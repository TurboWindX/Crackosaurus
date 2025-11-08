-- Migration to add Rule model and Job.rules many-to-many relation

-- Create Rule table
CREATE TABLE IF NOT EXISTS "Rule" (
    "RID" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Rule_pkey" PRIMARY KEY ("RID")
);

-- Create join table for Job <-> Rule many-to-many relation
CREATE TABLE IF NOT EXISTS "_JobToRule" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- Add indexes for join table
CREATE UNIQUE INDEX IF NOT EXISTS "_JobToRule_AB_unique" ON "_JobToRule"("A", "B");
CREATE INDEX IF NOT EXISTS "_JobToRule_B_index" ON "_JobToRule"("B");

-- Add foreign keys for join table
ALTER TABLE "_JobToRule" ADD CONSTRAINT IF NOT EXISTS "_JobToRule_A_fkey" FOREIGN KEY ("A") REFERENCES "Job"("JID") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_JobToRule" ADD CONSTRAINT IF NOT EXISTS "_JobToRule_B_fkey" FOREIGN KEY ("B") REFERENCES "Rule"("RID") ON DELETE CASCADE ON UPDATE CASCADE;