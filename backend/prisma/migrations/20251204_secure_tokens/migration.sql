-- Security: Migrate RefreshToken to use hashed tokens
-- This migration requires manual intervention for existing tokens

-- Step 1: Create new table with secure schema
CREATE TABLE "refresh_tokens_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "familyId" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "refresh_tokens_new_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Step 2: Create unique indexes
CREATE UNIQUE INDEX "refresh_tokens_new_tokenHash_key" ON "refresh_tokens_new"("tokenHash");
CREATE UNIQUE INDEX "refresh_tokens_new_jti_key" ON "refresh_tokens_new"("jti");
CREATE INDEX "refresh_tokens_new_userId_idx" ON "refresh_tokens_new"("userId");
CREATE INDEX "refresh_tokens_new_familyId_idx" ON "refresh_tokens_new"("familyId");

-- Step 3: Drop old table (WARNING: This invalidates all existing refresh tokens)
-- Users will need to log in again after this migration
DROP TABLE IF EXISTS "refresh_tokens";

-- Step 4: Rename new table
ALTER TABLE "refresh_tokens_new" RENAME TO "refresh_tokens";

-- Step 5: Create signed_urls table for secure file access
CREATE TABLE "signed_urls" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "signed_urls_token_key" ON "signed_urls"("token");
CREATE INDEX "signed_urls_token_idx" ON "signed_urls"("token");
CREATE INDEX "signed_urls_expiresAt_idx" ON "signed_urls"("expiresAt");
