# CloudBox Architecture

## Overview

CloudBox is a monorepo with a React SPA frontend and an Express REST API backend. The frontend talks to the backend over HTTP (`/api`) and uses Socket.io for real-time updates.

## Components

### Frontend

- **React 18 + Vite + TypeScript**
- **State**: Zustand
- **Data fetching**: TanStack Query
- **Styling**: Tailwind CSS
- **Real-time**: Socket.io client (JWT auth via `handshake.auth.token`)

### Backend

- **Node.js + Express + TypeScript**
- **Database**: PostgreSQL via Prisma
- **Queues**: Bull + Redis (with limited fallback mode in dev when Redis is unavailable)
- **Storage**: local filesystem path (`STORAGE_PATH`)

## Key Flows

### Authentication

- **Access tokens** are sent via `Authorization: Bearer <token>`.
- **Refresh token** is stored in an **httpOnly cookie** (`refreshToken`) scoped to `/api/auth`.
- Refresh token rotation is tracked in the DB (`RefreshToken.familyId`, `jti`).
- Optional Redis session store enables multi-device sessions and instant logout.

### Uploads & Storage

- **Direct uploads**: multipart upload via `/api/files/upload`.
- **Chunked uploads**:
  - `/api/files/upload/init` reserves quota (uses `User.tempStorage` to avoid races).
  - `/api/files/upload/chunk` stores chunks and merges automatically when the last chunk arrives.
- **Storage layout** (under `STORAGE_PATH`):
  - `files/<userId>/...` (original files + transcoded outputs)
  - `thumbnails/`
  - `chunks/<uploadId>/...`
  - `temp/`, `avatars/`, `branding/`

### Background Processing

- **Video transcoding**: Bull queue `transcoding` (FFmpeg). Progress is emitted over Socket.io.
- **Thumbnails**: Bull queue `thumbnails` (`sharp` for images; PDFs use `pdf2pic` and require GraphicsMagick).
- **Office document → PDF previews**: Bull queue `document-conversion` (requires LibreOffice `soffice`).

### Real-time (Socket.io)

- Clients subscribe to rooms (e.g. `subscribe:upload`, `subscribe:transcoding`).
- Server emits progress events (`upload:*`, `transcoding:*`) and quota updates (`quota:updated`).

## Operations

- **Health checks**:
  - `/api/health/ping` is public (suitable for load balancers).
  - `/api/health` is admin-only and includes deeper infrastructure checks.
- **Queue dashboard**: Bull Board mounted at `/admin/queues` (admin-only).
- **Observability**:
  - Structured logging via Pino (`backend/src/lib/logger.ts`).
  - Optional error tracking via Sentry/GlitchTip (`SENTRY_DSN`).
