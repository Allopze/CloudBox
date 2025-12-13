import axios from 'axios';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // Required for httpOnly cookies
});

/**
 * ============================================================================
 * SECURITY NOTE: Token Storage Strategy
 * ============================================================================
 * 
 * CURRENT STATE:
 * - Access tokens are stored in localStorage for simplicity
 * - Refresh tokens are stored in httpOnly cookies (secure)
 * 
 * SECURITY CONCERN:
 * localStorage is accessible to JavaScript, making it vulnerable to XSS attacks.
 * If an attacker injects malicious JavaScript (XSS), they could steal the access token.
 * 
 * MITIGATIONS IN PLACE:
 * 1. Access tokens are short-lived (typically 15 minutes)
 * 2. Refresh tokens are stored in httpOnly cookies (not accessible to JS)
 * 3. CSP headers restrict script sources to prevent most XSS
 * 4. Input sanitization on user-generated content
 * 
 * RECOMMENDED IMPROVEMENTS FOR PRODUCTION:
 * 
 * Option A: Full httpOnly Cookie Approach (Recommended)
 * - Move access token to httpOnly cookie as well
 * - Server sets both tokens in httpOnly cookies
 * - Frontend never handles tokens directly
 * - Requires CSRF protection (double-submit cookie pattern)
 * - Pros: Most secure against XSS
 * - Cons: Requires CSRF token handling, slightly more complex
 * 
 * Option B: BFF (Backend For Frontend) Pattern
 * - Create a dedicated BFF service that handles authentication
 * - Frontend only communicates with BFF
 * - BFF stores tokens in httpOnly cookies
 * - Pros: Clean separation, works well with SSR
 * - Cons: Additional service to maintain
 * 
 * Option C: Memory + Silent Refresh (Partial Improvement)
 * - Store access token in memory only (not localStorage)
 * - On page load, use refresh token cookie to get new access token
 * - Pros: Token not persisted, slightly safer
 * - Cons: Still vulnerable during session, requires page reload handling
 * 
 * ADDITIONAL SECURITY MEASURES:
 * - Implement strict Content Security Policy (CSP) - DONE
 * - Use SameSite=Strict for cookies - DONE (refresh token)
 * - Enable HTTPS only in production - DONE (HSTS header)
 * - Implement token rotation on refresh
 * - Add device fingerprinting for suspicious activity detection
 * 
 * ============================================================================
 */

// Security: Generate signed URL for file access (preferred over query string tokens)
export const getSignedFileUrl = async (fileId: string, action: 'view' | 'download' | 'stream' | 'thumbnail' = 'view'): Promise<string> => {
  const response = await api.post(`/files/${fileId}/signed-url`, { action });
  return response.data.signedUrl;
};

// Open signed URL in a new tab without exposing tokens in URLs.
// Uses a synchronous window.open to reduce popup blocking, then navigates once the URL is resolved.
export const openSignedFileUrl = async (
  fileId: string,
  action: 'view' | 'download' | 'stream' | 'thumbnail' = 'view',
  target: string = '_blank'
): Promise<void> => {
  const win = window.open('about:blank', target, 'noopener,noreferrer');
  if (win) win.opener = null;

  try {
    const url = await getSignedFileUrl(fileId, action);
    if (win) {
      win.location.href = url;
    } else {
      window.location.href = url;
    }
  } catch (error) {
    if (win) win.close();
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
 * SECURITY: Access token is retrieved from localStorage here.
 * See security notes above for recommended improvements.
 */
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
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

    if (error.response?.status === 401 && !originalRequest._retry) {
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

        localStorage.setItem('accessToken', accessToken);
        // Note: refreshToken is now in httpOnly cookie, not stored in localStorage

        processQueue(null, accessToken);

        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.removeItem('accessToken');
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
