# CloudBox

A modern cloud storage platform inspired by Cloudreve and Google Drive, built with React, Express, TypeScript, and Prisma.

## Features

- 🔐 **Authentication** - JWT with refresh tokens, OAuth2 (Google), email verification
- 📁 **File Management** - Upload, download, preview, chunked uploads for large files
- 📂 **Folders** - Nested folder structure with color categories
- 🔗 **Sharing** - Public/private links with passwords and expiration
- 🖼️ **Photos** - Gallery view with albums
- 🎵 **Music** - Built-in music player with queue
- 📄 **Documents** - Document viewer and organization
- 🗑️ **Trash** - Soft delete with auto-cleanup
- 👤 **Admin Panel** - User management, system settings, SMTP configuration
- 🌙 **Dark Mode** - Beautiful dark theme with red accent

## Tech Stack

### Backend
- Node.js + Express
- TypeScript
- Prisma ORM (SQLite)
- JWT Authentication
- Sharp (image processing)
- Archiver (compression)

Note: For generating document/video thumbnails and conversions, additional system packages are recommended:

- LibreOffice (soffice) - used to convert Office documents (Word/Excel/PowerPoint) to PDF for thumbnail generation
- poppler-utils (pdftoppm) - used to render first page of PDFs to images
- ImageMagick (convert/magick) - fallback for PDF/Document conversion
- ffmpeg - used for video frame extraction and some audio cover fallbacks

These are OS-level dependencies and are not installed via npm. On Debian/Ubuntu you can install them with:

```bash
sudo apt-get install -y libreoffice poppler-utils imagemagick ffmpeg
```

### Frontend
- React 18 + Vite
- TypeScript
- Tailwind CSS
- Zustand (state management)
- React Query
- Lucide Icons

## Quick Start

```bash
# Install all dependencies
npm run install:all

# Setup database (generate, push schema, seed)
npm run setup

# Start development servers
npm run dev
```

The app will be available at:
- Frontend: http://localhost:5173
- Backend API: http://localhost:4000

## Security Configuration

### Production Setup

**Important**: In production, several security measures must be configured:

#### Admin Account
The seed script no longer uses hardcoded credentials. In production:

```bash
# Set environment variables before running seed
export NODE_ENV=production
export ADMIN_EMAIL=your-admin@example.com
export ADMIN_PASSWORD=your-secure-password-min-12-chars
npm run db:seed
```

In development, a random password is generated and displayed once.

#### JWT Secrets
Always set strong secrets in production:

```env
JWT_SECRET="generate-64-char-random-string"
JWT_REFRESH_SECRET="generate-different-64-char-random-string"
```

#### Cookie Security
For HTTPS deployments, configure cookie settings:

```env
COOKIE_DOMAIN=yourdomain.com
```

### Token Security

- **Access tokens**: Short-lived (15min), stored in memory/localStorage
- **Refresh tokens**: 
  - Stored as httpOnly cookies (not accessible to JavaScript)
  - Server stores only hash + jti (not plaintext)
  - Token rotation with family tracking (detects token reuse/theft)
  - Entire token family invalidated on suspicious activity

### File Access Security

For direct file access (images, media), use signed URLs instead of query string tokens:

```javascript
// Frontend: Request signed URL
const { signedUrl } = await api.post(`/files/${fileId}/signed-url`, { action: 'view' });
// Use signedUrl directly in img src, etc.
```

Signed URLs expire after 5 minutes (configurable via `SIGNED_URL_EXPIRES_IN`).

## Default Admin Account

In development, run the seed to create an admin account. The password will be randomly generated and displayed in the console. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` environment variables to use specific credentials.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both backend and frontend in development mode |
| `npm run dev:backend` | Start only the backend server |
| `npm run dev:frontend` | Start only the frontend server |
| `npm run build` | Build both projects for production |
| `npm run install:all` | Install dependencies for root, backend, and frontend |
| `npm run setup` | Full setup: install deps, setup database, seed data |
| `npm run db:studio` | Open Prisma Studio to browse database |

## Environment Variables

Create a `.env` file in the `backend` folder:

```env
# Database - PostgreSQL (recommended for production)
# For local development, you can use SQLite: DATABASE_URL="file:./dev.db"
DATABASE_URL="postgresql://user:password@localhost:5432/cloudbox?schema=public"

# PostgreSQL Connection Pool (optional)
DATABASE_POOL_SIZE="10"
DATABASE_CONNECT_TIMEOUT="10"
# For PgBouncer or external pooler:
# DATABASE_POOLER="pgbouncer"

# JWT (REQUIRED in production - use strong random values)
JWT_SECRET="your-jwt-secret"
JWT_REFRESH_SECRET="your-refresh-secret"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

# Server
PORT=4000
FRONTEND_URL="http://localhost:5173"
STORAGE_PATH="./data"

# Security (production)
# NODE_ENV=production
# COOKIE_DOMAIN=yourdomain.com
# SIGNED_URL_EXPIRES_IN=300

# Admin seed (production only)
# ADMIN_EMAIL=admin@example.com
# ADMIN_PASSWORD=secure-password-min-12-chars

# OAuth
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

# Email
SMTP_HOST=""
SMTP_USER=""
SMTP_PASS=""
```

### Database Setup

**PostgreSQL (Production)**:
```bash
# Create database
createdb cloudbox

# Run migrations
cd backend
npx prisma migrate deploy

# Generate Prisma Client
npx prisma generate

# Seed initial data
npm run db:seed
```

**SQLite (Development only)**:
```bash
# For quick local development, use SQLite
# Set in .env: DATABASE_URL="file:./dev.db"
cd backend
npx prisma db push
npm run db:seed
```

**Connection Pooling**:

For high-traffic production environments, configure connection pooling:

1. **Prisma built-in pooling** (via connection string):
   ```env
   DATABASE_URL="postgresql://user:pass@host:5432/db?connection_limit=10&connect_timeout=10"
   ```

2. **External pooler (PgBouncer)**:
   ```env
   DATABASE_POOLER="pgbouncer"
   DATABASE_URL="postgresql://user:pass@pgbouncer:6432/db"
   ```

3. **Serverless (Neon, Supabase, etc.)**:
   ```env
   DATABASE_URL="postgresql://...pooler-url..."
   DIRECT_DATABASE_URL="postgresql://...direct-url..."
   ```

And a `.env` in `frontend`:

```env
VITE_API_URL="http://localhost:4000/api"
VITE_GOOGLE_CLIENT_ID=""
```

## Project Structure

```
cloudbox/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma
│   ├── src/
│   │   ├── config/
│   │   ├── lib/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── schemas/
│   │   └── index.ts
│   └── uploads/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── layouts/
│   │   ├── lib/
│   │   ├── pages/
│   │   ├── stores/
│   │   └── types/
│   └── index.html
└── package.json
```

## License

MIT
