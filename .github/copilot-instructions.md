# CloudBox AI Coding Instructions

## Architecture Overview

CloudBox is a self-hosted cloud storage platform with a monorepo structure:
- **Backend** (`backend/`): Express.js REST API with TypeScript, PostgreSQL via Prisma, Redis for job queues
- **Frontend** (`frontend/`): React 18 SPA with Vite, Zustand state management, Tailwind CSS

### Key Data Flows
1. **File uploads**: Frontend (`lib/chunkedUpload.ts`) → Backend (`routes/files.ts`) → Storage (`lib/storage.ts`)
2. **Real-time updates**: Backend emits via Socket.io (`lib/socket.ts`) → Frontend subscribes (`lib/socket.ts`)
3. **Background jobs**: Bull queues (transcoding, thumbnails, document conversion) process media asynchronously

## Commands

```bash
npm run dev              # Start both frontend (5173) and backend (3001)
npm run setup            # Full setup: install deps, generate Prisma, push DB, seed
npm run db:studio        # Open Prisma Studio GUI
cd backend && npm test   # Run Vitest tests
```

## Backend Patterns

### Route Structure
Routes are in `backend/src/routes/`. Each route file follows this pattern:
```typescript
import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { someSchema } from '../schemas/index.js';

const router = Router();
router.post('/endpoint', authenticate, validate(someSchema), async (req, res) => {
  const userId = req.user!.userId;  // Available after authenticate middleware
  // ...
});
```

### Validation with Zod
All input validation schemas are in `backend/src/schemas/index.ts`. Use the `validate` middleware:
```typescript
export const createFolderSchema = z.object({
  body: z.object({ name: z.string().min(1).max(255), parentId: z.string().uuid().optional() }),
});
```

### Database Access
Use Prisma via `import prisma from '../lib/prisma.js'`. All models use UUID primary keys with `@db.Uuid`. Key models: `User`, `File`, `Folder`, `Share`, `Album`.

### Background Jobs
Use Bull queues for CPU-intensive tasks. See `lib/transcodingQueue.ts`, `lib/thumbnailQueue.ts`. Jobs emit Socket.io events for progress:
```typescript
emitTranscodingProgress(userId, { fileId, progress, status });
```

## Frontend Patterns

### State Management with Zustand
Stores are in `frontend/src/stores/`. Access patterns:
```typescript
// In components
const { user, logout } = useAuthStore();
const { selectedItems, clearSelection } = useFileStore();

// Outside React (event handlers, callbacks)
const items = useFileStore.getState().selectedItems;
```

### API Calls
Use the configured axios instance from `lib/api.ts`:
```typescript
import { api } from '../lib/api';
const response = await api.post('/files/upload', formData);
```

### UI Components
- Base components in `components/ui/`: `Button`, `Modal`, `Input`, `Toast`
- Feature modals in `components/modals/`: `ShareModal`, `CompressModal`, etc.
- Use `cn()` from `lib/utils.ts` for conditional Tailwind classes: `cn('base-class', condition && 'conditional-class')`

### Icons
Use Lucide React consistently: `import { FolderIcon, FileIcon } from 'lucide-react'`

## Critical Conventions

1. **ESM Imports**: Backend uses `.js` extensions in imports (e.g., `from '../lib/prisma.js'`) despite TypeScript sources
2. **Auth Token Flow**: Access token in localStorage, refresh token in httpOnly cookie
3. **File IDs are UUIDs**: Always validate with `isValidUUID()` before database queries
4. **BigInt for sizes**: Storage quotas and file sizes use `BigInt` in Prisma schema
5. **i18n**: Frontend uses react-i18next; wrap user-facing strings in `t('key')`

## Testing

Backend tests use Vitest in `backend/src/__tests__/`. Integration tests expect a running server:
```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
// Tests authenticate, create resources, then clean up
```

## Environment Variables

Key variables (see `backend/src/config/index.ts`):
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_HOST`, `REDIS_PORT`: For Bull job queues
- `JWT_SECRET`, `JWT_REFRESH_SECRET`: Must be set in production
- `STORAGE_PATH`: File storage location (default: `./data`)
