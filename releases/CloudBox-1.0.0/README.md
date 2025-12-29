# CloudBox v1.0.0

## 🐳 Docker Deployment (Recommended)

### Quick Start
```bash
cp .env.production.example .env
# Edit .env with your configuration (set passwords, FRONTEND_URL, ENCRYPTION_KEY, etc.)
docker-compose -f docker-compose.prod.yml up -d --build
```

Access:
- Frontend: http://localhost:5000
- Backend API: http://localhost:3001

### First-time Setup
After starting the containers, create the initial admin user:
```bash
docker-compose -f docker-compose.prod.yml exec backend node dist/prisma/seed.js
```

## 📦 Manual Installation

### 1. Backend Setup
```bash
cd backend
cp .env.example .env
# Edit .env with your database and Redis configuration
npm install --production
npm run db:migrate
npm run start
```

### 2. Frontend Setup
```bash
cd frontend
npm run serve
```

Or serve the `frontend/dist` folder with any static file server (Caddy, nginx, etc.)

## Requirements
- Node.js >= 18
- PostgreSQL
- Redis (optional, for caching and job queues)

## Environment Variables
See `backend/.env.example` for all available configuration options.
For Docker deployments, see `.env.production.example`.
