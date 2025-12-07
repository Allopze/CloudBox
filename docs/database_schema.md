# CloudBox Database Schema

CloudBox uses PostgreSQL with Prisma ORM. Below are the core data models.

## User Management

- **`User`**: Core user entity. Stores credentials, role (`USER`/`ADMIN`), storage quotas (`storageQuota`, `storageUsed`), and profile info.
- **`RefreshToken`**: Stores JWT refresh tokens for session management. Includes rotation security (`familyId`, `tokenHash`).
- **`LoginAttempt`**: Tracks failed login attempts for rate limiting and security auditing.

## File System

- **`Folder`**: Hierarchical structure.
  - `parentId`: Self-relation to support nested folders.
  - `userId`: Owner of the folder.
- **`File`**: Represents a file on disk.
  - `folderId`: Link to parent folder (nullable for root files).
  - `mimeType`: Used for file type validation and icons.
  - `path`: Physical path on storage.
  - `size`: File size in bytes (stored as BigInt).
- **`FileChunk`**: Temporary storage for chunks during a chunked upload process.
- **`TranscodingJob`**: Tracks background video processing status.

## Sharing & Collaboration

- **`Share`**: Configuration for a shared resource (file or folder).
  - `type`: `PUBLIC`, `PRIVATE`, `PASSWORD`.
  - `publicToken`: Unique token for public access URL.
  - `password`: Optional password protection.
  - `expiresAt`: Expiration date for the link.
- **`ShareCollaborator`**: Maps specific users to a share with permissions (`VIEWER`, `EDITOR`).
- **`SignedUrl`**: Short-lived tokens for secure file access without exposing permanent links.

## Media Organization

- **`Album`**: Logical collection of files (usually photos).
- **`AlbumFile`**: Many-to-many relation between `Album` and `File`.

## System & Logs

- **`Activity`**: Audit log for user actions (upload, delete, share).
- **`Settings`**: System-wide key-value configuration.
- **`EmailTemplate`**: Dynamic templates for system emails (welcome, reset password).
