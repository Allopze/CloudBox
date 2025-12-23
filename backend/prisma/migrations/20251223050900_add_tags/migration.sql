-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_tags" (
    "id" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "tagId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_tags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tags_userId_idx" ON "tags"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_userId_key" ON "tags"("name", "userId");

-- CreateIndex
CREATE INDEX "file_tags_fileId_idx" ON "file_tags"("fileId");

-- CreateIndex
CREATE INDEX "file_tags_tagId_idx" ON "file_tags"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "file_tags_fileId_tagId_key" ON "file_tags"("fileId", "tagId");

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_tags" ADD CONSTRAINT "file_tags_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_tags" ADD CONSTRAINT "file_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
