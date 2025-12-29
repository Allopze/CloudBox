import axios from 'axios';
import { getAccessToken, setAccessToken, clearAccessToken, migrateFromLocalStorage } from './tokenManager';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // Required for httpOnly cookies
});

// SECURITY FIX P0-1: Migrate any existing token from localStorage to memory on module load
migrateFromLocalStorage();

/**
 * ============================================================================
 * SECURITY NOTE: Token Storage Strategy
 * ============================================================================
 * 
 * CURRENT STATE (SECURITY FIX P0-1 APPLIED):
 * - Access tokens are stored in MEMORY (not localStorage) to prevent XSS theft
 * - Refresh tokens are stored in httpOnly cookies (secure)
 * - On page refresh, a silent refresh obtains a new access token
 * 
 * SECURITY IMPROVEMENTS:
 * 1. Access tokens are short-lived (15 minutes)
 * 2. Access tokens are stored in memory (not accessible via XSS to localStorage)
 * 3. Refresh tokens are stored in httpOnly cookies (not accessible to JS)
 * 4. CSP headers restrict script sources to prevent most XSS
 * 5. Input sanitization on user-generated content
 * 
 * TRADE-OFFS:
 * - On page refresh, a silent refresh is performed to get a new token
 * - Multiple tabs each get their own token via refresh
 * - This is more secure than localStorage storage
 * 
 * ============================================================================
 */

// Security: Request file access and receive a direct URL (cookie-based auth)
export const getSignedFileUrl = async (fileId: string, action: 'view' | 'download' | 'stream' | 'thumbnail' = 'view'): Promise<string> => {
  const response = await api.post(`/files/${fileId}/signed-url`, { action });
  return response.data.signedUrl;
};

// Open signed URL in a new tab or trigger download.
// For 'download' action, uses an invisible anchor to avoid leaving about:blank tabs open.
// For 'view'/'stream', opens in new tab as before.
export const openSignedFileUrl = async (
  fileId: string,
  action: 'view' | 'download' | 'stream' | 'thumbnail' = 'view',
  target: string = '_blank'
): Promise<void> => {
  try {
    const url = await getSignedFileUrl(fileId, action);

    if (action === 'download') {
      // Use invisible anchor for downloads - doesn't leave a blank tab open
      const link = document.createElement('a');
      link.href = url;
      link.download = ''; // Browser will use filename from Content-Disposition
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      // For view/stream, open in new tab
      // Use synchronous window.open first to avoid popup blockers
      const win = window.open('about:blank', target, 'noopener,noreferrer');
      if (win) {
        win.opener = null;
        win.location.href = url;
      } else {
        window.location.href = url;
      }
    }
  } catch (error) {
    console.error('Failed to open signed URL:', error);
  }
};

// Security: For immediate use (e.g., img src, audio src), use this with Authorization header
// Note: This returns a URL that requires Authorization header, not usable in img/audio src directly
export const getFileUrl = (pathOrFileId: string, endpoint?: 'view' | 'stream' | 'download' | 'thumbnail') => {
  // SECURITY: Do not put auth tokens in URLs.
  // For direct browser access (img/audio/video/window.open), use getSignedFileUrl().

  // Check if it's the old format (starts with /files/)
  let url = '';
  if (pathOrFileId.startsWith('/files/')) {
    url = `${API_URL}${pathOrFileId}`;
  } else {
    // New format: just fileId and endpoint type
    const endpointPath = endpoint || 'view';
    url = `${API_URL}/files/${pathOrFileId}/${endpointPath}`;
  }

  return url;
};

/**
 * Request interceptor for auth token
 * 
 * SECURITY FIX P0-1: Access token is retrieved from memory (not localStorage).
 * This prevents XSS attacks from stealing the token via localStorage access.
 */
api.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for token refresh
let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (error: any) => void }> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Issue #26: Better handling of network errors vs server errors
    if (!error.response) {
      // Network error (no response from server)
      const networkError = new Error('Error de conexión. Por favor verifica tu conexión a internet.');
      (networkError as any).isNetworkError = true;
      (networkError as any).originalError = error;
      return Promise.reject(networkError);
    }

    const originalRequest = error.config;
    const requestUrl = (typeof originalRequest?.url === 'string' ? originalRequest.url : '') || '';
    const isAuthRequest =
      requestUrl.includes('/auth/login') ||
      requestUrl.includes('/auth/register') ||
      requestUrl.includes('/auth/google') ||
      requestUrl.includes('/auth/refresh') ||
      requestUrl.includes('/auth/logout');

    if (error.response?.status === 401 && !originalRequest._retry) {
      // Never try to refresh tokens for auth endpoints (prevents login/register errors from being swallowed).
      if (isAuthRequest) {
        return Promise.reject(error);
      }

      const token = getAccessToken();
      // If there's no access token, don't attempt refresh; let callers handle the 401.
      if (!token) {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // Wait for the refresh to complete
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Security: Refresh token is now sent via httpOnly cookie automatically
        // No need to send it in the request body
        const response = await axios.post(
          `${API_URL}/auth/refresh`,
          {}, // Empty body - refresh token comes from cookie
          { withCredentials: true } // Required for cookies
        );

        const { accessToken } = response.data;

        setAccessToken(accessToken);
        // SECURITY FIX P0-1: Token stored in memory, not localStorage

        processQueue(null, accessToken);

        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearAccessToken();
        // Note: refreshToken cookie is cleared by the server
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// Pre-validation for upload files
export interface UploadValidationResult {
  valid: boolean;
  files: Array<{
    name: string;
    valid: boolean;
    error?: string;
    errorCode?: string;
  }>;
  quota: {
    used: number;
    total: number;
    remaining: number;
    maxFileSize: number;
  };
  totalSize: number;
  quotaExceeded: boolean;
}

export const validateUploadFiles = async (
  files: Array<{ name: string; size: number; type?: string }>,
  folderId?: string | null
): Promise<UploadValidationResult> => {
  const response = await api.post('/files/upload/validate', { files, folderId });
  return response.data;
};

export default api;
