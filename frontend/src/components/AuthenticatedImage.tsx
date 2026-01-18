import { useState, useEffect, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { cn } from '../lib/utils';

const MAX_OBJECT_URLS = 200;
const objectUrlCache = new Map<string, string>();

const getCachedObjectUrl = (key: string): string | null => {
  const cached = objectUrlCache.get(key) || null;
  if (cached) {
    objectUrlCache.delete(key);
    objectUrlCache.set(key, cached);
  }
  return cached;
};

const setCachedObjectUrl = (key: string, url: string): void => {
  const existing = objectUrlCache.get(key);
  if (existing && existing !== url) {
    URL.revokeObjectURL(existing);
  }
  objectUrlCache.delete(key);
  objectUrlCache.set(key, url);

  if (objectUrlCache.size > MAX_OBJECT_URLS) {
    const oldestKey = objectUrlCache.keys().next().value as string | undefined;
    if (oldestKey) {
      const oldestUrl = objectUrlCache.get(oldestKey);
      if (oldestUrl) {
        URL.revokeObjectURL(oldestUrl);
      }
      objectUrlCache.delete(oldestKey);
    }
  }
};

interface AuthenticatedImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  fileId: string;
  endpoint?: 'view' | 'thumbnail';
  fallback?: React.ReactNode;
  placeholderSrc?: string | null;
}

/**
 * Security: Image component that loads images via fetch with Authorization header
 * instead of exposing tokens in URL query strings.
 * 
 * For public/shared files, use regular img with getFileUrl instead.
 */
function AuthenticatedImage({
  fileId,
  endpoint = 'view',
  fallback,
  placeholderSrc,
  alt,
  ...props
}: AuthenticatedImageProps) {
  const { t } = useTranslation();
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const cacheKey = `${fileId}:${endpoint}`;

    const loadImage = async () => {
      try {
        setLoading(true);
        setError(false);

        const cached = getCachedObjectUrl(cacheKey);
        if (cached) {
          if (isMounted) {
            setObjectUrl(cached);
            setLoading(false);
          }
          return;
        }

        const response = await api.get(`/files/${fileId}/${endpoint}`, {
          responseType: 'blob',
        });

        if (!isMounted) return;

        const url = URL.createObjectURL(response.data);
        setCachedObjectUrl(cacheKey, url);
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
    };
  }, [fileId, endpoint]);

  if (loading) {
    if (placeholderSrc) {
      return (
        <img
          src={placeholderSrc}
          alt={alt}
          {...props}
          className={cn('blur-sm scale-105', props.className)}
        />
      );
    }

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
        <span className="text-xs">{t('common.errorShort')}</span>
      </div>
    );
  }

  return <img src={objectUrl} alt={alt} {...props} />;
}

export default memo(AuthenticatedImage);

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
    const cacheKey = `${fileId}:${endpoint}`;

    const loadUrl = async () => {
      setLoading(true);
      setError(null);

      try {
        const cached = getCachedObjectUrl(cacheKey);
        if (cached) {
          setUrl(cached);
          setLoading(false);
          return;
        }

        const response = await api.get(`/files/${fileId}/${endpoint}`, {
          responseType: 'blob',
        });

        if (!isMounted) return;

        const objectUrl = URL.createObjectURL(response.data);
        setCachedObjectUrl(cacheKey, objectUrl);
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
    };
  }, [fileId, endpoint]);

  return { url, loading, error };
}
