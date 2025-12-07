# CloudBox Architecture

## Overview

CloudBox is a scalable, self-hosted cloud storage platform built with a modern tech stack. It utilizes a client-server architecture where a React-based Single Page Application (SPA) communicates with a Node.js/Express REST API.

## Technology Stack

### Backend

- **Runtime:** Node.js
- **Language:** TypeScript
- **Framework:** Express.js
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Asynchronous Jobs:** Bull (Redis-backed)
- **File Processing:**
  - `multer`: File uploads
  - `sharp`: Image processing
  - `fluent-ffmpeg`: Video transcoding
  - `pdf-lib`: PDF manipulation

### Frontend

- **Framework:** React 18 (Vite)
- **Language:** TypeScript
- **State Management:** Zustand
- **Styling:** Tailwind CSS
- **Data Fetching:** TanStack Query (React Query)
- **UI Components:** Headless UI / Custom components
- **Icons:** Lucide React

## System Components

1. **Web Client (Frontend):**
    - Handles user interaction, file browsing, and media playback.
    - Communicates with the backend via REST API and Socket.io for real-time updates.
    - Manages local application state (auth, themes, upload progress).

2. **API Server (Backend):**
    - Exposes REST endpoints for user management, file operations, and sharing.
    - Enforces security policies (authentication, rate limiting, quotas).
    - Manages the physical file system interactions.

3. **Database (PostgreSQL):**
    - Stores relational data: Users, Files, Folders, Shares, Albums, etc.
    - Maintains hierarchical folder structures.

4. **Job Queue (Redis + Bull):**
    - Offloads heavy processing tasks from the main thread.
    - Tasks include: Video transcoding, thumbnail generation, email sending.

5. **File Storage:**
    - Local file system storage strategy (extensible design).
    - Files are stored in a structured directory layout, often utilizing UUIDs to prevent collisions.

## Security Architecture

- **Authentication:** JWT-based stateless authentication (Access + Refresh tokens).
- **Authorization:** Middleware checks ownership and permissions for every resource access.
- **Data Protection:**
  - Passwords hashed with `bcrypt`.
  - Secure public link tokens.
  - Input validation using `zod`.
