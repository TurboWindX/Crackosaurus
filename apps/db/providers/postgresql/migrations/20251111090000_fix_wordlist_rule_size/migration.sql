-- Alter Wordlist.size and Rule.size to BIGINT to support large files
ALTER TABLE "Wordlist" ALTER COLUMN "size" TYPE BIGINT USING "size"::bigint;

ALTER TABLE "Rule" ALTER COLUMN "size" TYPE BIGINT USING "size"::bigint;
