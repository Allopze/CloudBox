import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useGesture } from '@use-gesture/react';
import {
    ZoomIn,
    ZoomOut,
    Maximize2,
    RotateCw,
    Scan,
} from 'lucide-react';
import { cn } from '../../../lib/utils';

interface ImageCanvasProps {
    src: string;
    alt: string;
    zoom: number;
    position: { x: number; y: number };
    rotation: number;
    onZoomChange: (zoom: number) => void;
    onPositionChange: (position: { x: number; y: number }) => void;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onZoomReset: () => void;
    onRotate: () => void;
    onImageLoad?: (img: HTMLImageElement) => void;
    onImageError?: () => void;
    hudOffset?: number;
    /** Callback when swiping left (navigate next) */
    onSwipeLeft?: () => void;
    /** Callback when swiping right (navigate prev) */
    onSwipeRight?: () => void;
}

export default function ImageCanvas({
    src,
    alt,
    zoom,
    position,
    rotation,
    onZoomChange,
    onPositionChange,
    onZoomIn,
    onZoomOut,
    onZoomReset,
    onRotate,
    onImageLoad,
    onImageError,
    hudOffset = 80,
    onSwipeLeft,
    onSwipeRight,
}: ImageCanvasProps) {
    const { t } = useTranslation();
    const containerRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);

    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [isLoaded, setIsLoaded] = useState(false);

    const hudTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastTapRef = useRef(0);
    const lastTapPosRef = useRef({ x: 0, y: 0 });
    const initialPinchZoomRef = useRef(zoom);
    const isPinchingRef = useRef(false);

    // Flash HUD timeout (for future use if we want to show/hide controls)
    const flashHUD = useCallback(() => {
        if (hudTimeout.current) clearTimeout(hudTimeout.current);
        hudTimeout.current = setTimeout(() => { }, 2000);
    }, []);

    // Mouse wheel zoom
    const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
        if (e.ctrlKey || e.metaKey) return;
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const newZoom = Math.max(0.25, Math.min(5, zoom + delta));
        onZoomChange(newZoom);
        flashHUD();
    }, [zoom, onZoomChange, flashHUD]);

    const zoomToPoint = (clientX: number, clientY: number) => {
        if (zoom === 1) {
            // Zoom to 2x at click point
            const rect = containerRef.current?.getBoundingClientRect();
            if (rect) {
                const x = clientX - rect.left - rect.width / 2;
                const y = clientY - rect.top - rect.height / 2;
                onPositionChange({ x: -x, y: -y });
            }
            onZoomChange(2);
        } else {
            onZoomReset();
        }
        flashHUD();
    };

    // Double-click to toggle zoom
    const handleDoubleClick = (e: React.MouseEvent) => {
        zoomToPoint(e.clientX, e.clientY);
    };

    // Drag to pan when zoomed
    const handleMouseDown = (e: React.MouseEvent) => {
        if (zoom <= 1) return;
        setIsDragging(true);
        setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isDragging) return;
        onPositionChange({
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y,
        });
        flashHUD();
    }, [isDragging, dragStart, onPositionChange, flashHUD]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            return () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [isDragging, handleMouseMove, handleMouseUp]);

    // Touch gesture bindings using @use-gesture/react
    const bind = useGesture(
        {
            // Pinch gesture for zooming
            onPinchStart: () => {
                initialPinchZoomRef.current = zoom;
                isPinchingRef.current = true;
            },
            onPinch: ({ offset: [scale] }) => {
                const newZoom = Math.max(0.25, Math.min(5, initialPinchZoomRef.current * scale));
                onZoomChange(newZoom);
                flashHUD();
            },
            onPinchEnd: () => {
                isPinchingRef.current = false;
            },

            // Drag gesture for panning (when zoomed) or swiping (when not zoomed)
            onDragStart: ({ event }) => {
                // Record position for double-tap detection
                if (event instanceof TouchEvent && event.touches.length === 1) {
                    const touch = event.touches[0];
                    lastTapPosRef.current = { x: touch.clientX, y: touch.clientY };
                }
                if (zoom > 1) {
                    setIsDragging(true);
                    setDragStart({ x: position.x, y: position.y });
                }
            },
            onDrag: ({ movement: [mx, my], velocity: [vx], direction: [dx], last, touches, tap }) => {
                // Ignore multi-touch (pinch is handled separately)
                if (touches > 1 || isPinchingRef.current) return;

                // If zoomed in, allow panning
                if (zoom > 1) {
                    onPositionChange({
                        x: dragStart.x + mx,
                        y: dragStart.y + my,
                    });
                    flashHUD();
                    return;
                }

                // If not zoomed, detect swipe on gesture end
                if (last && !tap) {
                    const absMovement = Math.abs(mx);
                    const isSwipe = absMovement > 50 && vx > 0.3;

                    if (isSwipe) {
                        if (dx > 0) {
                            // Swiped right = previous
                            onSwipeRight?.();
                        } else {
                            // Swiped left = next
                            onSwipeLeft?.();
                        }
                    }
                }
            },
            onDragEnd: () => {
                setIsDragging(false);
                // Double-tap detection
                const now = Date.now();
                if (now - lastTapRef.current < 300) {
                    const { x, y } = lastTapPosRef.current;
                    zoomToPoint(x, y);
                }
                lastTapRef.current = now;
            },
        },
        {
            drag: {
                filterTaps: true,
                threshold: 10,
            },
            pinch: {
                scaleBounds: { min: 0.25, max: 5 },
                rubberband: true,
            },
        }
    );

    const getFitScale = useCallback(() => {
        const container = containerRef.current;
        const image = imageRef.current;
        if (!container || !image) return 1;

        const { naturalWidth, naturalHeight } = image;
        if (!naturalWidth || !naturalHeight) return 1;

        const normalizedRotation = ((rotation % 360) + 360) % 360;
        const rotated = normalizedRotation === 90 || normalizedRotation === 270;
        const imageWidth = rotated ? naturalHeight : naturalWidth;
        const imageHeight = rotated ? naturalWidth : naturalHeight;

        const scale = Math.min(
            container.clientWidth / imageWidth,
            container.clientHeight / imageHeight
        );
        return Math.max(0.25, Math.min(5, scale));
    }, [rotation]);

    const handleFitToScreen = () => {
        const scale = getFitScale();
        onZoomChange(scale);
        onPositionChange({ x: 0, y: 0 });
        flashHUD();
    };

    const handleActualSize = () => {
        onZoomChange(1);
        onPositionChange({ x: 0, y: 0 });
        flashHUD();
    };

    useEffect(() => {
        setIsLoaded(false);
    }, [src]);

    return (
        <div
            ref={containerRef}
            {...bind()}
            className={cn(
                'relative w-full h-full flex items-center justify-center overflow-hidden',
                'touch-none',
                zoom > 1 && 'cursor-grab',
                isDragging && 'cursor-grabbing'
            )}
            onDoubleClick={handleDoubleClick}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
        >
            {/* Image */}
            <img
                ref={imageRef}
                src={src}
                alt={alt}
                crossOrigin="use-credentials"
                draggable={false}
                className={cn(
                    'max-w-full max-h-full object-contain select-none',
                    'transition-opacity duration-200',
                    !isLoaded && 'opacity-0'
                )}
                style={{
                    transform: `translate(${position.x}px, ${position.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                    transformOrigin: 'center center',
                }}
                onDoubleClick={handleDoubleClick}
                onLoad={(e) => {
                    setIsLoaded(true);
                    onImageLoad?.(e.currentTarget);
                }}
                onError={() => {
                    setIsLoaded(false);
                    onImageError?.();
                }}
            />

            {/* Zoom HUD */}
            <div
                className={cn(
                    'absolute left-1/2 -translate-x-1/2',
                    'flex items-center gap-1 p-1',
                    'bg-white/90 dark:bg-dark-800/90 backdrop-blur-sm',
                    'rounded-full shadow-lg',
                    'transition-all duration-200 opacity-100 translate-y-0'
                )}
                style={{ bottom: hudOffset }}
            >
                <button
                    onClick={() => { onZoomOut(); flashHUD(); }}
                    disabled={zoom <= 0.25}
                    className={cn(
                        'p-2 rounded-full',
                        'text-dark-600 dark:text-dark-300',
                        'hover:bg-dark-100 dark:hover:bg-dark-700',
                        'disabled:opacity-40 disabled:cursor-not-allowed',
                        'transition-colors duration-150'
                    )}
                    aria-label={t('gallery.zoomOut')}
                >
                    <ZoomOut className="w-4 h-4" />
                </button>

                <span className="px-2 min-w-[56px] text-center text-sm font-medium text-dark-700 dark:text-dark-200">
                    {Math.round(zoom * 100)}%
                </span>

                <button
                    onClick={() => { onZoomIn(); flashHUD(); }}
                    disabled={zoom >= 5}
                    className={cn(
                        'p-2 rounded-full',
                        'text-dark-600 dark:text-dark-300',
                        'hover:bg-dark-100 dark:hover:bg-dark-700',
                        'disabled:opacity-40 disabled:cursor-not-allowed',
                        'transition-colors duration-150'
                    )}
                    aria-label={t('gallery.zoomIn')}
                >
                    <ZoomIn className="w-4 h-4" />
                </button>

                <div className="w-px h-5 bg-dark-200 dark:bg-dark-600 mx-1" />

                <button
                    onClick={handleFitToScreen}
                    className={cn(
                        'p-2 rounded-full',
                        'text-dark-600 dark:text-dark-300',
                        'hover:bg-dark-100 dark:hover:bg-dark-700',
                        'transition-colors duration-150'
                    )}
                    aria-label={t('mediaViewer.fitToScreen')}
                    title={t('mediaViewer.fitToScreen')}
                >
                    <Scan className="w-4 h-4" />
                </button>

                <button
                    onClick={handleActualSize}
                    className={cn(
                        'px-2 py-1 rounded-full text-xs font-semibold',
                        'text-dark-600 dark:text-dark-300',
                        'hover:bg-dark-100 dark:hover:bg-dark-700',
                        'transition-colors duration-150'
                    )}
                    aria-label={t('mediaViewer.actualSize')}
                    title={t('mediaViewer.actualSize')}
                >
                    {t('mediaViewer.zoomLevel', { level: 100 })}
                </button>

                <div className="w-px h-5 bg-dark-200 dark:bg-dark-600 mx-1" />

                <button
                    onClick={() => { onRotate(); flashHUD(); }}
                    className={cn(
                        'p-2 rounded-full',
                        'text-dark-600 dark:text-dark-300',
                        'hover:bg-dark-100 dark:hover:bg-dark-700',
                        'transition-colors duration-150'
                    )}
                    aria-label={t('gallery.rotate')}
                >
                    <RotateCw className="w-4 h-4" />
                </button>

                <button
                    onClick={() => { onZoomReset(); flashHUD(); }}
                    className={cn(
                        'p-2 rounded-full',
                        'text-dark-600 dark:text-dark-300',
                        'hover:bg-dark-100 dark:hover:bg-dark-700',
                        'transition-colors duration-150'
                    )}
                    aria-label={t('gallery.reset')}
                >
                    <Maximize2 className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
