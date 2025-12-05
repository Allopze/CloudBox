-- Migration: Initial PostgreSQL Schema
-- This migration creates all tables with PostgreSQL-specific types
-- Run with: npx prisma migrate deploy

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
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
    "resetTokenExpiry" TIMESTAMPTZ,
    "verifyToken" TEXT,
    "verifyTokenExpiry" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");
CREATE INDEX "users_email_idx" ON "users"("email");
CREATE INDEX "users_createdAt_idx" ON "users"("createdAt");

-- Refresh Tokens table
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tokenHash" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "familyId" UUID,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "revokedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");
CREATE UNIQUE INDEX "refresh_tokens_jti_key" ON "refresh_tokens"("jti");
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");
CREATE INDEX "refresh_tokens_familyId_idx" ON "refresh_tokens"("familyId");
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");

-- Signed URLs table
CREATE TABLE "signed_urls" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "token" TEXT NOT NULL,
    "fileId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signed_urls_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "signed_urls_token_key" ON "signed_urls"("token");
CREATE INDEX "signed_urls_token_idx" ON "signed_urls"("token");
CREATE INDEX "signed_urls_expiresAt_idx" ON "signed_urls"("expiresAt");

-- Folders table
CREATE TABLE "folders" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" TEXT NOT NULL,
    "color" TEXT,
    "category" TEXT,
    "parentId" UUID,
    "userId" UUID NOT NULL,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "isTrash" BOOLEAN NOT NULL DEFAULT false,
    "trashedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "size" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "folders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "folders_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "folders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "folders_name_parentId_userId_key" ON "folders"("name", "parentId", "userId");
CREATE INDEX "folders_userId_idx" ON "folders"("userId");
CREATE INDEX "folders_parentId_idx" ON "folders"("parentId");
CREATE INDEX "folders_isTrash_idx" ON "folders"("isTrash");

-- Files table
CREATE TABLE "files" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "path" TEXT NOT NULL,
    "thumbnailPath" TEXT,
    "folderId" UUID,
    "userId" UUID NOT NULL,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "isTrash" BOOLEAN NOT NULL DEFAULT false,
    "trashedAt" TIMESTAMPTZ,
    "metadata" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "transcodedPath" TEXT,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "files_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "files_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "files_userId_idx" ON "files"("userId");
CREATE INDEX "files_folderId_idx" ON "files"("folderId");
CREATE INDEX "files_isTrash_idx" ON "files"("isTrash");
CREATE INDEX "files_mimeType_idx" ON "files"("mimeType");
CREATE INDEX "files_createdAt_idx" ON "files"("createdAt");

-- Transcoding Jobs table
CREATE TABLE "transcoding_jobs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "fileId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "transcoding_jobs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "transcoding_jobs_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "transcoding_jobs_fileId_key" ON "transcoding_jobs"("fileId");
CREATE INDEX "transcoding_jobs_status_idx" ON "transcoding_jobs"("status");

-- File Chunks table
CREATE TABLE "file_chunks" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "fileId" UUID,
    "uploadId" UUID NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "totalChunks" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_chunks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "file_chunks_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "file_chunks_uploadId_chunkIndex_key" ON "file_chunks"("uploadId", "chunkIndex");
CREATE INDEX "file_chunks_uploadId_idx" ON "file_chunks"("uploadId");

-- Shares table
CREATE TABLE "shares" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "type" TEXT NOT NULL DEFAULT 'PRIVATE',
    "fileId" UUID,
    "folderId" UUID,
    "ownerId" UUID NOT NULL,
    "publicToken" TEXT,
    "password" TEXT,
    "expiresAt" TIMESTAMPTZ,
    "downloadLimit" INTEGER,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "allowDownload" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "shares_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shares_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "shares_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "shares_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "shares_publicToken_key" ON "shares"("publicToken");
CREATE INDEX "shares_ownerId_idx" ON "shares"("ownerId");
CREATE INDEX "shares_publicToken_idx" ON "shares"("publicToken");
CREATE INDEX "shares_type_idx" ON "shares"("type");

-- Share Collaborators table
CREATE TABLE "share_collaborators" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "shareId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "permission" TEXT NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "share_collaborators_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "share_collaborators_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "shares"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "share_collaborators_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "share_collaborators_shareId_userId_key" ON "share_collaborators"("shareId", "userId");
CREATE INDEX "share_collaborators_userId_idx" ON "share_collaborators"("userId");

-- Albums table
CREATE TABLE "albums" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" TEXT NOT NULL,
    "color" TEXT,
    "userId" UUID NOT NULL,
    "coverPath" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "albums_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "albums_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "albums_name_userId_key" ON "albums"("name", "userId");
CREATE INDEX "albums_userId_idx" ON "albums"("userId");

-- Album Files table
CREATE TABLE "album_files" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "albumId" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "album_files_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "album_files_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "albums"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "album_files_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "album_files_albumId_fileId_key" ON "album_files"("albumId", "fileId");
CREATE INDEX "album_files_albumId_idx" ON "album_files"("albumId");

-- Activities table
CREATE TABLE "activities" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "type" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "fileId" UUID,
    "folderId" UUID,
    "details" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "activities_userId_idx" ON "activities"("userId");
CREATE INDEX "activities_type_idx" ON "activities"("type");
CREATE INDEX "activities_createdAt_idx" ON "activities"("createdAt");

-- Compression Jobs table
CREATE TABLE "compression_jobs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "inputPaths" TEXT NOT NULL,
    "outputPath" TEXT,
    "format" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "compression_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "compression_jobs_userId_idx" ON "compression_jobs"("userId");
CREATE INDEX "compression_jobs_status_idx" ON "compression_jobs"("status");

-- Settings table
CREATE TABLE "settings" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");

-- Email Templates table
CREATE TABLE "email_templates" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_templates_name_key" ON "email_templates"("name");

-- Email Template Variables table
CREATE TABLE "email_template_variables" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "templateId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "defaultValue" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "email_template_variables_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "email_template_variables_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "email_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "email_template_variables_templateId_name_key" ON "email_template_variables"("templateId", "name");
CREATE INDEX "email_template_variables_templateId_idx" ON "email_template_variables"("templateId");

-- Login Attempts table
CREATE TABLE "login_attempts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "email" TEXT NOT NULL,
    "ipAddress" INET NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "login_attempts_email_createdAt_idx" ON "login_attempts"("email", "createdAt");
CREATE INDEX "login_attempts_ipAddress_createdAt_idx" ON "login_attempts"("ipAddress", "createdAt");

-- Storage Requests table
CREATE TABLE "storage_requests" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "userId" UUID NOT NULL,
    "requestedQuota" BIGINT NOT NULL,
    "currentQuota" BIGINT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "adminResponse" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "storage_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "storage_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "storage_requests_userId_idx" ON "storage_requests"("userId");
CREATE INDEX "storage_requests_status_idx" ON "storage_requests"("status");

-- Legal Pages table
CREATE TABLE "legal_pages" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "legal_pages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "legal_pages_slug_key" ON "legal_pages"("slug");
