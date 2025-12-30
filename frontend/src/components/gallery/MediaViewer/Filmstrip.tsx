import { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ChevronUp,
    ChevronDown,
    Star,
    Minus,
    Plus,
} from 'lucide-react';
import { FileItem } from '../../../types';
import { cn } from '../../../lib/utils';
import AuthenticatedImage from '../../AuthenticatedImage';

interface FilmstripProps {
    files: FileItem[];
    currentFile: FileItem | null;
    visible: boolean;
    onFileSelect: (file: FileItem) => void;
    onToggle: () => void;
    onFavorite?: (file: FileItem) => void;
    thumbSize?: number;
    minThumbSize?: number;
    maxThumbSize?: number;
    sizeStep?: number;
    onThumbSizeChange?: (size: number) => void;
}

export default function Filmstrip({
    files,
    currentFile,
    visible,
    onFileSelect,
    onToggle,
    onFavorite,
    thumbSize = 64,
    minThumbSize = 48,
    maxThumbSize = 96,
    sizeStep = 16,
    onThumbSizeChange,
}: FilmstripProps) {
    const { t } = useTranslation();
    const scrollRef = useRef<HTMLDivElement>(null);
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const canShrink = !!onThumbSizeChange && thumbSize > minThumbSize;
    const canGrow = !!onThumbSizeChange && thumbSize < maxThumbSize;

    // Scroll to current item when it changes
    useEffect(() => {
        if (!currentFile || !scrollRef.current) return;

        const container = scrollRef.current;
        const activeItem = container.querySelector(`[data-id="${currentFile.id}"]`) as HTMLElement;

        if (activeItem) {
            const containerRect = container.getBoundingClientRect();
            const itemRect = activeItem.getBoundingClientRect();

            // Check if item is outside visible area
            if (itemRect.left < containerRect.left || itemRect.right > containerRect.right) {
                activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
        }
    }, [currentFile?.id]);

    if (files.length <= 1) return null;

    return (
        <div
            className={cn(
                'absolute bottom-0 left-0 right-0',
                'bg-white/95 dark:bg-dark-800/95 backdrop-blur-sm',
                'border-t border-dark-100 dark:border-dark-700',
                'transition-all duration-200 ease-out',
                visible ? 'translate-y-0' : 'translate-y-full'
            )}
        >
            {/* Toggle Button */}
            <button
                onClick={onToggle}
                className={cn(
                    'absolute -top-8 left-1/2 -translate-x-1/2',
                    'flex items-center gap-1 px-3 py-1',
                    'bg-white dark:bg-dark-800',
                    'border border-dark-100 dark:border-dark-700 border-b-0',
                    'rounded-t-lg',
                    'text-xs text-dark-500 dark:text-dark-400',
                    'hover:bg-dark-50 dark:hover:bg-dark-700',
                    'transition-colors duration-150'
                )}
                aria-label={visible ? t('mediaViewer.filmstripHide') : t('mediaViewer.filmstripShow')}
            >
                {visible ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                <span>{files.length}</span>
            </button>

            {/* Size Controls */}
            {onThumbSizeChange && (
                <div
                    className={cn(
                        'absolute top-2 right-3 flex items-center gap-1',
                        'bg-white/90 dark:bg-dark-800/90 backdrop-blur-sm',
                        'border border-dark-100 dark:border-dark-700 rounded-full shadow-sm p-1',
                        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
                    )}
                >
                    <button
                        onClick={() => onThumbSizeChange(thumbSize - sizeStep)}
                        disabled={!canShrink}
                        className={cn(
                            'p-1 rounded-full',
                            'text-dark-500 dark:text-dark-300',
                            'hover:bg-dark-100 dark:hover:bg-dark-700',
                            'disabled:opacity-40 disabled:cursor-not-allowed',
                            'transition-colors duration-150'
                        )}
                        aria-label={t('mediaViewer.thumbSizeDecrease', 'Smaller thumbnails')}
                        title={t('mediaViewer.thumbSizeDecrease', 'Smaller thumbnails')}
                    >
                        <Minus className="w-3 h-3" />
                    </button>
                    <button
                        onClick={() => onThumbSizeChange(thumbSize + sizeStep)}
                        disabled={!canGrow}
                        className={cn(
                            'p-1 rounded-full',
                            'text-dark-500 dark:text-dark-300',
                            'hover:bg-dark-100 dark:hover:bg-dark-700',
                            'disabled:opacity-40 disabled:cursor-not-allowed',
                            'transition-colors duration-150'
                        )}
                        aria-label={t('mediaViewer.thumbSizeIncrease', 'Larger thumbnails')}
                        title={t('mediaViewer.thumbSizeIncrease', 'Larger thumbnails')}
                    >
                        <Plus className="w-3 h-3" />
                    </button>
                </div>
            )}

            {/* Thumbnails Container */}
            <div
                ref={scrollRef}
                className="flex items-center gap-2 p-3 overflow-x-auto scrollbar-thin no-scrollbar"
            >
                {files.map((file) => {
                    const isActive = file.id === currentFile?.id;
                    const isHovered = file.id === hoveredId;
                    const isMedia = file.mimeType?.startsWith('image/') || file.mimeType?.startsWith('video/');

                    return (
                        <div
                            key={file.id}
                            data-id={file.id}
                            className="relative flex-shrink-0"
                            onMouseEnter={() => setHoveredId(file.id)}
                            onMouseLeave={() => setHoveredId(null)}
                        >
                            <button
                                onClick={() => onFileSelect(file)}
                                className={cn(
                                    'rounded-lg overflow-hidden',
                                    'border-2 transition-all duration-150',
                                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
                                    isActive
                                        ? 'border-primary-500 scale-105 shadow-md'
                                        : 'border-transparent hover:border-dark-200 dark:hover:border-dark-600'
                                )}
                                style={{ width: thumbSize, height: thumbSize }}
                                aria-label={file.name}
                                aria-current={isActive ? 'true' : undefined}
                            >
                                {isMedia ? (
                                    <AuthenticatedImage
                                        fileId={file.id}
                                        endpoint={file.thumbnailPath ? 'thumbnail' : 'view'}
                                        alt={file.name}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-full bg-dark-100 dark:bg-dark-700 flex items-center justify-center">
                                        <span className="text-xs text-dark-400 font-medium">
                                            {file.name.split('.').pop()?.toUpperCase()}
                                        </span>
                                    </div>
                                )}

                                {/* Video indicator */}
                                {file.mimeType?.startsWith('video/') && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                        <div className="w-6 h-6 bg-white/80 rounded-full flex items-center justify-center">
                                            <div className="w-0 h-0 border-t-[5px] border-t-transparent border-l-[8px] border-l-dark-800 border-b-[5px] border-b-transparent ml-0.5" />
                                        </div>
                                    </div>
                                )}
                            </button>

                            {/* Hover Actions */}
                            {isHovered && !isActive && onFavorite && (
                                <div className="absolute -top-1 -right-1 flex gap-0.5">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onFavorite(file);
                                        }}
                                        className={cn(
                                            'p-1 rounded-full',
                                            'bg-white dark:bg-dark-800 shadow-md',
                                            'text-dark-500 hover:text-yellow-500',
                                            'transition-colors duration-150'
                                        )}
                                        aria-label={t('common.addToFavorites')}
                                    >
                                        <Star className={cn('w-3 h-3', file.isFavorite && 'fill-yellow-500 text-yellow-500')} />
                                    </button>
                                </div>
                            )}

                            {/* Favorite Indicator */}
                            {file.isFavorite && !isHovered && (
                                <div className="absolute -top-1 -right-1 p-1 bg-white dark:bg-dark-800 rounded-full shadow-sm">
                                    <Star className="w-3 h-3 fill-yellow-500 text-yellow-500" />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
