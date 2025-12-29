# CloudBox

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=flat&logo=node.js&logoColor=white)

**CloudBox** is a powerful, self-hosted cloud storage solution designed to provide a secure and user-friendly alternative to commercial services like Google Drive or Dropbox. Built with performance and privacy in mind, it offers a complete suite of tools for file management, media streaming, and collaboration.

---

## Features

### Advanced File Management

- **Chunked Uploads**: Seamlessly upload files of any size with automatic resume capability.
- **Folder Organization**: Create unlimited nested folders to keep your data structured.
- **Drag & Drop**: Intuitive drag-and-drop interface for files and folders.
- **Context Menus**: Right-click actions for quick access to renaming, moving, and deleting.
- **Tags**: Organize files with custom color-coded tags for easy filtering.
- **Version History**: Restore previous versions of your files.

### Media Streaming & Preview

- **Video Player**: Stream video files directly in the browser with adaptive transcoding.
- **Photo Gallery**: Browse photos with a beautiful masonry grid and lightbox viewer.
- **Music Player**: Global music player that continues playing as you navigate the app.
- **PDF Viewer**: Preview authorized documents without downloading.
- **Document Preview**: View Word, Excel, and other office documents.

### Sharing & Collaboration

- **Public Links**: Generate secure sharing links for anyone to access.
- **Password Protection**: Secure your shared links with custom passwords.
- **Expiration Dates**: Set automatic expiration for sensitive shares.
- **Download Limits**: Control the number of times a file can be downloaded.

### Security & Administration

- **Two-Factor Authentication (2FA)**: Protect accounts with TOTP-based 2FA and recovery codes.
- **User Management**: Full admin dashboard to manage users, roles, and quotas.
- **Storage Quotas**: Define generic or per-user storage limits.
- **Rate Limiting**: Built-in protection against abuse.
- **Secure Auth**: JWT-based stateless authentication with refresh token rotation.
- **Audit Logs**: Track user activity and security events.

---

## Technology Stack

We use a modern, strictly-typed stack to ensure reliability and ease of maintenance.

### Frontend

