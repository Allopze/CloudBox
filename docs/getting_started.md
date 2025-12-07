# Getting Started with CloudBox

This guide will help you set up and run the CloudBox project locally.

## Prerequisites

- **Node.js**: v18 or higher
- **npm**: v9 or higher
- **PostgreSQL**: Running locally or accessible remotely
- **Redis**: Required for background jobs (Bull queue)
- **FFmpeg**: Required for video processing (installed on system path)

## Project Structure

- `backend/`: Node.js API server
- `frontend/`: React Web application

## Installation

1. **Clone and Install Dependencies**
    The project has a helper script to install dependencies for both frontend and backend.

    ```bash
    npm run install:all
    ```

2. **Environment Setup**
    - Navigate to `backend/` and copy `.env.example` to `.env`.
    - Configure your database URL, Redis connection, and JWT secrets.

    ```bash
    cd backend
    cp .env.example .env
    # Edit .env with your credentials
    ```

    - Navigate to `frontend/` and copy `.env.example` to `.env` if necessary (usually for API URL).

3. **Database Setup**
    Initialize the database schema and seed initial data.

    ```bash
    npm run setup
    # This runs: generate, db push, and seed
    ```

## Running the Application

### Development Mode

To run both backend and frontend concurrently in development mode:

```bash
npm run dev
```

- **Backend:** <http://localhost:3001> (default)
- **Frontend:** <http://localhost:5173> (default)

### Building for Production

To build both applications:

```bash
npm run build
```

The build artifacts will be located in:

- Backend: `backend/dist/`
- Frontend: `frontend/dist/`

## Scripts Reference

| Script | Description |
|--------|-------------|
| `npm run dev` | Starts dev servers for frontend and backend |
| `npm run build` | Builds both applications |
| `npm run setup` | Installs deps and sets up the database |
| `npm run db:studio` | Opens Prisma Studio to view database content |
