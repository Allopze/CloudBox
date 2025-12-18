# CloudBox API Overview

The backend exposes a REST API under `/api`.

## Base URL

Defaults to `http://localhost:3001/api`.

## Authentication Model

- **Access token**: sent as `Authorization: Bearer <token>`.
- **Refresh token**: stored in an **httpOnly cookie** (`refreshToken`) scoped to `/api/auth`.
  - Frontend requests use `withCredentials: true` so the cookie is sent automatically.

## Common Response Formats

### Success Response
```json
{
  "data": { ... },
  "message": "Operation successful"
}
```

### Error Response
```json
{
  "error": "Error message describing the issue"
}
```

### Paginated Response
```json
{
  "items": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

## Common Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number (1-indexed) |
| `limit` | number | Items per page (default: 20, max: 100) |
| `search` | string | Search term |
| `sortBy` | string | Field to sort by |
| `sortOrder` | `asc` \| `desc` | Sort direction |

---

## Health

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /health/ping` | None | Public ping for load balancers |
| `GET /health` | Admin | Detailed infrastructure checks |

---

## Auth (`/auth`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/register` | POST | Create new account |
| `/login` | POST | Login with email/password |
| `/google` | POST | Login with Google OAuth |
| `/refresh` | POST | Refresh access token |
| `/logout` | POST | Logout (revokes refresh token) |
| `/forgot-password` | POST | Request password reset email |
| `/reset-password` | POST | Reset password with token |
| `/verify-email/:token` | GET | Verify email address |
| `/sessions` | GET | List active sessions |
| `/sessions/:sessionId` | DELETE | Revoke specific session |
| `/sessions/logout-all` | POST | Logout from all devices |

### Login Request
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

### Login Response
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "USER",
    "storageQuota": "5368709120",
    "storageUsed": "1234567890"
  },
  "accessToken": "eyJhbG..."
}
```

---

## Users (`/users`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/me` | GET | Get current user profile |
| `/change-password` | POST | Change password |
| `/avatar` | POST | Upload avatar (multipart) |
| `/avatar/:userId` | GET | Get user avatar |
| `/avatar` | DELETE | Delete avatar |
| `/me` | DELETE | Delete own account |
| `/storage-request` | POST | Request quota increase |
| `/storage-requests` | GET | List own storage requests |

---

## Files (`/files`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | List files (with filters) |
| `/:id` | GET | Get file metadata |
| `/upload` | POST | Simple upload (multipart) |
| `/upload-with-folders` | POST | Upload with folder structure |
| `/upload/validate` | POST | Validate files before upload |
| `/upload/init` | POST | Initialize chunked upload |
| `/upload/chunk` | POST | Upload chunk |
| `/:id/rename` | PATCH | Rename file |
| `/:id/move` | PATCH | Move file to folder |
| `/:id/favorite` | PATCH | Toggle favorite |
| `/:id` | DELETE | Move to trash |
| `/:id/view` | GET | View file (inline) |
| `/:id/stream` | GET | Stream video/audio |
| `/:id/download` | GET | Download file |
| `/:id/thumbnail` | GET | Get thumbnail |
| `/:id/signed-url` | POST | Generate signed URL |
| `/:id/pdf-preview` | GET | PDF preview for documents |
| `/:id/pdf-preview/status` | GET | Check conversion status |
| `/:id/excel-html` | GET | HTML preview for Excel |
| `/create-empty` | POST | Create empty file |

### List Files Query Parameters
```
GET /files?folderId=uuid&mimeType=image/*&isFavorite=true&sortBy=createdAt&sortOrder=desc
```

### Chunked Upload Flow

1. **Initialize**: `POST /upload/init`
   ```json
   {
     "filename": "video.mp4",
     "size": 1073741824,
     "mimeType": "video/mp4",
     "totalChunks": 50,
     "folderId": "uuid" // optional
   }
   ```
   Response: `{ "uploadId": "uuid" }`

2. **Upload chunks**: `POST /upload/chunk`
   ```
   FormData: file, uploadId, chunkIndex, totalChunks
   ```

3. **Automatic merge**: Last chunk triggers merge and returns file.

