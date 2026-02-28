-- AlterTable: Add attack mode, mask, and cascade fields to Job
ALTER TABLE "Job" ADD COLUMN "attackMode" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Job" ADD COLUMN "mask" TEXT;
ALTER TABLE "Job" ADD COLUMN "cascadeId" TEXT;
ALTER TABLE "Job" ADD COLUMN "cascadeStepIndex" INTEGER;

-- CreateTable
CREATE TABLE "Cascade" (
    "CID" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cascade_pkey" PRIMARY KEY ("CID")
);

-- CreateTable
CREATE TABLE "CascadeStep" (
    "CSID" TEXT NOT NULL,
    "cascadeId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "attackMode" INTEGER NOT NULL DEFAULT 0,
    "wordlistId" TEXT,
    "ruleId" TEXT,
    "mask" TEXT,
    "instanceType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CascadeStep_pkey" PRIMARY KEY ("CSID")
);

-- CreateIndex
CREATE UNIQUE INDEX "CascadeStep_cascadeId_order_key" ON "CascadeStep"("cascadeId", "order");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_cascadeId_fkey" FOREIGN KEY ("cascadeId") REFERENCES "Cascade"("CID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CascadeStep" ADD CONSTRAINT "CascadeStep_cascadeId_fkey" FOREIGN KEY ("cascadeId") REFERENCES "Cascade"("CID") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CascadeStep" ADD CONSTRAINT "CascadeStep_wordlistId_fkey" FOREIGN KEY ("wordlistId") REFERENCES "Wordlist"("WID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CascadeStep" ADD CONSTRAINT "CascadeStep_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("RID") ON DELETE SET NULL ON UPDATE CASCADE;
