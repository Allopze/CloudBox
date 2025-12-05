import axios from 'axios';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // Required for httpOnly cookies
});

// Security: Generate signed URL for file access (preferred over query string tokens)
export const getSignedFileUrl = async (fileId: string, action: 'view' | 'download' | 'stream' | 'thumbnail' = 'view'): Promise<string> => {
  try {
    const response = await api.post(`/files/${fileId}/signed-url`, { action });
    return response.data.signedUrl;
  } catch (error) {
    console.error('Failed to get signed URL:', error);
    // Fallback to direct URL with Authorization header (for components that can set headers)
    return `${API_URL}/files/${fileId}/${action}`;
  }
};

// Security: For immediate use (e.g., img src, audio src), use this with Authorization header
// Note: This returns a URL that requires Authorization header, not usable in img/audio src directly
export const getFileUrl = (pathOrFileId: string, endpoint?: 'view' | 'stream' | 'download' | 'thumbnail', includeToken: boolean = false) => {
  // Security: Query string tokens are deprecated, use signed URLs instead
  // This function now returns URLs without tokens for backward compatibility
  // Components should migrate to using getSignedFileUrl for direct browser access

  // Check if it's the old format (starts with /files/)
  if (pathOrFileId.startsWith('/files/')) {
    return `${API_URL}${pathOrFileId}`;
  }
  
  // New format: just fileId and endpoint type
  const endpointPath = endpoint || 'view';
  return `${API_URL}/files/${pathOrFileId}/${endpointPath}`;
};

// Request interceptor for auth token
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
