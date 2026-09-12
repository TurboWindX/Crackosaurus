-- Cluster-wide runtime settings, editable by a root admin from the settings
-- page. Generic key/value store (String values parsed per key) so new
-- operational toggles can be added without a migration. First key is
-- `maxInstanceLifeHours`, read by the server reaper each poll cycle.

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);
