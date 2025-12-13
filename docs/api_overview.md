# CloudBox API Overview

The backend exposes a REST API under `/api`.

## Base URL

Defaults to `http://localhost:3001/api`.

## Authentication Model

- **Access token**: sent as `Authorization: Bearer <token>`.
- **Refresh token**: stored in an **httpOnly cookie** (`refreshToken`) scoped to `/api/auth`.
  - Frontend requests use `withCredentials: true` so the cookie is sent automatically.

## Health

- `GET /health/ping`: public ping for load balancers.
- `GET /health`: detailed checks (requires `ADMIN`).

## Modules (high level)

### Auth (`/auth`)

- `POST /register`
- `POST /login`
- `POST /google`
- `POST /refresh`
- `POST /logout`
- `POST /forgot-password`
- `POST /reset-password`
- `GET /verify-email/:token`
- `GET /sessions`
- `DELETE /sessions/:sessionId`
- `POST /sessions/logout-all`

### Users (`/users`)

- `GET /me`
- `POST /change-password`
- `POST /avatar` (multipart)
- `GET /avatar/:userId`
- `DELETE /avatar`
- `DELETE /me`
- `POST /storage-request`
- `GET /storage-requests`

### Files (`/files`)

- `GET /` (list)
- `GET /:id` (metadata)
- `POST /upload` (multipart)
- `POST /upload-with-folders` (multipart)
- `POST /upload/validate`
- `POST /upload/init`
- `POST /upload/chunk` (multipart; merges and returns the file when the last chunk arrives)
- `PATCH /:id/rename`
- `PATCH /:id/move`
- `PATCH /:id/favorite`
- `DELETE /:id` (trash)
- `GET /:id/view`
- `GET /:id/stream`
- `GET /:id/download`
- `GET /:id/thumbnail`
- `POST /:id/signed-url`
- `GET /:id/pdf-preview`
- `GET /:id/pdf-preview/status`
- `GET /:id/excel-html`
- `POST /create-empty`

### Folders (`/folders`)

- `POST /`
- `GET /`
- `GET /:id`
- `PATCH /:id`
- `PATCH /:id/move`
- `PATCH /:id/favorite`
- `GET /:id/size`
- `GET /:id/download`
- `DELETE /:id` (trash)

### Shares (`/shares`)

- `POST /`
- `PATCH /:id`
- `DELETE /:id`
- `POST /bulk-delete`
- `POST /:id/collaborators`
- `DELETE /:id/collaborators/:userId`
- `GET /by-me`
- `GET /with-me`
- `GET /public/:token`
- `POST /public/:token/verify`
- `GET /public/:token/download`
- `GET /public/:token/files/:fileId/download`

### Trash (`/trash`)

- `GET /`
- `POST /restore/file/:id`
- `POST /restore/folder/:id`
- `POST /restore/batch`
- `DELETE /empty`

### Albums (`/albums`)

- `POST /`
- `GET /`
- `GET /:id`
- `PATCH /:id`
- `DELETE /:id`
- `GET /:id/files`
- `POST /:id/files`
- `DELETE /:id/files`

### Compression (`/compression`)

- `POST /compress`
- `POST /decompress`
- `GET /progress/:jobId`
- `GET /status/:jobId`
- `POST /cancel/:jobId`
- `GET /jobs`
- `GET /list/:fileId`

### Activity (`/activity`)

- `GET /`
- `GET /dashboard`

## Other Endpoints

- `GET /config/upload-limits`: upload chunk size / concurrency config used by the frontend.

## Admin

- Admin API endpoints are under `/admin` (see `backend/src/routes/admin.ts` for the full list).
- Queue dashboard (Bull Board): `/admin/queues` (requires `ADMIN` auth).
