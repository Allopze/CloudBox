import { useTranslation } from 'react-i18next';
import {
    ChevronLeft,
    ChevronRight,
    Search,
    Share2,
    Download,
    Info,
} from 'lucide-react';
import { FileItem } from '../../../types';
import { cn, formatBytes } from '../../../lib/utils';

interface TopBarProps {
    file: FileItem;
    files: FileItem[];
    currentFileIndex: number;
    onClose: () => void;
    onNavigate?: (file: FileItem) => void;
    onShare?: (file: FileItem) => void;
    onDownload?: (file: FileItem) => void;
    showSearch?: boolean;
    isSearchOpen: boolean;
    onSearchToggle: () => void;
    isRightPanelOpen: boolean;
    onRightPanelToggle: () => void;
}

export default function TopBar({
    file,
    files,
    currentFileIndex,
    onClose,
    onNavigate,
    onShare,
    onDownload,
    showSearch = false,
    isSearchOpen,
    onSearchToggle,
    isRightPanelOpen,
    onRightPanelToggle,
}: TopBarProps) {
    const { t } = useTranslation();

    const goToPrevDocument = () => {
        if (currentFileIndex > 0 && onNavigate) {
            onNavigate(files[currentFileIndex - 1]);
        }
    };

    const goToNextDocument = () => {
        if (currentFileIndex < files.length - 1 && onNavigate) {
            onNavigate(files[currentFileIndex + 1]);
        }
    };

    return (
        <header
            className="h-[56px] border-b border-gray-200 dark:border-dark-700 bg-white dark:bg-dark-800 flex items-center justify-between px-4 z-40 shrink-0"
            onContextMenu={(e) => e.preventDefault()}
        >
            <div className="flex items-center gap-3 w-1/3">
                <button
                    onClick={onClose}
                    className="p-1.5 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg transition-colors"
                    title={t('common.back')}
                >
                    <ChevronLeft size={20} />
                </button>
                {/* Document navigation */}
                {files.length > 1 && (
                    <div className="hidden md:flex items-center gap-1 text-sm text-gray-500">
                        <button
                            onClick={goToPrevDocument}
                            disabled={currentFileIndex <= 0}
                            className="p-1 hover:bg-gray-100 dark:hover:bg-dark-700 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <span>{currentFileIndex + 1} / {files.length}</span>
                        <button
                            onClick={goToNextDocument}
                            disabled={currentFileIndex >= files.length - 1}
                            className="p-1 hover:bg-gray-100 dark:hover:bg-dark-700 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                )}
            </div>

            <div className="flex flex-col items-center justify-center w-1/3 text-center">
                <h1 className="text-sm font-semibold truncate max-w-[200px] md:max-w-full">{file.name}</h1>
                <span className="text-[10px] uppercase tracking-widest text-gray-400 font-medium">
                    {formatBytes(file.size)}
                </span>
            </div>

            <div className="flex items-center justify-end gap-1 w-1/3">
                {showSearch && (
                    <button
                        onClick={onSearchToggle}
                        className={cn(
                            "p-2 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg transition-colors",
                            isSearchOpen ? "text-primary-600" : "text-gray-600 dark:text-gray-400"
                        )}
                        title={t('documentViewer.search')}
                    >
                        <Search size={18} />
                    </button>
                )}
                {onShare && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onShare(file); }}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg transition-colors text-gray-600 dark:text-gray-400"
                        title={t('common.share')}
                        aria-label={t('common.share')}
                    >
                        <Share2 size={18} />
                    </button>
                )}
                {onDownload && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onDownload(file); }}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg transition-colors text-gray-600 dark:text-gray-400"
                        title={t('common.download')}
                        aria-label={t('common.download')}
                    >
                        <Download size={18} />
                    </button>
                )}
                <div className="w-[1px] h-4 bg-gray-200 dark:bg-dark-600 mx-1" />
                <button
                    onClick={onRightPanelToggle}
                    className={cn(
                        "p-2 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg transition-colors",
                        isRightPanelOpen ? "text-primary-600 bg-primary-50 dark:bg-primary-900/20" : "text-gray-600 dark:text-gray-400"
                    )}
                    title={t('documentViewer.details')}
                >
                    <Info size={18} />
                </button>
            </div>
        </header>
    );
}
