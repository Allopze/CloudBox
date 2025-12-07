# CloudBox API Overview

The backend exposes a RESTful API organized by resource.

## Base URL

Defaults to `http://localhost:3001/api`.

## Core Modules

### Authentication (`/auth`)

- `POST /register`: Create new account.
- `POST /login`: Authenticate and receive tokens.
- `POST /refresh-token`: Get new access token using refresh token.
- `POST /logout`: Invalidate tokens.
- `POST /google`: Google OAuth login.

### Files (`/files`)

- `GET /`: List files (supports pagination, filtering).
- `POST /upload`: Upload single or multiple files.
- `POST /upload/init`: Initialize chunked upload.
- `POST /upload/chunk`: Upload a specific chunk.
- `POST /upload/complete`: Finalize chunked upload.
- `DELETE /:id`: Move file to trash.

### Folders (`/folders`)

- `GET /`: List folders (root).
- `GET /:id`: Get folder details and contents.
- `POST /`: Create new folder.
- `PUT /:id`: Rename or move folder.
- `DELETE /:id`: Move to trash.

### Shares (`/shares`)

- `POST /`: Create a new share link.
- `GET /public/:token`: Access a public share.
- `POST /public/:token/download`: Download shared files.

### Users (`/users`)

- `GET /me`: Get current user profile.
- `GET /storage`: Get storage usage and quota.

### Admin (`/admin`)

- `GET /users`: List all system users.
- `GET /stats`: System-wide statistics.
- `POST /users/:id/ban`: Ban a user.

## Common Features

- **Pagination**: Most list endpoints support `page` and `limit` query params.
- **Search**: `q` query param for full-text search.
- **Responses**: Standardized JSON format `{ "data": ... }` or `{ "error": ... }`.
