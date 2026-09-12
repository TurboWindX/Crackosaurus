-- Online brute-force throttle for login. failedLoginAttempts counts consecutive
-- failed password/second-factor attempts; on reaching the threshold the account
-- is locked until lockedUntil. Both reset to 0/null on a fully successful login.
-- A locked account returns the same generic error as a wrong password so the
-- lockout state cannot be used to enumerate usernames.
ALTER TABLE "User" ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "lockedUntil" TIMESTAMP(3);
