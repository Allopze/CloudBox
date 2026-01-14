import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Download,
  Share2,
  Info,
  Keyboard,
  AlertTriangle,
  RefreshCw,
  Star,
  Move,
  Edit,
  Trash2,
  Link,
  Loader2
} from 'lucide-react';
import { FileItem } from '../../types';
import { getSignedFileUrl, api } from '../../lib/api';
import { cn } from '../../lib/utils';
import ImageCanvas from './MediaViewer/ImageCanvas';
import DetailsPanel from './MediaViewer/DetailsPanel';

interface ImageGalleryProps {
  images: FileItem[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
  onShare?: (file: FileItem) => void;
  onDownload?: (file: FileItem) => void;
  onFavorite?: (file: FileItem) => void;
  onMove?: (file: FileItem) => void;
  onRename?: (file: FileItem) => void;
  onDelete?: (file: FileItem) => void;
  onCopyLink?: (file: FileItem) => void;
}

// Check if an image format supports transparency
const supportsTransparency = (mimeType: string): boolean => {
  return mimeType === 'image/png' ||
    mimeType === 'image/svg+xml' ||
    mimeType === 'image/webp' ||
    mimeType === 'image/gif';
};

const PRELOAD_MAX_BYTES = 8 * 1024 * 1024;

// Analyze image to detect if it's dark with transparency
const analyzeImage = (img: HTMLImageElement, mimeType: string): boolean => {
  if (!supportsTransparency(mimeType)) return false;

  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;

    // Use smaller sample for performance (max 100x100)
    const maxSize = 100;
    const scale = Math.min(maxSize / img.naturalWidth, maxSize / img.naturalHeight, 1);
    canvas.width = Math.floor(img.naturalWidth * scale);
    canvas.height = Math.floor(img.naturalHeight * scale);

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    let darkPixels = 0;
    let transparentPixels = 0;
    let totalAnalyzedPixels = 0;

    // Sample every 4th pixel for better performance
    for (let i = 0; i < data.length; i += 16) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      totalAnalyzedPixels++;

      // Check for transparency (alpha < 200)
      if (a < 200) {
        transparentPixels++;
      }

      // Check if pixel is dark (brightness < 80 on 0-255 scale)
      // Using perceived luminance formula
      const brightness = (0.299 * r + 0.587 * g + 0.114 * b);
      if (brightness < 80 && a > 50) {
        darkPixels++;
      }
    }

    const transparencyRatio = transparentPixels / totalAnalyzedPixels;
    const darkRatio = darkPixels / (totalAnalyzedPixels - transparentPixels || 1);

    // Return true if image has significant transparency (>10%) and is mostly dark (>60%)
    return transparencyRatio > 0.1 && darkRatio > 0.6;
  } catch {
    return false;
  }
};

