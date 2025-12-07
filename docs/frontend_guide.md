# CloudBox Frontend Guide

The frontend is a React application built with Vite, TypeScript, and Tailwind CSS.

## Project Structure (`frontend/src`)

- `components/`: Reusable UI components.
  - `ui/`: Generic atoms/molecules (Button, Input, Modal, Toast).
  - Feature-specific components (e.g., `FileCard.tsx`, `UploadModal.tsx`).
- `pages/`: Route components.
  - `auth/`: Login, Register, ForgotPassword.
  - `admin/`: Admin dashboard pages.
  - `Dashboard.tsx`, `Files.tsx`, `Photos.tsx`, etc.
- `stores/`: Zustand stores for global state.
  - `authStore.ts`: User session and authentication.
  - `themeStore.ts`: Dark/Light mode toggle.
  - `uploadStore.ts`: Upload queue and progress.
- `layouts/`: Page layouts.
  - `AuthLayout`: Centered box for auth pages.
  - `MainLayout`: Sidebar + Header + Content Area.
- `lib/`: Utility functions (api client, formatting helpers).

## Key Concepts

### State Management (Zustand)

We use Zustand for global state. It's lighter than Redux and easier to use than Context for complex state.
Example: `useAuthStore` manages `isAuthenticated`, `user`, and `token`.

### Styling

Tailwind CSS is used for utility-first styling.

- **Dark Mode**: Supported via `dark` class on `html` tag. `themeStore` persists preference.
- **Responsive**: Mobile-first approach using standard Tailwind breakpoints (`md`, `lg`).

### Routing

React Router v6 handles client-side routing.

- **Protected Routes**: `ProtectedRoute` wrapper checks `isAuthenticated` and redirects to login if false.
- **Admin Routes**: `AdminRoute` wrapper checks `user.role === 'ADMIN'`.

### Uploads

File uploads are handled in chunks using `uploadStore` and backend APIs.

- Drag and drop supported via `react-dropzone`.
- Progress is tracked globally in the UI.

## Development Workflow

1. **Add Component**: Create in `components/`, use Tailwind for specific styles.
2. **Add Page**: Create in `pages/`, register route in `App.tsx`.
3. **API Calls**: Add fetch function in `lib/api.ts` or component hooks, use React Query for caching.
