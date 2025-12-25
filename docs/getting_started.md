# Getting Started with CloudBox

This guide helps you run CloudBox locally (frontend + backend + database).

## Prerequisites

- **Node.js**: v18+
- **npm**: v9+
- **PostgreSQL**: v16+ (or use Docker)
- **Redis**: optional for local dev, recommended; required for Bull queues in production
- **System dependencies (for full feature set):**
  - **FFmpeg**: video/audio transcoding
  - **7-Zip / p7zip (`7z`)**: extracting `.7z`, `.rar`, `.tar` archives
  - **GraphicsMagick (`gm`)**: PDF thumbnails (used by `pdf2pic`)
  - **LibreOffice (`soffice`)**: Office document → PDF preview generation

## Project Structure

- `backend/`: Express API server (TypeScript, Prisma)
- `frontend/`: React app (Vite, Zustand, Tailwind)
- `docs/`: architecture, API, deployment

## Option A (Recommended): Local dev servers + Docker for Postgres/Redis

1. **Start Postgres + Redis**

   ```bash
   docker-compose up -d postgres redis
   ```

2. **Install dependencies**

   ```bash
   npm run install:all
   ```

3. **Configure environment**

   - Backend: copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL` to your local Postgres.
   - Frontend: copy `frontend/.env.example` to `frontend/.env` (usually only `VITE_API_URL`).

4. **Initialize the database**

   ```bash
   npm run setup
   ```

   Development note: the seed creates an admin user. If you want a known password, set `ADMIN_PASSWORD` before running the seed; otherwise it prints a randomly-generated password to the console.

5. **Run dev servers**

   ```bash
   npm run dev
   ```

   - Frontend: `http://localhost:5000`
   - Backend: `http://localhost:3001` (API base: `http://localhost:3001/api`)

## Option B: Dockerized local run (no hot reload)

This runs the backend + a built frontend behind NGINX (use Option A for Vite HMR).

```bash
docker-compose up -d --build
```

- Frontend: `http://localhost:8080`
- Backend: `http://localhost:3001`

## Useful Commands

| Command | Description |
|--------|-------------|
| `npm run dev` | Start frontend (5000) + backend (3001) |
| `npm run setup` | Install deps, Prisma generate, db push, seed |
| `npm run db:studio` | Open Prisma Studio |
| `npm run test:backend` | Run backend tests (Vitest) |

