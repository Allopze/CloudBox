import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
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
  RotateCw
} from 'lucide-react';
import { FileItem } from '../../types';
import { getFileUrl } from '../../lib/api';
import { cn } from '../../lib/utils';

interface ImageGalleryProps {
  images: FileItem[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
  onShare?: (file: FileItem) => void;
  onDownload?: (file: FileItem) => void;
}

export default function ImageGallery({
  images,
  initialIndex = 0,
  isOpen,
  onClose,
  onShare,
  onDownload,
}: ImageGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const slideInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const controlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentImage = images[currentIndex];

  // Reset state when gallery opens
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
      setZoom(1);
      setRotation(0);
      setIsPlaying(false);
      setShowControls(true);
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
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const goToNext = () => {
    setIsLoading(true);
    setZoom(1);
    setRotation(0);
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

  if (!isOpen || !currentImage) return null;

  const imageUrl = getFileUrl(currentImage.id, 'view');

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
                title="Descargar"
              >
                <Download className="w-5 h-5" />
              </button>
            )}
            {onShare && (
              <button
                onClick={() => onShare(currentImage)}
                className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                title="Compartir"
              >
                <Share2 className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title="Cerrar (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main image */}
      <div className="relative w-full h-full flex items-center justify-center p-16">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}
        <img
          src={imageUrl}
          alt={currentImage.name}
          className="max-w-full max-h-full object-contain transition-all duration-200"
          style={{
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
            opacity: isLoading ? 0 : 1,
          }}
          onLoad={() => setIsLoading(false)}
          draggable={false}
        />
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
            title="Anterior (←)"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            onClick={goToNext}
            className={cn(
              'absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-black/70 text-white rounded-full transition-all',
              showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
            )}
            title="Siguiente (→)"
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
              title={isPlaying ? 'Pausar (Espacio)' : 'Reproducir (Espacio)'}
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
            title="Alejar (-)"
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
            title="Acercar (+)"
          >
            <ZoomIn className="w-5 h-5" />
          </button>

          <div className="w-px h-6 bg-white/20 mx-2" />

          {/* Rotate */}
          <button
            onClick={handleRotate}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title="Rotar (R)"
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
            title="Restablecer (0)"
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
                  setCurrentIndex(index);
                }}
                className={cn(
                  'flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition-all',
                  index === currentIndex
                    ? 'border-primary-500 scale-110'
                    : 'border-transparent opacity-60 hover:opacity-100'
                )}
              >
                <img
                  src={getFileUrl(image.id, 'thumbnail')}
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