export default function ImageGallery({
  images,
  initialIndex = 0,
  isOpen,
  onClose,
  onShare,
  onDownload,
  onFavorite,
  onMove,
  onRename,
  onDelete,
  onCopyLink,
}: ImageGalleryProps) {
  const { t } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [needsLightBackground, setNeedsLightBackground] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const slideInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const controlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const titleId = useRef(`image-gallery-title-${Math.random().toString(36).slice(2)}`);
  const objectUrlCacheRef = useRef<Map<string, string>>(new Map());
  const preloadedIdsRef = useRef<Set<string>>(new Set());

  const currentImage = images[currentIndex];
  const shareId = (currentImage as any)?.shareId as string | undefined;

  // Auth state for signed URL
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadingSignedUrl, setLoadingSignedUrl] = useState(false);
  const revokeObjectUrls = useCallback(() => {
    for (const url of objectUrlCacheRef.current.values()) {
      URL.revokeObjectURL(url);
    }
    objectUrlCacheRef.current.clear();
    preloadedIdsRef.current.clear();
  }, []);

  const fetchObjectUrl = useCallback(async (file: FileItem) => {
    const cached = objectUrlCacheRef.current.get(file.id);
    if (cached) return cached;

    const response = shareId
      ? await api.get(`/shares/${shareId}/files/${file.id}/view`, { responseType: 'blob' })
      : await api.get(`/files/${file.id}/view`, { responseType: 'blob' });

    const url = URL.createObjectURL(response.data);
    objectUrlCacheRef.current.set(file.id, url);
    return url;
  }, [shareId]);

  const loadImageUrl = useCallback(async () => {
    if (!currentImage) return;

    setLoadingSignedUrl(true);
    setImageError(null);
    setIsLoading(true);
    setSignedUrl(null);
    try {
      const url = await fetchObjectUrl(currentImage);
      setSignedUrl(url);
    } catch (err) {
      console.error('Failed to get image URL', err);
      setSignedUrl(null);
      setImageError(t('gallery.imageError'));
    } finally {
      setLoadingSignedUrl(false);
    }
  }, [currentImage, fetchObjectUrl, t]);

  // Reset state when gallery opens
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
      setZoom(1);
      setPosition({ x: 0, y: 0 });
      setRotation(0);
      setIsPlaying(false);
      setShowControls(true);
      setNeedsLightBackground(false);
      setShowDetails(false);
      setShowShortcuts(false);
      setImageError(null);
      setIsLoading(true);
    }
  }, [isOpen, initialIndex, images.length]);

  // Slideshow functionality
  useEffect(() => {
    if (isPlaying && images.length > 1) {
      slideInterval.current = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % images.length);
      }, 3000);
    }

    return () => {
      if (slideInterval.current) {
        clearInterval(slideInterval.current);
      }
    };
  }, [isPlaying, images.length]);

  // Auto-hide controls
  const resetControlsTimeout = useCallback(() => {
    setShowControls(true);
    if (controlsTimeout.current) {
      clearTimeout(controlsTimeout.current);
    }
    if (showDetails || showShortcuts) return;
    controlsTimeout.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  }, [showDetails, showShortcuts]);

  useEffect(() => {
    if (showDetails || showShortcuts) {
      setShowControls(true);
    }
  }, [showDetails, showShortcuts]);

  useEffect(() => {
    if (isOpen) {
      resetControlsTimeout();
    }
  }, [isOpen, resetControlsTimeout]);

  useEffect(() => {
    return () => {
      if (controlsTimeout.current) {
        clearTimeout(controlsTimeout.current);
      }
    };
  }, []);

  const resetViewState = useCallback(() => {
    setIsLoading(true);
    setZoom(1);
    setPosition({ x: 0, y: 0 });
    setRotation(0);
    setNeedsLightBackground(false);
    setImageError(null);
    setSignedUrl(null);
  }, []);

  const goToPrevious = useCallback(() => {
    resetViewState();
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  }, [images.length, resetViewState]);

  const goToNext = useCallback(() => {
    resetViewState();
    setCurrentIndex((prev) => (prev + 1) % images.length);
  }, [images.length, resetViewState]);

  const toggleSlideshow = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 0.25, 5));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - 0.25, 0.25));
  }, []);

  const handleZoomReset = useCallback(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
    setRotation(0);
  }, []);

  const handleRotate = useCallback(() => {
    setRotation((prev) => (prev + 90) % 360);
  }, []);

  const handleMouseMove = () => {
    resetControlsTimeout();
  };

  const getFocusableElements = useCallback(() => {
    if (!dialogRef.current) return [];
    return Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
  }, []);

  const controlsVisible = showControls || showDetails || showShortcuts;

  // Keyboard navigation + focus trap
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && dialogRef.current && !dialogRef.current.contains(target)) {
        return;
      }

      resetControlsTimeout();

      if (e.key === 'Tab') {
        const focusable = getFocusableElements();
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
        return;
      }

      switch (e.key) {
        case 'Escape':
          if (showShortcuts) {
            setShowShortcuts(false);
          } else if (showDetails) {
            setShowDetails(false);
          } else {
            onClose();
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          goToPrevious();
          break;
        case 'ArrowRight':
          e.preventDefault();
          goToNext();
          break;
        case ' ':
          e.preventDefault();
          toggleSlideshow();
          break;
        case '+':
        case '=':
          e.preventDefault();
          handleZoomIn();
          break;
        case '-':
          e.preventDefault();
          handleZoomOut();
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          handleRotate();
          break;
        case '0':
          e.preventDefault();
          handleZoomReset();
          break;
        case 'i':
        case 'I':
          e.preventDefault();
          setShowDetails((prev) => !prev);
          break;
        case '?':
          e.preventDefault();
          setShowShortcuts((prev) => !prev);
          break;
        case '/':
          if (e.shiftKey) {
            e.preventDefault();
            setShowShortcuts((prev) => !prev);
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    isOpen,
    onClose,
    resetControlsTimeout,
    getFocusableElements,
    showShortcuts,
    showDetails,
    goToPrevious,
    goToNext,
    toggleSlideshow,
    handleZoomIn,
    handleZoomOut,
    handleRotate,
    handleZoomReset,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    previousActiveElement.current = document.activeElement as HTMLElement;
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(() => {
      const focusable = getFocusableElements();
      if (focusable.length > 0) {
        focusable[0].focus();
      } else {
        dialogRef.current?.focus();
      }
    });

    return () => {
      document.body.style.overflow = '';
      if (previousActiveElement.current) {
        previousActiveElement.current.focus();
      }
    };
  }, [isOpen, getFocusableElements]);

  const handleCopyLink = useCallback(async () => {
    if (!currentImage) return;
    if (onCopyLink) {
      onCopyLink(currentImage);
      return;
    }
    if (shareId) return;

    try {
      const url = await getSignedFileUrl(currentImage.id, 'view');
      await navigator.clipboard.writeText(url);
    } catch (err) {
      console.error('Failed to copy link', err);
    }
  }, [currentImage, onCopyLink, shareId]);

  const detailActions = useMemo(() => {
    if (!currentImage) return [];

    const actions = [];

    if (onFavorite) {
      actions.push({
        id: 'favorite',
        label: currentImage.isFavorite
          ? t('common.removeFromFavorites')
          : t('common.addToFavorites'),
        icon: Star,
        active: currentImage.isFavorite,
        onClick: () => onFavorite(currentImage),
      });
    }

    if (onMove) {
      actions.push({
        id: 'move',
        label: t('mediaViewer.moveTo'),
        icon: Move,
        onClick: () => onMove(currentImage),
      });
    }

    if (onRename) {
      actions.push({
        id: 'rename',
        label: t('common.rename'),
        icon: Edit,
        onClick: () => onRename(currentImage),
      });
    }

    if (onDelete) {
      actions.push({
        id: 'delete',
        label: t('common.delete'),
        icon: Trash2,
        danger: true,
        onClick: () => onDelete(currentImage),
      });
    }

    if (onCopyLink || !shareId) {
      actions.push({
        id: 'copy-link',
        label: t('mediaViewer.copyLink'),
        icon: Link,
        onClick: () => void handleCopyLink(),
      });
    }

    return actions;
  }, [currentImage, onFavorite, onMove, onRename, onDelete, onCopyLink, shareId, handleCopyLink, t]);

  const handleImageLoad = useCallback((img: HTMLImageElement) => {
    setIsLoading(false);
    setImageError(null);

    const mimeType = currentImage?.mimeType || '';
    const isDarkWithTransparency = analyzeImage(img, mimeType);
    setNeedsLightBackground(isDarkWithTransparency);
  }, [currentImage?.mimeType]);

  const handleImageError = useCallback(() => {
    setIsLoading(false);
    setImageError(t('gallery.imageError'));
  }, [t]);

  // Fetch signed URL when current image changes
  useEffect(() => {
    if (isOpen && currentImage) {
      void loadImageUrl();
    } else {
      revokeObjectUrls();
      setSignedUrl(null);
    }

    return () => {
      revokeObjectUrls();
    };
  }, [isOpen, currentImage, loadImageUrl, revokeObjectUrls]);

  const preloadImage = useCallback(async (file: FileItem) => {
    if (preloadedIdsRef.current.has(file.id)) return;

    try {
      const sizeBytes = Number(file.size);
      if (!Number.isNaN(sizeBytes) && sizeBytes > PRELOAD_MAX_BYTES) {
        preloadedIdsRef.current.add(file.id);
        return;
      }

      await fetchObjectUrl(file);
      preloadedIdsRef.current.add(file.id);
    } catch {
      // Ignore prefetch errors
    }
  }, [fetchObjectUrl]);

  useEffect(() => {
    if (!isOpen || !currentImage || shareId || images.length < 2) return;

    const prevIndex = (currentIndex - 1 + images.length) % images.length;
    const nextIndex = (currentIndex + 1) % images.length;

    void preloadImage(images[prevIndex]);
    void preloadImage(images[nextIndex]);
  }, [isOpen, currentImage, currentIndex, images, shareId, preloadImage]);

  const shortcutItems = useMemo(() => {
    const items = [
      { keys: ['Esc'], label: t('gallery.shortcutClose') },
      { keys: ['\u2190', '\u2192'], label: t('gallery.shortcutNavigate') },
      { keys: ['+', '-'], label: t('gallery.shortcutZoom') },
      { keys: ['0'], label: t('gallery.shortcutReset') },
      { keys: ['R'], label: t('gallery.shortcutRotate') },
      { keys: ['I'], label: t('gallery.shortcutDetails') },
      { keys: ['?'], label: t('gallery.shortcutHelp') },
    ];

    if (images.length > 1) {
      items.splice(2, 0, { keys: ['Space'], label: t('gallery.shortcutSlideshow') });
    }

    return items;
  }, [images.length, t]);

  if (!isOpen || !currentImage) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/95"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId.current}
        tabIndex={-1}
        className="absolute inset-0 outline-none"
        onMouseMove={handleMouseMove}
        onTouchStart={handleMouseMove}
      >
        <div
          className={cn(
            'relative w-full h-full flex items-center justify-center transition-colors duration-300',
            needsLightBackground && 'bg-white/20'
          )}
        >
          {/* Top bar */}
          <div
            className={cn(
              'absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent z-20 transition-opacity duration-300',
              controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
            )}
          >
            <div className="flex items-center justify-between max-w-screen-xl mx-auto gap-4">
              <div className="text-white min-w-0">
                <h3 id={titleId.current} className="font-medium truncate max-w-md">
                  {currentImage.name}
                </h3>
                <p className="text-sm text-gray-400">
                  {currentIndex + 1} / {images.length}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {images.length > 1 && (
                  <button
                    onClick={toggleSlideshow}
                    className={cn(
                      'p-2 rounded-lg transition-colors',
                      isPlaying
                        ? 'bg-primary-500 text-white'
                        : 'text-white/80 hover:text-white hover:bg-white/10'
                    )}
                    title={isPlaying ? t('gallery.pause') : t('gallery.play')}
                    aria-label={isPlaying ? t('gallery.pause') : t('gallery.play')}
                    aria-pressed={isPlaying}
                  >
                    {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                  </button>
                )}
                <button
                  onClick={() => setShowDetails((prev) => !prev)}
                  className={cn(
                    'p-2 rounded-lg transition-colors',
                    showDetails
                      ? 'bg-white/20 text-white'
                      : 'text-white/80 hover:text-white hover:bg-white/10'
                  )}
                  title={t('mediaViewer.details')}
                  aria-label={t('mediaViewer.details')}
                  aria-pressed={showDetails}
                >
                  <Info className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setShowShortcuts((prev) => !prev)}
                  className={cn(
                    'p-2 rounded-lg transition-colors',
                    showShortcuts
                      ? 'bg-white/20 text-white'
                      : 'text-white/80 hover:text-white hover:bg-white/10'
                  )}
                  title={t('gallery.shortcuts')}
                  aria-label={t('gallery.shortcuts')}
                  aria-pressed={showShortcuts}
                >
                  <Keyboard className="w-5 h-5" />
                </button>
                {onDownload && (
                  <button
                    onClick={() => onDownload(currentImage)}
                    className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                    title={t('gallery.download')}
                    aria-label={t('gallery.download')}
                  >
                    <Download className="w-5 h-5" />
                  </button>
                )}
                {onShare && (
                  <button
                    onClick={() => onShare(currentImage)}
                    className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                    title={t('gallery.share')}
                    aria-label={t('gallery.share')}
                  >
                    <Share2 className="w-5 h-5" />
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                  title={t('gallery.close')}
                  aria-label={t('gallery.close')}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Main image */}
          <div className="relative w-full h-full flex items-center justify-center p-6 sm:p-12">
            {signedUrl && !imageError && (
              <ImageCanvas
                src={signedUrl}
                alt={currentImage.name}
                zoom={zoom}
                position={position}
                rotation={rotation}
                onZoomChange={setZoom}
                onPositionChange={setPosition}
                onZoomIn={handleZoomIn}
                onZoomOut={handleZoomOut}
                onZoomReset={handleZoomReset}
                onRotate={handleRotate}
                onImageLoad={handleImageLoad}
                onImageError={handleImageError}
              />
            )}
            {(loadingSignedUrl || isLoading) && !imageError && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-10 h-10 animate-spin text-white/60" />
              </div>
            )}
            {imageError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-3 px-6 text-center">
                <AlertTriangle className="w-8 h-8 text-white/70" />
                <p className="text-sm text-white/80">{imageError}</p>
                <button
                  onClick={() => void loadImageUrl()}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  {t('common.retry')}
                </button>
              </div>
            )}
          </div>

          {/* Navigation arrows */}
          {images.length > 1 && (
            <>
              <button
                onClick={goToPrevious}
                className={cn(
                  'absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-black/70 text-white rounded-full transition-all',
                  controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
                )}
                title={t('gallery.previous')}
                aria-label={t('gallery.previous')}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                onClick={goToNext}
                className={cn(
                  'absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-black/70 text-white rounded-full transition-all',
                  controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none',
                  showDetails && 'right-[340px]'
                )}
                title={t('gallery.next')}
                aria-label={t('gallery.next')}
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}

          {/* Details panel */}
          <DetailsPanel
            file={currentImage}
            isOpen={showDetails}
            onClose={() => setShowDetails(false)}
            onCopyLink={handleCopyLink}
            actions={detailActions}
          />

          {/* Shortcuts overlay */}
          {showShortcuts && (
            <div
              className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 px-4"
              onClick={() => setShowShortcuts(false)}
            >
              <div
                className="w-full max-w-md rounded-2xl bg-white dark:bg-dark-800 shadow-2xl border border-dark-200 dark:border-dark-700 p-5"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-dark-900 dark:text-white">
                    {t('gallery.shortcuts')}
                  </h3>
                  <button
                    onClick={() => setShowShortcuts(false)}
                    className="p-2 -m-2 text-dark-500 hover:text-dark-900 dark:hover:text-white rounded-lg hover:bg-dark-100 dark:hover:bg-dark-700 transition-colors"
                    aria-label={t('gallery.close')}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-2">
                  {shortcutItems.map((item) => (
                    <div key={item.keys.join('-')} className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-1">
                        {item.keys.map((key) => (
                          <span
                            key={key}
                            className="px-2 py-1 text-xs font-semibold rounded-md bg-dark-100 dark:bg-dark-700 text-dark-700 dark:text-dark-200"
                          >
                            {key}
                          </span>
                        ))}
                      </div>
                      <span className="text-sm text-dark-600 dark:text-dark-300">
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
