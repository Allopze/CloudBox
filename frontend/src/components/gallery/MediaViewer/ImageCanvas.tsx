import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ZoomIn,
    ZoomOut,
    Maximize2,
    RotateCw,
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
    showControls: boolean;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onZoomReset: () => void;
    onRotate: () => void;
}

export default function ImageCanvas({
    src,
    alt,
    zoom,
    position,
    rotation,
    onZoomChange,
    onPositionChange,
    showControls,
    onZoomIn,
    onZoomOut,
    onZoomReset,
    onRotate,
}: ImageCanvasProps) {
    const { t } = useTranslation();
    const containerRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);

    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [isLoaded, setIsLoaded] = useState(false);
    const [showHUD, setShowHUD] = useState(false);

    const hudTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Show HUD temporarily on zoom/pan interaction
    const flashHUD = useCallback(() => {
        setShowHUD(true);
        if (hudTimeout.current) clearTimeout(hudTimeout.current);
        hudTimeout.current = setTimeout(() => setShowHUD(false), 2000);
    }, []);

    // Mouse wheel zoom
    const handleWheel = useCallback((e: WheelEvent) => {
        if (!e.ctrlKey && !e.metaKey) return;

        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const newZoom = Math.max(0.25, Math.min(5, zoom + delta));
        onZoomChange(newZoom);
        flashHUD();
    }, [zoom, onZoomChange, flashHUD]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        container.addEventListener('wheel', handleWheel, { passive: false });
        return () => container.removeEventListener('wheel', handleWheel);
    }, [handleWheel]);

    // Double-click to toggle zoom
    const handleDoubleClick = (e: React.MouseEvent) => {
        if (zoom === 1) {
            // Zoom to 2x at click point
            const rect = containerRef.current?.getBoundingClientRect();
            if (rect) {
                const x = e.clientX - rect.left - rect.width / 2;
                const y = e.clientY - rect.top - rect.height / 2;
                onPositionChange({ x: -x, y: -y });
            }
            onZoomChange(2);
        } else {
            onZoomReset();
        }
        flashHUD();
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
    }, [isDragging, dragStart, onPositionChange]);

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

    return (
        <div
            ref={containerRef}
            className={cn(
                'relative w-full h-full flex items-center justify-center overflow-hidden',
                zoom > 1 && 'cursor-grab',
                isDragging && 'cursor-grabbing'
            )}
            onDoubleClick={handleDoubleClick}
            onMouseDown={handleMouseDown}
        >
            {/* Image */}
            <img
                ref={imageRef}
                src={src}
                alt={alt}
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
                onLoad={() => setIsLoaded(true)}
            />

            {/* Zoom HUD */}
            <div
                className={cn(
                    'absolute bottom-20 left-1/2 -translate-x-1/2',
                    'flex items-center gap-1 p-1',
                    'bg-white/90 dark:bg-dark-800/90 backdrop-blur-sm',
                    'rounded-full shadow-lg',
                    'transition-all duration-200',
                    (showControls || showHUD) ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
                )}
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
