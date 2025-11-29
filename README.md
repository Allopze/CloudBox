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

## Default Admin Account

```
Email: admin@cloudbox.com
Password: admin123
```

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
DATABASE_URL="file:./dev.db"
JWT_SECRET="your-jwt-secret"
JWT_REFRESH_SECRET="your-refresh-secret"
PORT=4000
FRONTEND_URL="http://localhost:5173"
STORAGE_PATH="./data"
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
SMTP_HOST=""
SMTP_USER=""
SMTP_PASS=""
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