---

## Folders (`/folders`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | POST | Create folder |
| `/` | GET | List root folders |
| `/:id` | GET | Get folder with contents |
| `/:id` | PATCH | Update folder (name, color) |
| `/:id/move` | PATCH | Move folder |
| `/:id/favorite` | PATCH | Toggle favorite |
| `/:id/size` | GET | Calculate folder size |
| `/:id/download` | GET | Download as ZIP |
| `/:id` | DELETE | Move to trash |

### Create Folder
```json
{
  "name": "My Folder",
  "parentId": "uuid", // optional
  "color": "#ff0000" // optional
}
```

---

## Shares (`/shares`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | POST | Create share |
| `/:id` | PATCH | Update share settings |
| `/:id` | DELETE | Delete share |
| `/bulk-delete` | POST | Delete multiple shares |
| `/:id/collaborators` | POST | Add collaborator |
| `/:id/collaborators/:userId` | DELETE | Remove collaborator |
| `/by-me` | GET | Shares I created |
| `/with-me` | GET | Shares shared with me |
| `/public/:token` | GET | Access public share |
| `/public/:token/verify` | POST | Verify password |
| `/public/:token/download` | GET | Download shared file/folder |
| `/public/:token/files/:fileId/download` | GET | Download file from shared folder |

### Create Share
```json
{
  "fileId": "uuid", // or folderId
  "type": "PUBLIC", // or PRIVATE
  "password": "optional",
  "expiresAt": "2025-12-31T23:59:59Z",
  "downloadLimit": 10,
  "allowDownload": true
}
```

---

## Trash (`/trash`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | List trashed items |
| `/restore/file/:id` | POST | Restore file |
| `/restore/folder/:id` | POST | Restore folder |
| `/restore/batch` | POST | Restore multiple items |
| `/empty` | DELETE | Empty trash permanently |

---

## Albums (`/albums`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | POST | Create album |
| `/` | GET | List albums |
| `/:id` | GET | Get album |
| `/:id` | PATCH | Update album |
| `/:id` | DELETE | Delete album |
| `/:id/files` | GET | Get album files |
| `/:id/files` | POST | Add files to album |
| `/:id/files` | DELETE | Remove files from album |

---

## Compression (`/compression`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/compress` | POST | Compress files/folders |
| `/decompress` | POST | Decompress archive |
| `/progress/:jobId` | GET | Get job progress (SSE) |
| `/status/:jobId` | GET | Get job status |
| `/cancel/:jobId` | POST | Cancel job |
| `/jobs` | GET | List compression jobs |
| `/list/:fileId` | GET | List archive contents |

### Compress Request
```json
{
  "items": [
    { "type": "file", "id": "uuid" },
    { "type": "folder", "id": "uuid" }
  ],
  "format": "zip", // zip, 7z, tar
  "outputName": "archive.zip",
  "compressionLevel": 5
}
```

---

## Activity (`/activity`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | List user activities |
| `/dashboard` | GET | Dashboard summary |

### Activity Types
- `UPLOAD` - File uploaded
- `DELETE` - File/folder deleted
- `SHARE` - Share created
- `DOWNLOAD` - File downloaded
- `COMPRESS` - Compression started
- `DECOMPRESS` - Decompression started

---

## Config

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/config/upload-limits` | GET | Get upload configuration |

Response:
```json
{
  "maxFileSize": 104857600,
  "chunkSize": 20971520,
  "concurrentChunks": 4
}
```

---

## Admin

Admin API endpoints are documented separately in [admin_api.md](./admin_api.md).

- All endpoints require `ADMIN` role
- Base path: `/api/admin`
- Queue dashboard: `/admin/queues` (Bull Board)

---

## Error Codes

| Status | Description |
|--------|-------------|
| 400 | Bad Request / Validation Error |
| 401 | Unauthorized / Invalid Token |
| 403 | Forbidden / Insufficient Permissions |
| 404 | Resource Not Found |
| 409 | Conflict (e.g., duplicate name) |
| 413 | File Too Large |
| 429 | Rate Limit Exceeded |
| 500 | Internal Server Error |
