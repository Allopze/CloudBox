-- CreateTable
CREATE TABLE "wopi_locks" (
    "id" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "lockId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "wopi_locks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wopi_locks_fileId_key" ON "wopi_locks"("fileId");

-- CreateIndex
CREATE INDEX "wopi_locks_fileId_idx" ON "wopi_locks"("fileId");

-- CreateIndex
CREATE INDEX "wopi_locks_expiresAt_idx" ON "wopi_locks"("expiresAt");

-- AddForeignKey
ALTER TABLE "wopi_locks" ADD CONSTRAINT "wopi_locks_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
