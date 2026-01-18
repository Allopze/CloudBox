import { useTranslation } from 'react-i18next';
import { Plus, Minus, Moon, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '../../../lib/utils';

type ReadingMode = 'normal' | 'dark' | 'sepia';

interface ZoomControlsProps {
    zoom: number;
    setZoom: (zoom: number | ((prev: number) => number)) => void;
    numPages: number;
    currentPage: number;
    goToPage: (page: number) => void;
    readingMode: ReadingMode;
    cycleReadingMode: () => void;
    isFocusMode: boolean;
    toggleFocusMode: () => void;
    visible: boolean;
}

export default function ZoomControls({
    zoom,
    setZoom,
    numPages,
    currentPage,
    goToPage,
    readingMode,
    cycleReadingMode,
    isFocusMode,
    toggleFocusMode,
    visible,
}: ZoomControlsProps) {
    const { t } = useTranslation();

    return (
        <footer
            className={cn(
                "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-500",
                visible ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"
            )}
        >
            <div className="bg-white/95 dark:bg-dark-800/95 backdrop-blur-md border border-gray-200 dark:border-dark-600 shadow-2xl rounded-2xl h-[48px] px-2 flex items-center gap-4">
                {/* Zoom controls */}
                <div className="flex items-center gap-1 bg-gray-50 dark:bg-dark-700 rounded-xl p-1 shrink-0">
                    <button
                        onClick={() => setZoom(prev => Math.max(prev - 10, 25))}
                        className="p-1.5 hover:bg-white dark:hover:bg-dark-600 hover:shadow-sm rounded-lg text-gray-600 dark:text-gray-300 transition-all"
                        title={t('gallery.zoomOut')}
                    >
                        <Minus size={14} />
                    </button>
                    <button className="px-2 text-xs font-bold text-gray-700 dark:text-gray-200 min-w-[45px] text-center">
                        {zoom}%
                    </button>
                    <button
                        onClick={() => setZoom(prev => Math.min(prev + 10, 300))}
                        className="p-1.5 hover:bg-white dark:hover:bg-dark-600 hover:shadow-sm rounded-lg text-gray-600 dark:text-gray-300 transition-all"
                        title={t('gallery.zoomIn')}
                    >
                        <Plus size={14} />
                    </button>
                </div>

                {/* Page Slider */}
                <div className="flex items-center gap-3 px-2">
                    <span className="text-[10px] font-bold text-gray-400 w-8 text-right">1</span>
                    <input
                        type="range"
                        min={1}
                        max={numPages}
                        value={currentPage}
                        onChange={(e) => goToPage(parseInt(e.target.value))}
                        className="w-32 h-1.5 bg-gray-100 dark:bg-dark-600 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-primary-600 [&::-webkit-slider-thumb]:rounded-full"
                    />
                    <span className="text-[10px] font-bold text-gray-400 w-8">{numPages}</span>
                </div>

                {/* Reading Mode Toggle */}
                <button
                    onClick={cycleReadingMode}
                    className={cn(
                        "p-2 rounded-xl transition-all",
                        readingMode !== 'normal'
                            ? "bg-primary-600 text-white"
                            : "hover:bg-gray-100 dark:hover:bg-dark-700 text-gray-600 dark:text-gray-300"
                    )}
                    title={t('documentViewer.readingMode')}
                >
                    <Moon size={18} />
                </button>

                {/* Focus mode toggle */}
                <button
                    onClick={toggleFocusMode}
                    className={cn(
                        "p-2 rounded-xl transition-all",
                        isFocusMode ? "bg-primary-600 text-white" : "hover:bg-gray-100 dark:hover:bg-dark-700 text-gray-600 dark:text-gray-300"
                    )}
                    title={isFocusMode ? t('documentViewer.exitFocusMode') : t('documentViewer.focusMode')}
                >
                    {isFocusMode ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                </button>
            </div>
        </footer>
    );
}

export type { ReadingMode };
