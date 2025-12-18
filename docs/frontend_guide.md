# CloudBox Frontend Guide

The frontend is a React application built with Vite, TypeScript, and Tailwind CSS.

---

## Project Structure

```
frontend/src/
├── App.tsx              # Main app with routing
├── main.tsx             # Entry point
├── i18n.ts              # Internationalization config
├── index.css            # Global styles & Tailwind
├── components/          # Reusable components
│   ├── ui/              # Generic UI components
│   ├── files/           # File-related components
│   ├── gallery/         # Photo gallery components
│   ├── modals/          # Modal dialogs
│   └── ...              # Feature components
├── pages/               # Route components
│   ├── auth/            # Login, Register, etc.
│   ├── admin/           # Admin dashboard
│   └── public/          # Public pages
├── stores/              # Zustand state stores
├── layouts/             # Page layouts
├── lib/                 # Utilities & API client
├── hooks/               # Custom React hooks
├── locales/             # Translation files
└── types/               # TypeScript definitions
```

---

## State Management (Zustand)

CloudBox uses [Zustand](https://github.com/pmndrs/zustand) for global state management.

### Available Stores

| Store | Purpose | Persisted |
|-------|---------|-----------|
| `authStore` | User authentication & session | Partial |
| `fileStore` | File selection, view mode, clipboard | Preferences only |
| `uploadStore` | Upload queue and progress | No |
| `musicStore` | Music player state | No |
| `themeStore` | Dark/light mode | Yes |
| `brandingStore` | Custom logos and colors | Cache |
| `dragDropStore` | Drag & drop state | No |
| `sidebarStore` | Sidebar collapsed state | Yes |
| `globalProgressStore` | Background task progress | No |
| `uiStore` | General UI state | No |

### Usage Examples

**In React Components:**
```tsx
import { useAuthStore } from '../stores/authStore';
import { useFileStore } from '../stores/fileStore';

function MyComponent() {
  // Subscribe to state changes
  const { user, isAuthenticated, logout } = useAuthStore();
  const { selectedItems, clearSelection } = useFileStore();
  
  return (
    <div>
      {isAuthenticated && <p>Welcome, {user?.name}</p>}
      <button onClick={clearSelection}>Clear Selection</button>
    </div>
  );
}
```

**Outside React (e.g., API interceptors):**
```tsx
import { useAuthStore } from '../stores/authStore';

// Get current state
const token = localStorage.getItem('accessToken');
const user = useAuthStore.getState().user;

// Update state
useAuthStore.getState().logout();
```

### Store Details

#### authStore
```typescript
interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}
```

#### fileStore
```typescript
interface FileState {
  selectedItems: Set<string>;
  viewMode: 'grid' | 'list';
  sortBy: 'name' | 'date' | 'size' | 'type';
  sortOrder: 'asc' | 'desc';
  clipboard: { items: FileItem[]; operation: 'copy' | 'cut' | null };
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;
}
```

#### musicStore
```typescript
interface MusicState {
  isPlaying: boolean;
  currentTrack: FileItem | null;
  queue: FileItem[];
  volume: number;
  progress: number;
  play: (track: FileItem, queue?: FileItem[]) => void;
  pause: () => void;
  next: () => void;
  previous: () => void;
}
```

---

## UI Components

### Generic Components (`components/ui/`)

| Component | Description |
|-----------|-------------|
| `Button` | Primary, secondary, ghost variants |
| `Input` | Form input with validation states |
| `Checkbox` | Styled checkbox |
| `Modal` | Base modal with Framer Motion |
| `ConfirmModal` | Confirmation dialog |
| `Toast` | Toast notifications |
| `Tooltip` | Hover tooltips |
| `Dropdown` | Dropdown menu |
| `ContextMenu` | Right-click context menu |
| `Tabs` | Tab navigation |
| `Progress` | Progress bar |
| `Skeleton` | Loading skeletons |
| `GlobalProgressIndicator` | Background task indicator |
| `PasswordStrength` | Password strength meter |
| `KeyboardShortcutsModal` | Keyboard shortcuts help |

### Using Components

```tsx
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Toast } from '../components/ui/Toast';

<Button variant="primary" onClick={handleClick}>
  Save Changes
</Button>

<Modal isOpen={showModal} onClose={() => setShowModal(false)}>
  <h2>Modal Title</h2>
  <p>Modal content</p>
</Modal>
```

---

## Pages

### Main Pages

| Page | Route | Description |
|------|-------|-------------|
| `Dashboard` | `/` | Home with recent files & stats |
| `Files` | `/files/:folderId?` | File browser |
| `Photos` | `/photos` | Photo gallery |
| `Music` | `/music` | Music library |
| `Documents` | `/documents` | Document viewer |
| `Favorites` | `/favorites` | Starred items |
| `Shared` | `/shared` | Shared with me |
| `Trash` | `/trash` | Deleted items |
| `Albums` | `/albums/:albumId?` | Photo albums |
| `Settings` | `/settings` | User settings |

### Auth Pages (`pages/auth/`)

| Page | Route |
|------|-------|
| `Login` | `/login` |
| `Register` | `/register` |
| `ForgotPassword` | `/forgot-password` |
| `ResetPassword` | `/reset-password/:token` |
| `VerifyEmail` | `/verify-email/:token` |

### Admin Pages (`pages/admin/`)

| Page | Route |
|------|-------|
| `AdminDashboard` | `/admin` |
| `AdminUsers` | `/admin/users` |

---

## Layouts

### MainLayout
Standard layout with sidebar, header, and content area.

```tsx
<MainLayout>
  <Files />
</MainLayout>
```

### AuthLayout
Centered box for authentication pages.

```tsx
<AuthLayout>
  <Login />
</AuthLayout>
```

### LegalLayout
Layout for legal pages (terms, privacy).

---

## Routing

### Protected Routes

```tsx
// Requires authentication
<ProtectedRoute>
  <Dashboard />
</ProtectedRoute>

// Requires admin role
<AdminRoute>
  <AdminDashboard />
</AdminRoute>
```

### Route Configuration

Routes are defined in `App.tsx`:

```tsx
<Routes>
  <Route path="/login" element={<Login />} />
  <Route path="/register" element={<Register />} />
  
  <Route element={<ProtectedRoute />}>
    <Route path="/" element={<Dashboard />} />
    <Route path="/files/:folderId?" element={<Files />} />
    {/* ... */}
  </Route>
  
  <Route element={<AdminRoute />}>
    <Route path="/admin" element={<AdminDashboard />} />
  </Route>
</Routes>
```

---

## Styling

### Tailwind CSS

Utility-first styling with custom configuration:

```tsx
<div className="flex items-center gap-4 p-4 bg-white dark:bg-dark-800 rounded-xl shadow-sm">
  <span className="text-dark-900 dark:text-dark-100">Content</span>
</div>
```

### Dark Mode

Toggle via `themeStore`, applies `dark` class to `<html>`:

```tsx
const { isDark, toggleTheme } = useThemeStore();

// Using dark variants
<div className="bg-white dark:bg-dark-900">
  <span className="text-gray-800 dark:text-gray-200">Text</span>
</div>
```

### CSS Classes (from `index.css`)

```css
.btn-primary    /* Red CTA button */
.btn-secondary  /* Gray secondary button */
.btn-ghost      /* Transparent hover button */
.card           /* Card with shadow */
.input          /* Form input */
.sidebar-link   /* Navigation link */
.file-card      /* Selectable file/folder */
.dropdown       /* Dropdown menu */
```

### Using `cn()` Helper

```tsx
import { cn } from '../lib/utils';

<div className={cn(
  'base-class',
  isActive && 'active-class',
  isDisabled && 'opacity-50 cursor-not-allowed'
)}>
```

---

## API Calls

### Using the API Client

```tsx
import api from '../lib/api';

// GET request
const { data } = await api.get('/files');

// POST request
const response = await api.post('/folders', { name: 'New Folder' });

// With error handling
try {
  await api.delete(`/files/${fileId}`);
} catch (error) {
  if (error.response?.status === 404) {
    // Handle not found
  }
}
```

### React Query Integration

```tsx
import { useQuery, useMutation } from '@tanstack/react-query';

// Fetching data
const { data, isLoading } = useQuery({
  queryKey: ['files', folderId],
  queryFn: () => api.get(`/files?folderId=${folderId}`),
});

// Mutations
const deleteMutation = useMutation({
  mutationFn: (id: string) => api.delete(`/files/${id}`),
  onSuccess: () => queryClient.invalidateQueries(['files']),
});
```

---

## Uploads

### Chunked Upload

```tsx
import { uploadFile } from '../lib/chunkedUpload';

const onUpload = async (file: File, folderId?: string) => {
  const result = await uploadFile(file, {
    folderId,
    onProgress: (progress) => {
      setProgress(progress);
    },
  });
  return result;
};
```

### Drag & Drop

```tsx
import { useDropzone } from 'react-dropzone';

const { getRootProps, getInputProps, isDragActive } = useDropzone({
  onDrop: handleFileDrop,
  noClick: true,
});
```

---

## Internationalization

See [i18n.md](./i18n.md) for complete documentation.

```tsx
import { useTranslation } from 'react-i18next';

const { t } = useTranslation();

<button>{t('common.save')}</button>
<p>{t('files.uploadSuccess', { count: 5 })}</p>
```

---

## Development Workflow

### Adding a New Component

1. Create file in appropriate directory
2. Export from component
3. Use Tailwind for styling
4. Add to index file if needed

### Adding a New Page

1. Create page in `pages/`
2. Add route in `App.tsx`
3. Add translations in all locales
4. Update navigation if needed

### Adding a New Store

```tsx
// stores/myStore.ts
import { create } from 'zustand';

interface MyState {
  value: string;
  setValue: (v: string) => void;
}

export const useMyStore = create<MyState>((set) => ({
  value: '',
  setValue: (value) => set({ value }),
}));
```

---

## Key Libraries

| Library | Purpose |
|---------|---------|
| React 18 | UI framework |
| Vite | Build tool |
| TypeScript | Type safety |
| Tailwind CSS | Styling |
| Zustand | State management |
| React Query | Server state |
| React Router v6 | Routing |
| Framer Motion | Animations |
| react-i18next | Internationalization |
| react-dropzone | File drag & drop |
| Lucide React | Icons |
