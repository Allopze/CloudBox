import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, lazy, Suspense } from 'react';
import { useAuthStore } from './stores/authStore';
import { useThemeStore } from './stores/themeStore';
import { useBrandingStore } from './stores/brandingStore';
import { useFileIconStore } from './stores/fileIconStore';
import { preloadUploadConfig } from './lib/chunkedUpload';
import ErrorBoundary from './components/ErrorBoundary';

// Layouts
import MainLayout from './layouts/MainLayout';
import AuthLayout from './layouts/AuthLayout';
import LegalLayout from './layouts/LegalLayout';

// Auth pages (can be lazy since not needed immediately for logged-in users)
const Login = lazy(() => import('./pages/auth/Login'));
const Register = lazy(() => import('./pages/auth/Register'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'));
const VerifyEmail = lazy(() => import('./pages/auth/VerifyEmail'));

// Main pages - Dashboard and Files are loaded eagerly (most used)
import Dashboard from './pages/Dashboard';
import Files from './pages/Files';

// Secondary pages (lazy-loaded)
const Favorites = lazy(() => import('./pages/Favorites'));
const Shared = lazy(() => import('./pages/Shared'));
const Trash = lazy(() => import('./pages/Trash'));
const Documents = lazy(() => import('./pages/Documents'));
const Settings = lazy(() => import('./pages/Settings'));
const SearchResults = lazy(() => import('./pages/SearchResults'));

// Heavy pages (lazy-loaded)
const Photos = lazy(() => import('./pages/Photos'));
const Albums = lazy(() => import('./pages/Albums'));
const Music = lazy(() => import('./pages/Music'));

// Admin pages (lazy-loaded)
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminFileIcons = lazy(() => import('./pages/admin/AdminFileIcons'));

// Public pages (lazy since not part of main app flow)
const PublicShare = lazy(() => import('./pages/public/PublicShare'));
const LegalPage = lazy(() => import('./pages/public/LegalPage'));

// Components
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import GlobalProgressIndicator from './components/ui/GlobalProgressIndicator';
import { ToastContainer } from './components/ui/Toast';
import HamsterLoader from './components/ui/HamsterLoader';

// Heavy components (lazy-loaded)
const MusicPlayer = lazy(() => import('./components/MusicPlayer'));

// Loading fallback for lazy components
const PageLoader = () => (
  <div className="flex items-center justify-center h-full min-h-[200px]">
    <HamsterLoader />
  </div>
);

function App() {
  const { checkAuth, isAuthenticated, isLoading } = useAuthStore();
  const { isDark } = useThemeStore();
  const { loadBranding } = useBrandingStore();
  const { loadIcons } = useFileIconStore();

  useEffect(() => {
    const abortController = new AbortController();
    checkAuth(abortController.signal);
    loadBranding(abortController.signal);
    loadIcons(); // Load custom file icons

    // Performance: Preload upload config to avoid latency on first upload
    preloadUploadConfig();

    return () => {
      abortController.abort();
    };
  }, [checkAuth, loadBranding, loadIcons]);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  // Don't redirect while checking auth - wait for it to complete
  const shouldRedirectFromAuth = !isLoading && isAuthenticated;

  return (
    <ErrorBoundary>
      <Routes>
        {/* Public routes */}
        <Route path="/share/:token" element={<PublicShare />} />

        <Route element={<LegalLayout />}>
          <Route path="/privacy" element={<LegalPage />} />
          <Route path="/terms" element={<LegalPage />} />
        </Route>

        {/* Auth routes */}
        <Route element={<AuthLayout />}>
          <Route path="/login" element={shouldRedirectFromAuth ? <Navigate to="/" replace /> : <Suspense fallback={<PageLoader />}><Login /></Suspense>} />
          <Route path="/register" element={shouldRedirectFromAuth ? <Navigate to="/" replace /> : <Suspense fallback={<PageLoader />}><Register /></Suspense>} />
          <Route path="/forgot-password" element={<Suspense fallback={<PageLoader />}><ForgotPassword /></Suspense>} />
          <Route path="/reset-password/:token" element={<Suspense fallback={<PageLoader />}><ResetPassword /></Suspense>} />
          <Route path="/verify-email/:token" element={<Suspense fallback={<PageLoader />}><VerifyEmail /></Suspense>} />
        </Route>

        {/* Protected routes */}
        <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="files" element={<Files />} />
          <Route path="files/:folderId" element={<Files />} />
          <Route path="favorites" element={<Suspense fallback={<PageLoader />}><Favorites /></Suspense>} />
          <Route path="shared" element={<Suspense fallback={<PageLoader />}><Shared /></Suspense>} />
          <Route path="trash" element={<Suspense fallback={<PageLoader />}><Trash /></Suspense>} />
          <Route path="photos" element={<Suspense fallback={<PageLoader />}><Photos /></Suspense>} />
          <Route path="albums" element={<Suspense fallback={<PageLoader />}><Albums /></Suspense>} />
          <Route path="albums/:albumId" element={<Suspense fallback={<PageLoader />}><Albums /></Suspense>} />
          <Route path="music" element={<Suspense fallback={<PageLoader />}><Music /></Suspense>} />
          <Route path="documents" element={<Suspense fallback={<PageLoader />}><Documents /></Suspense>} />
          <Route path="search" element={<Suspense fallback={<PageLoader />}><SearchResults /></Suspense>} />

          <Route path="settings" element={<Suspense fallback={<PageLoader />}><Settings /></Suspense>} />

          {/* Admin routes */}
          <Route path="admin" element={<AdminRoute><Suspense fallback={<PageLoader />}><AdminDashboard /></Suspense></AdminRoute>} />
          <Route path="admin/users" element={<AdminRoute><Suspense fallback={<PageLoader />}><AdminUsers /></Suspense></AdminRoute>} />
          <Route path="admin/file-icons" element={<AdminRoute><Suspense fallback={<PageLoader />}><AdminFileIcons /></Suspense></AdminRoute>} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Global music player (lazy-loaded) */}
      <Suspense fallback={null}>
        <MusicPlayer />
      </Suspense>

      {/* Global progress indicator for mass operations */}
      <GlobalProgressIndicator />

      {/* Toast notifications */}
      <ToastContainer />
    </ErrorBoundary>
  );
}

export default App;
