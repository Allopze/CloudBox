# CloudBox Environment Variables

Complete reference for all environment variables used in CloudBox.

---

## Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment: `development`, `production`, `test` |
| `PORT` | `3001` | Backend server port |
| `FRONTEND_URL` | `http://localhost:5000` | Frontend URL (used for CORS, emails, redirects) |

Notes for `FRONTEND_URL`:
- Local dev (`npm run dev`): `http://localhost:5000`
- Docker dev (`docker-compose up --build`): `http://localhost:5000`
- Production: your real domain (e.g. `https://cloud.example.com`)

---

## Database

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |

**Format:**
```
postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public
```

**Example:**
```bash
DATABASE_URL="postgresql://cloudbox:password@localhost:5432/cloudbox?schema=public"
```

---

## JWT Authentication

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | (required in production) | Secret for access token signing |
| `JWT_REFRESH_SECRET` | (required in production) | Secret for refresh token signing |
| `JWT_EXPIRES_IN` | `15m` | Access token expiration |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token expiration |

> **Security**: Change default secrets in production. The server will refuse to start if using defaults in production mode.

**Generate secure secrets:**
```bash
openssl rand -base64 64
```

---

## Encryption

| Variable | Default | Description |
|----------|---------|-------------|
| `ENCRYPTION_KEY` | (required in production) | Encrypts sensitive data (SMTP passwords, 2FA secrets) |

**Generate secure key:**
```bash
openssl rand -base64 32
```

---

## Storage

| Variable | Default | Description |
|----------|---------|-------------|
| `STORAGE_PATH` | `../data` | Directory for file storage |
| `MAX_FILE_SIZE` | `104857600` | Max file size in bytes (100MB) |
| `DEFAULT_QUOTA` | `5368709120` | Default user quota in bytes (5GB) |
| `TRASH_RETENTION_DAYS` | `30` | Days before auto-deleting trashed files |

**Storage Structure:**
```
STORAGE_PATH/
├── files/{userId}/     # User files
├── thumbnails/         # Generated thumbnails
├── chunks/{uploadId}/  # Temporary upload chunks
├── temp/               # Temporary files
├── avatars/            # User avatars
├── branding/           # Custom logos
└── landing/            # Landing assets (admin-configurable)
```

---

## Redis (Optional but Recommended)

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_HOST` | `localhost` | Redis server host |
| `REDIS_PORT` | `6379` | Redis server port |
| `REDIS_PASSWORD` | - | Redis password (if required) |
| `REDIS_DB` | `0` | Redis database number |
| `CACHE_ENABLED` | `true` | Enable/disable caching |
| `MAX_SESSIONS_PER_USER` | `10` | Max concurrent sessions (0 = unlimited) |

> Redis is optional for development but strongly recommended for production. It enables distributed rate limiting, session management, and job queues.

---

## Google OAuth (Optional)

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |

To set up Google OAuth:
1. Go to Google Cloud Console
2. Create OAuth 2.0 credentials
3. Add authorized redirect URI: `{FRONTEND_URL}/auth/google/callback`

---

## SMTP (Optional)

Email configuration can be set via environment variables or the Admin UI.

| Variable | Default | Description |
|----------|---------|-------------|
| `SMTP_HOST` | - | SMTP server hostname |
| `SMTP_PORT` | `587` | SMTP server port |
| `SMTP_SECURE` | `false` | Use TLS (`true` for port 465) |
| `SMTP_USER` | - | SMTP username |
| `SMTP_PASS` | - | SMTP password |
| `SMTP_FROM` | - | Sender address (e.g., `CloudBox <noreply@example.com>`) |

---

## Compression

| Variable | Default | Description |
|----------|---------|-------------|
| `ZIP_COMPRESSION_LEVEL` | `5` | ZIP compression level (0-9) |

---

## Queue Workers

| Variable | Default | Description |
|----------|---------|-------------|
| `TRANSCODING_FALLBACK_CONCURRENCY` | `2` | Concurrent video transcoding jobs (no Redis) |
| `TRANSCODING_BULL_CONCURRENCY` | `2` | Concurrent transcoding jobs (with Bull/Redis) |
| `THUMBNAIL_FALLBACK_CONCURRENCY` | `2` | Concurrent thumbnail jobs (no Redis) |
| `THUMBNAIL_CONCURRENCY` | `4` | Concurrent thumbnail generations |
| `WORKER_CONCURRENCY` | `2` | General worker concurrency |
| `WORKER_TYPE` | `all` | Worker type: `all`, `transcoding`, `thumbnails` |

---

## Rate Limiting

| Variable | Default | Description |
|----------|---------|-------------|
| `THUMBNAIL_RATE_LIMIT_PER_HOUR` | `1000` | Max thumbnails per user per hour |
| `THUMBNAIL_RATE_LIMIT_WINDOW_MS` | `3600000` | Rate limit window (1 hour) |

---

## Error Tracking (Optional)

| Variable | Description |
|----------|-------------|
| `SENTRY_DSN` | Sentry/GlitchTip DSN for error tracking |

---

## Admin User (Seeding)

| Variable | Default | Description |
|----------|---------|-------------|
| `ADMIN_EMAIL` | `admin@cloudbox.local` | Initial admin email |
| `ADMIN_PASSWORD` | (random) | Initial admin password |

> If `ADMIN_PASSWORD` is not set, a random password is generated and printed to the console during `npm run setup`.

---

## Frontend Variables

Frontend environment variables are prefixed with `VITE_` and stored in `frontend/.env`.

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `http://localhost:3001/api` | Backend API URL |
| `VITE_SENTRY_DSN` | - | Sentry DSN for frontend |

---

## Example Files

### Backend (`backend/.env.example`)
```bash
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:5000

DATABASE_URL="postgresql://cloudbox:password@localhost:5432/cloudbox?schema=public"

JWT_SECRET=change-this-in-production
JWT_REFRESH_SECRET=change-this-in-production-too
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

STORAGE_PATH=../data
MAX_FILE_SIZE=104857600
DEFAULT_QUOTA=5368709120

REDIS_HOST=localhost
REDIS_PORT=6379
```

### Frontend (`frontend/.env.example`)
```bash
VITE_API_URL=http://localhost:3001/api
```
