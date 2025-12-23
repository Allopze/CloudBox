import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  ZoomIn,
  ZoomOut,
  Download,
  Share2,
  Maximize2,
  RotateCw,
  Loader2
} from 'lucide-react';
import { FileItem } from '../../types';
import { getSignedFileUrl, api } from '../../lib/api';
import { cn } from '../../lib/utils';
import AuthenticatedImage from '../AuthenticatedImage';

interface ImageGalleryProps {
  images: FileItem[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
  onShare?: (file: FileItem) => void;
  onDownload?: (file: FileItem) => void;
}

// Check if an image format supports transparency
const supportsTransparency = (mimeType: string): boolean => {
  return mimeType === 'image/png' ||
    mimeType === 'image/svg+xml' ||
    mimeType === 'image/webp' ||
    mimeType === 'image/gif';
};

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
}: ImageGalleryProps) {
  const { t } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [needsLightBackground, setNeedsLightBackground] = useState(false);
  const slideInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const controlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const currentImage = images[currentIndex];
  const shareId = (currentImage as any)?.shareId as string | undefined;

  // Auth state for signed URL
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadingSignedUrl, setLoadingSignedUrl] = useState(false);
  const blobUrlRef = useRef<string | null>(null);

  const revokeBlobUrl = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }, []);

  // Reset state when gallery opens
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
      setZoom(1);
      setRotation(0);
      setIsPlaying(false);
      setShowControls(true);
      setNeedsLightBackground(false);
    }
  }, [isOpen, initialIndex]);

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
    controlsTimeout.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, 3000);
  }, [isPlaying]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      resetControlsTimeout();

      switch (e.key) {
        case 'Escape':
          onClose();
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
          e.preventDefault();
          handleRotate();
          break;
        case '0':
          e.preventDefault();
          setZoom(1);
          setRotation(0);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, resetControlsTimeout]);

  const goToPrevious = () => {
    setIsLoading(true);
    setZoom(1);
    setRotation(0);
    setNeedsLightBackground(false);
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const goToNext = () => {
    setIsLoading(true);
    setZoom(1);
    setRotation(0);
    setNeedsLightBackground(false);
    setCurrentIndex((prev) => (prev + 1) % images.length);
  };

  const toggleSlideshow = () => {
    setIsPlaying(!isPlaying);
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.25, 0.5));
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleMouseMove = () => {
    resetControlsTimeout();
  };

  // Fetch signed URL when current image changes
  useEffect(() => {
    if (isOpen && currentImage) {
      setLoadingSignedUrl(true);
      revokeBlobUrl();

      const loadUrl = async () => {
        try {
          if (shareId) {
            const response = await api.get(`/shares/${shareId}/files/${currentImage.id}/view`, {
              responseType: 'blob',
            });
            const url = URL.createObjectURL(response.data);
            blobUrlRef.current = url;
            setSignedUrl(url);
          } else {
            const url = await getSignedFileUrl(currentImage.id, 'view');
            setSignedUrl(url);
          }
        } catch (err) {
          console.error('Failed to get image URL', err);
          setSignedUrl(null);
        } finally {
          setLoadingSignedUrl(false);
        }
      };

      void loadUrl();
    } else {
      revokeBlobUrl();
      setSignedUrl(null);
    }

    return () => {
      revokeBlobUrl();
    };
  }, [isOpen, currentImage, shareId, revokeBlobUrl]);

  if (!isOpen || !currentImage) return null;

  return createPortal(
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
      onMouseMove={handleMouseMove}
      onClick={(e) => {
        if (e.target === containerRef.current) {
          onClose();
        }
      }}
    >
      {/* Top bar */}
      <div
        className={cn(
          'absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent z-10 transition-opacity duration-300',
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
      >
        <div className="flex items-center justify-between max-w-screen-xl mx-auto">
          <div className="text-white">
            <h3 className="font-medium truncate max-w-md">{currentImage.name}</h3>
            <p className="text-sm text-gray-400">
              {currentIndex + 1} / {images.length}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onDownload && (
              <button
                onClick={() => onDownload(currentImage)}
                className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                title={t('gallery.download')}
              >
                <Download className="w-5 h-5" />
              </button>
            )}
            {onShare && (
              <button
                onClick={() => onShare(currentImage)}
                className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                title={t('gallery.share')}
              >
                <Share2 className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title={t('gallery.close')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main image */}
      <div className={cn(
        "relative w-full h-full flex items-center justify-center p-16 transition-colors duration-300",
        needsLightBackground && "bg-white/20"
      )}>
        {loadingSignedUrl || !signedUrl ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-10 h-10 animate-spin text-white/50" />
          </div>
        ) : (
          <>
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              </div>
            )}
            <img
              ref={imageRef}
              src={signedUrl}
              alt={currentImage.name}
              crossOrigin="anonymous"
              className={cn(
                "max-w-full max-h-full object-contain transition-all duration-200",
                needsLightBackground && "rounded-lg shadow-2xl"
              )}
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
                opacity: isLoading ? 0 : 1,
              }}
              onLoad={(e) => {
                setIsLoading(false);
                // Analyze image to detect if it needs light background
                const img = e.currentTarget;
                const mimeType = currentImage.mimeType || '';
                const isDarkWithTransparency = analyzeImage(img, mimeType);
                setNeedsLightBackground(isDarkWithTransparency);
              }}
              draggable={false}
            />
          </>
        )}
      </div>

      {/* Navigation arrows */}
      {images.length > 1 && (
        <>
          <button
            onClick={goToPrevious}
            className={cn(
              'absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-black/70 text-white rounded-full transition-all',
              showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
            )}
            title={t('gallery.previous')}
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            onClick={goToNext}
            className={cn(
              'absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-black/70 text-white rounded-full transition-all',
              showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
            )}
            title={t('gallery.next')}
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}

      {/* Bottom bar with controls */}
      <div
        className={cn(
          'absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent z-10 transition-opacity duration-300',
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
      >
        <div className="flex items-center justify-center gap-2 max-w-screen-xl mx-auto">
          {/* Slideshow control */}
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
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>
          )}

          <div className="w-px h-6 bg-white/20 mx-2" />

          {/* Zoom controls */}
          <button
            onClick={handleZoomOut}
            disabled={zoom <= 0.5}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={t('gallery.zoomOut')}
          >
            <ZoomOut className="w-5 h-5" />
          </button>
          <span className="text-white/80 text-sm min-w-[60px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            disabled={zoom >= 3}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={t('gallery.zoomIn')}
          >
            <ZoomIn className="w-5 h-5" />
          </button>

          <div className="w-px h-6 bg-white/20 mx-2" />

          {/* Rotate */}
          <button
            onClick={handleRotate}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title={t('gallery.rotate')}
          >
            <RotateCw className="w-5 h-5" />
          </button>

          {/* Reset */}
          <button
            onClick={() => {
              setZoom(1);
              setRotation(0);
            }}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title={t('gallery.reset')}
          >
            <Maximize2 className="w-5 h-5" />
          </button>
        </div>

        {/* Thumbnail strip */}
        {images.length > 1 && images.length <= 20 && (
          <div className="flex items-center justify-center gap-2 mt-4 overflow-x-auto pb-2">
            {images.map((image, index) => (
              <button
                key={image.id}
                onClick={() => {
                  setIsLoading(true);
                  setZoom(1);
                  setRotation(0);
                  setNeedsLightBackground(false);
                  setCurrentIndex(index);
                }}
                className={cn(
                  'flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition-all',
                  index === currentIndex
                    ? 'border-primary-500 scale-110'
                    : 'border-transparent opacity-60 hover:opacity-100'
                )}
              >
                <AuthenticatedImage
                  fileId={image.id}
                  endpoint={image.thumbnailPath ? 'thumbnail' : 'view'}
                  alt={image.name}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
