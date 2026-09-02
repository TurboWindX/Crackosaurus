-- Add TOTP multi-factor auth to User and a one-time recovery-code table.
-- mfaEnabled gates the second factor at login; totpSecret stores the base32
-- secret encrypted at rest (AES-256-GCM, key from BACKEND_SECRET).
ALTER TABLE "User" ADD COLUMN "mfaEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "totpSecret" TEXT;
-- Last accepted TOTP time-step; login rejects codes with step <= this value so
-- a code cannot be replayed within its validity window (RFC 6238 §5.2).
ALTER TABLE "User" ADD COLUMN "totpLastStep" INTEGER;

-- CreateTable
CREATE TABLE "UserRecoveryCode" (
    "RCID" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRecoveryCode_pkey" PRIMARY KEY ("RCID")
);

-- CreateIndex
CREATE INDEX "UserRecoveryCode_userId_idx" ON "UserRecoveryCode"("userId");

-- AddForeignKey
ALTER TABLE "UserRecoveryCode" ADD CONSTRAINT "UserRecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("ID") ON DELETE CASCADE ON UPDATE CASCADE;
