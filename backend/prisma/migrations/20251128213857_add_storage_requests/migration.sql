-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "avatar" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "googleId" TEXT,
    "storageQuota" BIGINT NOT NULL DEFAULT 5368709120,
    "storageUsed" BIGINT NOT NULL DEFAULT 0,
    "tempStorage" BIGINT NOT NULL DEFAULT 0,
    "maxFileSize" BIGINT NOT NULL DEFAULT 104857600,
    "resetToken" TEXT,
    "resetTokenExpiry" DATETIME,
    "verifyToken" TEXT,
    "verifyTokenExpiry" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "folders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "category" TEXT,
    "parentId" TEXT,
    "userId" TEXT NOT NULL,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "isTrash" BOOLEAN NOT NULL DEFAULT false,
    "trashedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "size" BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT "folders_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "folders" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "folders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "files" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "path" TEXT NOT NULL,
    "thumbnailPath" TEXT,
    "folderId" TEXT,
    "userId" TEXT NOT NULL,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "isTrash" BOOLEAN NOT NULL DEFAULT false,
    "trashedAt" DATETIME,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "transcodedPath" TEXT,
    CONSTRAINT "files_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "files_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "transcoding_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "transcoding_jobs_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "file_chunks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileId" TEXT,
    "uploadId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "totalChunks" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "file_chunks_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "shares" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL DEFAULT 'PRIVATE',
    "fileId" TEXT,
    "folderId" TEXT,
    "ownerId" TEXT NOT NULL,
    "publicToken" TEXT,
    "password" TEXT,
    "expiresAt" DATETIME,
    "downloadLimit" INTEGER,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "allowDownload" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "shares_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "shares_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "shares_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "share_collaborators" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shareId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permission" TEXT NOT NULL DEFAULT 'VIEWER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "share_collaborators_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "shares" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "share_collaborators_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "albums" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "coverPath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "albums_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "album_files" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "albumId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "album_files_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "albums" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "album_files_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileId" TEXT,
    "folderId" TEXT,
    "details" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "compression_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "inputPaths" TEXT NOT NULL,
    "outputPath" TEXT,
    "format" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "email_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "storage_requests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "requestedQuota" BIGINT NOT NULL,
    "currentQuota" BIGINT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "adminResponse" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "storage_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "folders_name_parentId_userId_key" ON "folders"("name", "parentId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "transcoding_jobs_fileId_key" ON "transcoding_jobs"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "file_chunks_uploadId_chunkIndex_key" ON "file_chunks"("uploadId", "chunkIndex");

-- CreateIndex
CREATE UNIQUE INDEX "shares_publicToken_key" ON "shares"("publicToken");

-- CreateIndex
CREATE UNIQUE INDEX "share_collaborators_shareId_userId_key" ON "share_collaborators"("shareId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "albums_name_userId_key" ON "albums"("name", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "album_files_albumId_fileId_key" ON "album_files"("albumId", "fileId");

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");

-- CreateIndex
CREATE UNIQUE INDEX "email_templates_name_key" ON "email_templates"("name");

-- CreateIndex
CREATE INDEX "login_attempts_email_createdAt_idx" ON "login_attempts"("email", "createdAt");

-- CreateIndex
CREATE INDEX "login_attempts_ipAddress_createdAt_idx" ON "login_attempts"("ipAddress", "createdAt");
