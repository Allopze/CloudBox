import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from './stores/authStore';
import { useThemeStore } from './stores/themeStore';
import { useBrandingStore } from './stores/brandingStore';
import ErrorBoundary from './components/ErrorBoundary';

// Layouts
import MainLayout from './layouts/MainLayout';
import AuthLayout from './layouts/AuthLayout';
import LegalLayout from './layouts/LegalLayout';

// Auth pages
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';
import VerifyEmail from './pages/auth/VerifyEmail';

// Main pages
import Dashboard from './pages/Dashboard';
import Files from './pages/Files';
import Favorites from './pages/Favorites';
import Shared from './pages/Shared';
import Trash from './pages/Trash';
import Photos from './pages/Photos';
import Albums from './pages/Albums';
import Music from './pages/Music';
import Documents from './pages/Documents';
import Settings from './pages/Settings';


// Admin pages
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';

// Public pages
import PublicShare from './pages/public/PublicShare';
import LegalPage from './pages/public/LegalPage';

// Components
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import MusicPlayer from './components/MusicPlayer';
import GlobalProgressIndicator from './components/ui/GlobalProgressIndicator';
import { ToastContainer } from './components/ui/Toast';

function App() {
  const { checkAuth, isAuthenticated, isLoading } = useAuthStore();
  const { isDark } = useThemeStore();
  const { loadBranding } = useBrandingStore();

  useEffect(() => {
    const abortController = new AbortController();
    checkAuth(abortController.signal);
    loadBranding(abortController.signal);

    return () => {
      abortController.abort();
    };
  }, [checkAuth, loadBranding]);

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
          <Route path="/login" element={shouldRedirectFromAuth ? <Navigate to="/" replace /> : <Login />} />
          <Route path="/register" element={shouldRedirectFromAuth ? <Navigate to="/" replace /> : <Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />
          <Route path="/verify-email/:token" element={<VerifyEmail />} />
        </Route>

        {/* Protected routes */}
        <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="files" element={<Files />} />
          <Route path="files/:folderId" element={<Files />} />
          <Route path="favorites" element={<Favorites />} />
          <Route path="shared" element={<Shared />} />
          <Route path="trash" element={<Trash />} />
          <Route path="photos" element={<Photos />} />
          <Route path="albums" element={<Albums />} />
          <Route path="albums/:albumId" element={<Albums />} />
          <Route path="music" element={<Music />} />
          <Route path="documents" element={<Documents />} />

          <Route path="settings" element={<Settings />} />

          {/* Admin routes */}
          <Route path="admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
          <Route path="admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Global music player */}
      <MusicPlayer />

      {/* Global progress indicator for mass operations */}
      <GlobalProgressIndicator />

      {/* Toast notifications */}
      <ToastContainer />
    </ErrorBoundary>
  );
}

export default App;
