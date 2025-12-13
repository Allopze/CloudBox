# CloudBox Database Schema

CloudBox uses PostgreSQL via Prisma (`backend/prisma/schema.prisma`).

## Conventions

- **Primary keys**: UUIDs (`@db.Uuid`)
- **Sizes/quotas**: `BigInt` (bytes)
- **Timestamps**: `timestamptz` (`@db.Timestamptz`)

## Models (by domain)

### Users & Auth

- **`User`**: user profile, role, and storage limits (`storageQuota`, `storageUsed`, `maxFileSize`).
- **`RefreshToken`**: hashed refresh tokens with rotation tracking (`familyId`, `jti`, `revokedAt`, `expiresAt`).
- **`LoginAttempt`**: failed/successful login attempts for lockout/auditing (includes `ipAddress` as `inet`).
- **`SignedUrl`**: short-lived tokens for file actions (`view`, `download`, `stream`, `thumbnail`) without exposing long-lived credentials.

### Files & Folders

- **`Folder`**: hierarchical structure via `parentId` (self relation), supports favorites and trash.
- **`File`**: file metadata + storage pointers (`path`, `thumbnailPath`, `transcodedPath`), supports favorites and trash.
- **`FileChunk`**: staging records for chunked uploads (`uploadId` + `chunkIndex` unique).
- **`Activity`**: audit trail of user actions (upload/delete/share/etc).

### Sharing

- **`Share`**: share links for a file or folder (supports `publicToken`, optional `password`, expiry, and download limits).
- **`ShareCollaborator`**: per-user permissions (`VIEWER`/`EDITOR`) for private shares.

### Media

- **`Album`**: user-owned media collections.
- **`AlbumFile`**: join table between `Album` and `File` (includes ordering).

### Background Jobs

- **`TranscodingJob`**: state/progress for video transcoding.
- **`CompressionJob`**: state/progress for compress/decompress operations.
- **`StorageRequest`**: user requests for quota increases (admin-review workflow).

### Configuration & Content

- **`Settings`**: key/value configuration editable from the admin UI.
- **`EmailTemplate`** / **`EmailTemplateVariable`**: email templates and their variables.
- **`LegalPage`**: editable legal pages (stored content + `isActive` flag).
