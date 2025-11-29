import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from './stores/authStore';
import { useThemeStore } from './stores/themeStore';
import { useBrandingStore } from './stores/brandingStore';

// Layouts
import MainLayout from './layouts/MainLayout';
import AuthLayout from './layouts/AuthLayout';

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
import AdminSettings from './pages/admin/AdminSettings';

// Public pages
import PublicShare from './pages/public/PublicShare';

// Components
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import MusicPlayer from './components/MusicPlayer';

function App() {
  const { checkAuth, isAuthenticated } = useAuthStore();
  const { isDark } = useThemeStore();
  const { loadBranding } = useBrandingStore();

  useEffect(() => {
    checkAuth();
    loadBranding();
  }, [checkAuth, loadBranding]);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  return (
    <>
      <Routes>
        {/* Public routes */}
        <Route path="/share/:token" element={<PublicShare />} />

        {/* Auth routes */}
        <Route element={<AuthLayout />}>
          <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login />} />
          <Route path="/register" element={isAuthenticated ? <Navigate to="/" replace /> : <Register />} />
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
          <Route path="admin/settings" element={<AdminRoute><AdminSettings /></AdminRoute>} />
          <Route path="admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Global music player */}
      <MusicPlayer />
    </>
  );
}

export default App;
