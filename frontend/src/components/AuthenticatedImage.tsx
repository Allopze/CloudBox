import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { cn } from '../lib/utils';

interface AuthenticatedImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  fileId: string;
  endpoint?: 'view' | 'thumbnail';
  fallback?: React.ReactNode;
}

/**
 * Security: Image component that loads images via fetch with Authorization header
 * instead of exposing tokens in URL query strings.
 * 
 * For public/shared files, use regular img with getFileUrl instead.
 */
export default function AuthenticatedImage({ 
  fileId, 
  endpoint = 'view',
  fallback,
  alt,
  ...props 
}: AuthenticatedImageProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let url: string | null = null;

    const loadImage = async () => {
      try {
        setLoading(true);
        setError(false);

        const response = await api.get(`/files/${fileId}/${endpoint}`, {
          responseType: 'blob',
        });

        if (!isMounted) return;

        url = URL.createObjectURL(response.data);
        setObjectUrl(url);
      } catch (err) {
        if (!isMounted) return;
        console.error('Failed to load authenticated image:', err);
        setError(true);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadImage();

    return () => {
      isMounted = false;
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [fileId, endpoint]);

  if (loading) {
    return fallback ? <>{fallback}</> : (
      <div
        className={cn('animate-pulse bg-gray-200 dark:bg-gray-700', props.className)}
        style={{ width: props.width, height: props.height }}
      />
    );
  }

  if (error || !objectUrl) {
    return fallback ? <>{fallback}</> : (
      <div
        className={cn('flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-400', props.className)}
        style={{ width: props.width, height: props.height }}
      >
        <span className="text-xs">Error</span>
      </div>
    );
  }

  return <img src={objectUrl} alt={alt} {...props} />;
}

/**
 * Hook for loading authenticated file URLs
 * Returns an object URL that must be revoked when no longer needed
 */
export function useAuthenticatedUrl(fileId: string | null, endpoint: 'view' | 'thumbnail' | 'stream' | 'download' = 'view') {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!fileId) {
      setUrl(null);
      return;
    }

    let isMounted = true;
    let objectUrl: string | null = null;

    const loadUrl = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await api.get(`/files/${fileId}/${endpoint}`, {
          responseType: 'blob',
        });

        if (!isMounted) return;

        objectUrl = URL.createObjectURL(response.data);
        setUrl(objectUrl);
      } catch (err) {
        if (!isMounted) return;
        setError(err as Error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadUrl();

    return () => {
      isMounted = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [fileId, endpoint]);

  return { url, loading, error };
}
