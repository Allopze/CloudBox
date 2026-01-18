import { useTranslation } from 'react-i18next';
import { Document, Page } from 'react-pdf';
import { ChevronLeft, ChevronRight, Layers, Bookmark } from 'lucide-react';
import { cn } from '../../../lib/utils';

type LeftTabType = 'thumbnails' | 'bookmarks';

interface ThumbnailPanelProps {
    pdfOptions: { url: string; cMapUrl: string; cMapPacked: boolean; withCredentials: boolean } | null;
    numPages: number;
    currentPage: number;
    goToPage: (page: number) => void;
    isOpen: boolean;
    onToggle: () => void;
    activeTab: LeftTabType;
    setActiveTab: (tab: LeftTabType) => void;
}

export default function ThumbnailPanel({
    pdfOptions,
    numPages,
    currentPage,
    goToPage,
    isOpen,
    onToggle,
    activeTab,
    setActiveTab,
}: ThumbnailPanelProps) {
    const { t } = useTranslation();

    if (numPages === 0) return null;

    return (
        <>
            {/* Sidebar */}
            <aside
                className={cn(
                    "transition-all duration-300 border-r border-gray-200 dark:border-dark-700 bg-white dark:bg-dark-800 flex flex-col z-30 shadow-sm",
                    isOpen ? "w-[200px]" : "w-0 overflow-hidden border-none"
                )}
                onContextMenu={(e) => e.preventDefault()}
            >
                <div className="flex border-b border-gray-100 dark:border-dark-700">
                    <button
                        onClick={() => setActiveTab('thumbnails')}
                        className={cn(
                            "flex-1 py-3 text-xs font-medium flex items-center justify-center gap-2 border-b-2 transition-all",
                            activeTab === 'thumbnails' ? "border-primary-600 text-primary-600" : "border-transparent text-gray-400 hover:text-gray-600"
                        )}
                        title={t('documentViewer.thumbnails')}
                    >
                        <Layers size={14} />
                    </button>
                    <button
                        onClick={() => setActiveTab('bookmarks')}
                        className={cn(
                            "flex-1 py-3 text-xs font-medium flex items-center justify-center gap-2 border-b-2 transition-all",
                            activeTab === 'bookmarks' ? "border-primary-600 text-primary-600" : "border-transparent text-gray-400 hover:text-gray-600"
                        )}
                        title={t('documentViewer.bookmarks')}
                    >
                        <Bookmark size={14} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-gray-200 hover:scrollbar-thumb-gray-300">
                    {activeTab === 'thumbnails' && pdfOptions && (
                        <Document
                            file={pdfOptions}
                            loading={null}
                            error={null}
                            className="grid grid-cols-1 gap-3"
                        >
                            {Array.from({ length: Math.min(numPages, 50) }).map((_, i) => (
                                <button
                                    key={i}
                                    onClick={() => goToPage(i + 1)}
                                    className={cn(
                                        "flex flex-col items-center gap-1 group cursor-pointer p-1 rounded-lg transition-colors",
                                        currentPage === i + 1 ? "bg-primary-50 dark:bg-primary-900/20" : "hover:bg-gray-50 dark:hover:bg-dark-700"
                                    )}
                                >
                                    <div className={cn(
                                        "w-full aspect-[3/4] bg-white dark:bg-dark-700 border rounded overflow-hidden shadow-sm",
                                        currentPage === i + 1
                                            ? "border-primary-600 ring-1 ring-primary-600"
                                            : "border-gray-200 dark:border-dark-600"
                                    )}>
                                        <Page
                                            pageNumber={i + 1}
                                            width={140}
                                            renderTextLayer={false}
                                            renderAnnotationLayer={false}
                                            loading={
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <span className="text-lg font-bold text-gray-300">{i + 1}</span>
                                                </div>
                                            }
                                        />
                                    </div>
                                    <span className={cn(
                                        "text-[10px] font-bold tracking-tight",
                                        currentPage === i + 1 ? "text-primary-600" : "text-gray-400"
                                    )}>
                                        {i + 1}
                                    </span>
                                </button>
                            ))}
                        </Document>
                    )}

                    {activeTab === 'bookmarks' && (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm py-8">
                            <Bookmark size={24} className="mb-2 opacity-50" />
                            <span>{t('documentViewer.noBookmarks')}</span>
                        </div>
                    )}
                </div>
            </aside>

            {/* Toggle Handle */}
            <button
                onClick={onToggle}
                className={cn(
                    "absolute top-1/2 -translate-y-1/2 z-40 bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-600 shadow-md p-1 rounded-r-lg hover:text-primary-600 transition-all",
                    isOpen ? "translate-x-[199px]" : "translate-x-0 left-0"
                )}
            >
                {isOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
            </button>
        </>
    );
}
