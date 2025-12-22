# AGENTS.md - AI Coding Agent Instructions

## Quick Reference

```bash
npm run dev              # Start frontend (5000) + backend (3001)
npm run setup            # Install deps, generate Prisma, push DB, seed
cd backend && npm test   # Run Vitest tests
npm run db:studio        # Open Prisma Studio
```

## Architecture

Monorepo with Express.js backend (TypeScript, Prisma, Redis/Bull) and React frontend (Vite, Zustand, Tailwind).

**Data flows:**
- Uploads: `frontend/lib/chunkedUpload.ts` → `backend/routes/files.ts` → `backend/lib/storage.ts`
- Real-time: Backend Socket.io (`lib/socket.ts`) → Frontend (`lib/socket.ts`)
- Background: Bull queues for transcoding, thumbnails, document conversion

## Backend Conventions

**ESM imports require `.js` extension:**
```typescript
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
```

**Route pattern:**
```typescript
router.post('/endpoint', authenticate, validate(schema), async (req, res) => {
  const userId = req.user!.userId;
});
```

**Validation:** Zod schemas in `backend/src/schemas/index.ts`

**Database:** Prisma with UUID primary keys (`@db.Uuid`), BigInt for file sizes

## Frontend Conventions

**Zustand stores** (`frontend/src/stores/`):
```typescript
// In React components
const { user } = useAuthStore();
// Outside React
const items = useFileStore.getState().selectedItems;
```

**API calls:** Use `api` from `lib/api.ts`

**Styling:** Tailwind with `cn()` helper from `lib/utils.ts`

**Icons:** Lucide React only

**i18n:** Wrap strings in `t('key')` from react-i18next

## Visual Style Guide

### Color System
- **Primary:** Red palette (`primary-600: #dc2626`) - used for CTAs, active states, focus rings
- **Dark/Neutral:** Gray scale (`dark-100` to `dark-900`) - backgrounds, text, borders
- **Dark mode:** Toggle via `dark` class on `<html>`, uses `dark:` Tailwind variants

### Component Styling
```typescript
// Use cn() for conditional classes
import { cn } from '../lib/utils';
<div className={cn('base-class', isActive && 'active-class', isDark && 'dark:bg-dark-800')} />
```

### Design Tokens
| Element | Light Mode | Dark Mode |
|---------|------------|-----------|
| Background | `bg-white` | `bg-dark-900` |
| Card | `bg-white border` | `bg-dark-800 border` |
| Text primary | `text-dark-900` | `text-dark-100` |
| Text secondary | `text-dark-600` | `text-dark-400` |
| Border | `border-dark-200` | `border-dark-700` |

### Border Radius
- Buttons/Inputs: `rounded-lg` (8px) or `rounded-xl` (12px)
- Cards/Modals: `rounded-xl` (12px) to `rounded-2xl` (16px)
- Avatars/Thumbnails: `rounded-full` for circles

### Shadows & Effects
- Cards: `shadow-sm`, hover: `shadow-md`
- Modals: `shadow-2xl` with `backdrop-blur-sm` overlay
- Focus: `focus:ring-2 focus:ring-primary-500`

### Component Classes (from `index.css`)
```css
.btn-primary    /* Red CTA button */
.btn-secondary  /* Gray secondary button */
.btn-ghost      /* Transparent hover button */
.card           /* White/dark card with border */
.input          /* Form input with focus ring */
.sidebar-link   /* Navigation link with active state */
.file-card      /* Selectable file/folder card */
.dropdown       /* Floating menu */
```

### Animations
- `animate-spin-slow` - Slow rotation (3s)
- `animate-shimmer` - Loading skeleton effect
- `animate-breathing` - Subtle scale pulse
- Framer Motion for modals and transitions

## Key Files

| Purpose | Backend | Frontend |
|---------|---------|----------|
| Entry | `src/index.ts` | `src/App.tsx` |
| Config | `src/config/index.ts` | `vite.config.ts` |
| Auth | `middleware/auth.ts` | `stores/authStore.ts` |
| Files | `routes/files.ts` | `lib/chunkedUpload.ts` |
| Schemas | `schemas/index.ts` | `types/index.ts` |