- **Framework**: [React 18](https://reactjs.org/) (via [Vite](https://vitejs.dev/))
- **State Management**: [Zustand](https://github.com/pmndrs/zustand)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Routing**: React Router DOM v6
- **Data Fetching**: TanStack Query

### Backend

- **Runtime**: [Node.js](https://nodejs.org/) (v18+)
- **Framework**: [Express.js](https://expressjs.com/)
- **Language**: TypeScript
- **Database**: PostgreSQL (via [Prisma ORM](https://www.prisma.io/))
- **Background Jobs**: Redis + Bull
- **Error Tracking**: Sentry / GlitchTip (self-hosted)

---

## Documentation

Detailed documentation is available in the `docs/` directory to help you get started and understand the system architecture.

### Getting Started
- [**Getting Started**](./docs/getting_started.md): Installation, environment setup, and running the app locally.
- [**Environment Variables**](./docs/environment_variables.md): Complete reference for all configuration options.
- [**Troubleshooting**](./docs/troubleshooting.md): Solutions for common issues.

### Architecture & API
- [**Architecture**](./docs/architecture.md): Deep dive into the system design, components, and security.
- [**API Overview**](./docs/api_overview.md): Reference for the REST API endpoints.
- [**Admin API**](./docs/admin_api.md): Complete admin endpoint documentation.
- [**WebSockets**](./docs/websockets.md): Real-time events with Socket.IO.
- [**Background Queues**](./docs/queues.md): Bull queues for media processing.

### Development
- [**Database Schema**](./docs/database_schema.md): Explanation of the data models.
- [**Frontend Guide**](./docs/frontend_guide.md): Guide for frontend development and structure.
- [**Internationalization**](./docs/i18n.md): Multi-language support (i18n) guide.
- [**Testing**](./docs/testing.md): Running and writing tests.

### Operations
- [**Deployment**](./docs/deployment.md): Production Docker, tunneling/proxying.
- [**Backup & Restore**](./docs/backup.md): Backup procedures and disaster recovery.
- [**Security Hardening**](./docs/security_hardening.md): Best practices for production security.

---

## Quick Start (Development)

1. **Clone the repository**

    ```bash
    git clone https://github.com/yourusername/cloudbox.git
    cd cloudbox
    ```

2. **Install Dependencies**

    ```bash
    npm run install:all
    ```

3. **Setup Environment**

    Copy the `.env.example` files in both `backend/` and `frontend/` to `.env` and fill in your database and Redis credentials.

    If you don't have Postgres/Redis locally, you can start them via Docker:

    ```bash
    docker-compose up -d postgres redis
    ```

4. **Initialize Database**

    ```bash
    npm run setup
    ```

    Development note: the seed creates an admin user. If you want a known password, set `ADMIN_PASSWORD` before running `npm run setup`; otherwise it prints a randomly-generated password to the console.

5. **Run Development Servers**

    ```bash
    npm run dev
    ```

    - Frontend: `http://localhost:5000`
    - Backend: `http://localhost:3001`

---

## Production Deployment

Follow these steps to deploy CloudBox on a production server using Docker.

### Prerequisites

-   A Linux server (Ubuntu 22.04+ recommended).
-   [Docker](https://docs.docker.com/engine/install/) and [Docker Compose](https://docs.docker.com/compose/install/) (v2.x) installed.
-   A domain name pointing to your server (e.g., `cloud.example.com`).
-   (Recommended) Cloudflare Tunnel for secure remote access.

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/cloudbox.git
cd cloudbox
```

### 2. Configure Environment Variables

Copy the production example file and edit it with secure values.

```bash
cp .env.production.example .env
nano .env # or use your preferred editor
```

**Required variables to set:**
-   `FRONTEND_URL`: Full URL with `https://` (e.g., `https://cloud.example.com`).
-   `POSTGRES_PASSWORD`: A strong, unique password.
-   `JWT_SECRET` / `JWT_REFRESH_SECRET`: Generate with \`openssl rand -base64 64\`.
-   `ENCRYPTION_KEY`: Generate with \`openssl rand -base64 32\`.

### 3. Start All Services

```bash
docker-compose -f docker-compose.prod.yml up -d --build
```

This command will build the images (if not present) and start:
-   `cloudbox-postgres`: Database.
-   `cloudbox-redis`: Cache and job queue.
-   `cloudbox-backend`: API server on port `3001`.
-   `cloudbox-frontend`: Caddy server on port `5000`.
-   `cloudbox-glitchtip` (optional): Error tracking.

### 4. Run Database Migrations

The backend container runs migrations on startup. You can verify the database is ready by checking the logs:

```bash
docker-compose -f docker-compose.prod.yml logs backend
```

### 5. Create Admin User and Apply Default Branding

Run the seed script inside the backend container:

```bash
docker-compose -f docker-compose.prod.yml exec backend npm run db:seed
```

This will:
- Create the admin user using `ADMIN_EMAIL` and `ADMIN_PASSWORD` from your `.env` file (password must be at least 12 characters)
- Apply default branding settings (site name, primary color)
- Load custom file icons for all supported file types

> **Note**: The seed only creates settings if they don't exist. Running it multiple times won't overwrite your customizations.

Point your Cloudflare Tunnel to the services:
-   **Frontend**: `http://localhost:5000` (Caddy will proxy API requests automatically)
-   **Backend API**: `http://localhost:3001` (Use this for direct manual access)

### 7. Verify Deployment

Navigate to your domain or `http://your-server-ip:3001` (if manual).
Check the health endpoint:

```bash
curl http://localhost:3001/api/health/ping
# Expected: {"status":"ok"}
```

---

## License

MIT License. See `LICENSE`.


