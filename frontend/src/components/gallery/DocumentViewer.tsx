import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import DOMPurify from 'dompurify';
import { useTranslation } from 'react-i18next';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import {
    ChevronLeft,
    Search,
    Share2,
    Download,
    Info,
    Layers,
    Bookmark,
    Maximize2,
    Minimize2,
    Plus,
    Minus,
    X,
    FileText,
    ChevronRight,
    Copy,
    Loader2,
    AlertCircle
} from 'lucide-react';
import { FileItem } from '../../types';
import { cn, formatBytes, formatDateTime } from '../../lib/utils';
import { getSignedFileUrl, api } from '../../lib/api';

// Configure PDF.js worker
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface DocumentViewerProps {
    file: FileItem | null;
    isOpen: boolean;
    onClose: () => void;
    files?: FileItem[];
    onNavigate?: (file: FileItem) => void;
    onShare?: (file: FileItem) => void;
    onDownload?: (file: FileItem) => void;
}

type LeftTabType = 'thumbnails' | 'index' | 'bookmarks';
type DocumentType = 'pdf' | 'text' | 'spreadsheet' | 'office' | 'unknown';

interface ContextMenuState {
    show: boolean;
    x: number;
    y: number;
    selection: boolean;
}

// Helper to determine document type
function getDocumentType(mimeType: string, fileName: string): DocumentType {
    const lowerName = fileName.toLowerCase();
    if (mimeType === 'application/pdf' || lowerName.endsWith('.pdf')) {
        return 'pdf';
    }
    if (mimeType.startsWith('text/') || lowerName.endsWith('.txt') || lowerName.endsWith('.md') ||
        lowerName.endsWith('.json') || lowerName.endsWith('.xml') || lowerName.endsWith('.csv')) {
        return 'text';
    }
    const isXlsx = mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        lowerName.endsWith('.xlsx');
    if (isXlsx) {
        return 'spreadsheet';
    }
    if (mimeType.includes('word') || mimeType.includes('excel') || mimeType.includes('powerpoint') ||
        mimeType.includes('spreadsheet') || mimeType.includes('presentation') ||
        lowerName.endsWith('.doc') || lowerName.endsWith('.docx') ||
        lowerName.endsWith('.xls') ||
        lowerName.endsWith('.ppt') || lowerName.endsWith('.pptx')) {
        return 'office';
    }
    return 'unknown';
}

export default function DocumentViewer({
    file,
    isOpen,
    onClose,
    files = [],
    onNavigate,
    onShare,
    onDownload
}: DocumentViewerProps) {
    const { t } = useTranslation();

    // --- State ---
    const [isLeftPanelOpen, setLeftPanelOpen] = useState(true);
    const [isRightPanelOpen, setRightPanelOpen] = useState(false);
    const [isFocusMode, setFocusMode] = useState(false);
    const [isSearchOpen, setSearchOpen] = useState(false);
    const [zoom, setZoom] = useState(100);
    const [currentPage, setCurrentPage] = useState(1);
    const [activeLeftTab, setActiveLeftTab] = useState<LeftTabType>('thumbnails');
    const [showBottomBar, setShowBottomBar] = useState(true);
    const [showContextMenu, setShowContextMenu] = useState<ContextMenuState>({ show: false, x: 0, y: 0, selection: false });

    // Document loading state
    const [signedUrl, setSignedUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [numPages, setNumPages] = useState<number>(0);
    const [textContent, setTextContent] = useState<string | null>(null);
    const [spreadsheetHtml, setSpreadsheetHtml] = useState<string | null>(null);
    const [spreadsheetSheets, setSpreadsheetSheets] = useState<string[]>([]);
    const [spreadsheetSheetIndex, setSpreadsheetSheetIndex] = useState(0);
    const shareId = (file as any)?.shareId as string | undefined;
    const blobUrlRef = useRef<string | null>(null);

    const sanitizedSpreadsheetHtml = useMemo(() => {
        if (!spreadsheetHtml) return null;
        return DOMPurify.sanitize(spreadsheetHtml, {
            USE_PROFILES: { html: true },
            ADD_TAGS: ['table', 'thead', 'tbody', 'tr', 'th', 'td', 'br'],
            ADD_ATTR: ['style', 'rowspan', 'colspan'],
        });
    }, [spreadsheetHtml]);

    const revokeBlobUrl = useCallback(() => {
        if (blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current);
            blobUrlRef.current = null;
        }
    }, []);

    const loadSpreadsheetPreview = useCallback(async (sheetIndex: number) => {
        if (!file) return;
        setIsLoading(true);
        setLoadError(null);
        setSpreadsheetHtml(null);

        try {
            const endpoint = shareId
                ? `/shares/${shareId}/files/${file.id}/excel-html`
                : `/files/${file.id}/excel-html`;
            const response = await api.get(endpoint, {
                params: { sheet: sheetIndex },
                validateStatus: () => true,
            });

            if (response.status !== 200 || !response.data?.html) {
                const serverMessage =
                    typeof response.data?.error === 'string'
                        ? response.data.error
                        : null;
                const debugMessage =
                    typeof response.data?.details?.message === 'string'
                        ? response.data.details.message
                        : null;

                const fallback = t('errorLoadingSpreadsheet', 'Error loading spreadsheet.');
                const combined = [serverMessage || fallback, debugMessage].filter(Boolean).join(' ');

                setLoadError(combined);
                setIsLoading(false);
                return;
            }

            setSpreadsheetHtml(response.data.html);
            setSpreadsheetSheets(response.data.sheetNames || []);
            if (typeof response.data.currentSheet === 'number') {
                setSpreadsheetSheetIndex(response.data.currentSheet);
            } else {
                setSpreadsheetSheetIndex(sheetIndex);
            }
            setIsLoading(false);
        } catch (error) {
            setLoadError(t('errorLoadingSpreadsheet', 'Error loading spreadsheet.'));
            setIsLoading(false);
        }
    }, [file, t, shareId]);

    // Office PDF conversion state
    const [isConverting, setIsConverting] = useState(false);
    const [conversionMessage, setConversionMessage] = useState<string | null>(null);
    const [conversionFailed, setConversionFailed] = useState(false);
    const conversionPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const canvasRef = useRef<HTMLDivElement>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Determine document type
    const documentType = useMemo(() => {
        if (!file) return 'unknown';
        return getDocumentType(file.mimeType, file.name);
    }, [file]);

    // Current file index in the files array
    const currentFileIndex = useMemo(() => {
        if (!file || files.length === 0) return -1;
        return files.findIndex(f => f.id === file.id);
    }, [file, files]);

    // PDF options with auth header
    const pdfOptions = useMemo(() => {
        if (!signedUrl) return null;
        return {
            url: signedUrl,
            cMapUrl: 'https://unpkg.com/pdfjs-dist@5.4.296/cmaps/',
            cMapPacked: true,
            withCredentials: true,
        };
    }, [signedUrl]);

    // Fetch signed URL when file changes
    useEffect(() => {
        if (!isOpen || !file) {
            revokeBlobUrl();
            setSignedUrl(null);
            return;
        }

        setIsLoading(true);
        setLoadError(null);
        setSignedUrl(null);
        setTextContent(null);
        setSpreadsheetHtml(null);
        setSpreadsheetSheets([]);
        setSpreadsheetSheetIndex(0);
        setCurrentPage(1);
        setNumPages(0);
        setIsConverting(false);
        setConversionMessage(null);
        setConversionFailed(false);
        revokeBlobUrl();

        // Clear any existing polling
        if (conversionPollingRef.current) {
            clearInterval(conversionPollingRef.current);
            conversionPollingRef.current = null;
        }

        const loadDocument = async () => {
            try {
                if (documentType === 'pdf') {
                    if (shareId) {
                        const response = await api.get(`/shares/${shareId}/files/${file.id}/view`, {
                            responseType: 'arraybuffer',
                        });
                        const blob = new Blob([response.data], { type: 'application/pdf' });
                        const url = URL.createObjectURL(blob);
                        blobUrlRef.current = url;
                        setSignedUrl(url);
                    } else {
                        const url = await getSignedFileUrl(file.id, 'view');
                        setSignedUrl(url);
                    }
                } else if (documentType === 'text') {
                    // For text files, fetch content directly
                    const viewUrl = shareId
                        ? `/shares/${shareId}/files/${file.id}/view`
                        : `/files/${file.id}/view`;
                    const response = await api.get(viewUrl, {
                        responseType: 'text',
                    });
                    setTextContent(response.data);
                    setIsLoading(false);
                } else if (documentType === 'spreadsheet') {
                    await loadSpreadsheetPreview(0);
                } else if (documentType === 'office') {
                    if (shareId) {
                        setConversionFailed(true);
                        setConversionMessage(t('documentViewer.officePreviewNotSupported', 'Preview is not available for this file type. Please download the file to view it.'));
                        setIsLoading(false);
                    } else {
                        // For office documents, try to get PDF preview
                        await loadOfficePdfPreview();
                    }
                } else {
                    setIsLoading(false);
                }
            } catch (error) {
                console.error('Error loading document:', error);
                setLoadError(t('documentViewer.loadError', 'Failed to load document'));
                setIsLoading(false);
            }
        };

        // Function to load Office PDF preview with polling
        const loadOfficePdfPreview = async () => {
            try {
                setIsConverting(true);
                setConversionMessage(t('gallery.convertingDocument', 'Converting document to PDF...'));

                const fetchPdfPreview = async () => {
                    revokeBlobUrl();
                    const pdfResponse = await api.get(`/files/${file.id}/pdf-preview`, {
                        responseType: 'arraybuffer',
                    });
                    const blob = new Blob([pdfResponse.data], { type: 'application/pdf' });
                    const url = URL.createObjectURL(blob);
                    blobUrlRef.current = url;
                    setSignedUrl(url);
                };

                const response = await api.get(`/files/${file.id}/pdf-preview`, {
                    validateStatus: (status) => status < 500, // Don't throw on 202/404
                });

                if (response.status === 200) {
                    await fetchPdfPreview();
                    setIsConverting(false);
                    setConversionMessage(null);
                } else if (response.status === 202) {
                    // Conversion in progress - start polling
                    const status = response.data?.status;
                    if (status === 'queued') {
                        setConversionMessage(t('gallery.conversionQueued', 'Document is being prepared...'));
                    } else {
                        setConversionMessage(t('gallery.convertingDocument', 'Converting document to PDF...'));
                    }
                    startConversionPolling(fetchPdfPreview);
                } else if (response.status === 404 || response.status === 503) {
                    // Conversion service unavailable or file not found
                    setConversionFailed(true);
                    setIsConverting(false);
                    setIsLoading(false);
                } else {
                    // Other error
                    setConversionFailed(true);
                    setIsConverting(false);
                    setIsLoading(false);
                }
            } catch (error) {
                console.error('Error requesting PDF preview:', error);
                setConversionFailed(true);
                setIsConverting(false);
                setIsLoading(false);
            }
        };

        // Polling function for conversion status
        const startConversionPolling = (fetchPdfPreview: () => Promise<void>) => {
            let attempts = 0;
            const maxAttempts = 60; // 60 * 2s = 2 minutes max

            conversionPollingRef.current = setInterval(async () => {
                attempts++;
                if (attempts > maxAttempts) {
                    // Timeout
                    if (conversionPollingRef.current) {
                        clearInterval(conversionPollingRef.current);
                    }
                    setConversionMessage(t('gallery.conversionTimeout', 'Conversion took too long. Please download the file.'));
                    setConversionFailed(true);
                    setIsConverting(false);
                    setIsLoading(false);
                    return;
                }

                try {
                    const statusResponse = await api.get(`/files/${file.id}/pdf-preview/status`, {
                        validateStatus: (status) => status < 500,
                    });

                    const status = statusResponse.data?.status;

                    if (status === 'completed') {
                        if (conversionPollingRef.current) {
                            clearInterval(conversionPollingRef.current);
                        }
                        await fetchPdfPreview();
                        setIsConverting(false);
                        setConversionMessage(null);
                    } else if (status === 'failed') {
                        if (conversionPollingRef.current) {
                            clearInterval(conversionPollingRef.current);
                        }
                        setConversionMessage(t('gallery.conversionFailed', 'Failed to convert document.'));
                        setConversionFailed(true);
                        setIsConverting(false);
                        setIsLoading(false);
                    } else {
                        // Still processing
                        setConversionMessage(t('gallery.convertingDocument', 'Converting document to PDF...'));
                    }
                } catch (error) {
                    console.error('Error polling conversion status:', error);
                }
            }, 2000);
        };

        loadDocument();

        // Cleanup
        return () => {
            if (conversionPollingRef.current) {
                clearInterval(conversionPollingRef.current);
            }
            revokeBlobUrl();
        };
    }, [isOpen, file, documentType, t, shareId, revokeBlobUrl, loadSpreadsheetPreview]);

    const handleSheetChange = useCallback((index: number) => {
        if (index === spreadsheetSheetIndex) return;
        setSpreadsheetSheetIndex(index);
        void loadSpreadsheetPreview(index);
    }, [spreadsheetSheetIndex, loadSpreadsheetPreview]);

    // --- Keyboard Shortcuts ---
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                setSearchOpen(true);
            }
            if (e.key === 'Escape') {
                if (isSearchOpen) {
                    setSearchOpen(false);
                } else if (isFocusMode) {
                    setFocusMode(false);
                } else {
                    onClose();
                }
            }
            if (e.key === '+' || e.key === '=') setZoom(prev => Math.min(prev + 10, 300));
            if (e.key === '-') setZoom(prev => Math.max(prev - 10, 25));
            if (e.key === 'ArrowLeft' && files.length > 0 && currentFileIndex > 0) {
                onNavigate?.(files[currentFileIndex - 1]);
            }
            if (e.key === 'ArrowRight' && files.length > 0 && currentFileIndex < files.length - 1) {
                onNavigate?.(files[currentFileIndex + 1]);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, isSearchOpen, isFocusMode, onClose, files, currentFileIndex, onNavigate]);

    // Handle Bottom Bar Visibility on Scroll
    const handleScroll = () => {
        setShowBottomBar(true);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setShowBottomBar(false), 3000);
    };

    const toggleFocusMode = () => setFocusMode(!isFocusMode);

    // PDF load handlers
    const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
        setNumPages(numPages);
        setIsLoading(false);
    }, []);

    const onDocumentLoadError = useCallback((error: Error) => {
        console.error('PDF load error:', error);
        setLoadError(t('documentViewer.pdfError', 'Failed to load PDF'));
        setIsLoading(false);
    }, [t]);

    // Navigate to page
    const goToPage = useCallback((page: number) => {
        if (page >= 1 && page <= numPages) {
            setCurrentPage(page);
            // Scroll to the page
            const pageElement = document.getElementById(`pdf-page-${page}`);
            if (pageElement) {
                pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    }, [numPages]);

    // Navigate between documents
    const goToPrevDocument = useCallback(() => {
        if (currentFileIndex > 0) {
            onNavigate?.(files[currentFileIndex - 1]);
        }
    }, [currentFileIndex, files, onNavigate]);

    const goToNextDocument = useCallback(() => {
        if (currentFileIndex < files.length - 1) {
            onNavigate?.(files[currentFileIndex + 1]);
        }
    }, [currentFileIndex, files, onNavigate]);

    if (!isOpen || !file) return null;

    // Calculate page width based on zoom
    const pageWidth = (800 * zoom) / 100;

    return createPortal(
        <div className={cn(
            "fixed inset-0 z-50 flex flex-col bg-[#F5F5F7] dark:bg-dark-900 text-gray-900 dark:text-gray-100 font-sans overflow-hidden transition-colors duration-500",
            isFocusMode && "bg-white dark:bg-dark-800"
        )}>

            {/* Top Bar */}
            {!isFocusMode && (
                <header
                    className="h-[56px] border-b border-gray-200 dark:border-dark-700 bg-white dark:bg-dark-800 flex items-center justify-between px-4 z-40 shrink-0"
                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setShowContextMenu({ ...showContextMenu, show: false }); }}
                >
                    <div className="flex items-center gap-3 w-1/3">
                        <button
                            onClick={onClose}
                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg transition-colors"
                            title={t('common.back', 'Back')}
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
                        {documentType === 'pdf' && (
                            <button
                                onClick={() => setSearchOpen(!isSearchOpen)}
                                className={cn(
                                    "p-2 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg transition-colors",
                                    isSearchOpen ? "text-primary-600" : "text-gray-600 dark:text-gray-400"
                                )}
                                title={t('documentViewer.search', 'Search (Ctrl+F)')}
                            >
                                <Search size={18} />
                            </button>
                        )}
                        {onShare && file && (
                            <button
                                onClick={(e) => { e.stopPropagation(); if (file) onShare(file); }}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg transition-colors text-gray-600 dark:text-gray-400"
                                title={t('common.share', 'Share')}
                                aria-label={t('common.share', 'Share')}
                            >
                                <Share2 size={18} />
                            </button>
                        )}
                        {onDownload && file && (
                            <button
                                onClick={(e) => { e.stopPropagation(); if (file) onDownload(file); }}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg transition-colors text-gray-600 dark:text-gray-400"
                                title={t('common.download', 'Download')}
                                aria-label={t('common.download', 'Download')}
                            >
                                <Download size={18} />
                            </button>
                        )}
                        <div className="w-[1px] h-4 bg-gray-200 dark:bg-dark-600 mx-1" />
                        <button
                            onClick={() => setRightPanelOpen(!isRightPanelOpen)}
                            className={cn(
                                "p-2 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg transition-colors",
                                isRightPanelOpen ? "text-primary-600 bg-primary-50 dark:bg-primary-900/20" : "text-gray-600 dark:text-gray-400"
                            )}
                            title={t('documentViewer.details', 'Details')}
                        >
                            <Info size={18} />
                        </button>
                    </div>
                </header>
            )}

            {/* Main Container */}
            <main className="flex flex-1 overflow-hidden relative">

                {/* Left Sidebar (Collapsible) - Only for PDFs */}
                {!isFocusMode && documentType === 'pdf' && numPages > 0 && (
                    <aside
                        className={cn(
                            "transition-all duration-300 border-r border-gray-200 dark:border-dark-700 bg-white dark:bg-dark-800 flex flex-col z-30 shadow-sm",
                            isLeftPanelOpen ? "w-[200px]" : "w-0 overflow-hidden border-none"
                        )}
                        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    >
                        <div className="flex border-b border-gray-100 dark:border-dark-700">
                            <button
                                onClick={() => setActiveLeftTab('thumbnails')}
                                className={cn(
                                    "flex-1 py-3 text-xs font-medium flex items-center justify-center gap-2 border-b-2 transition-all",
                                    activeLeftTab === 'thumbnails' ? "border-primary-600 text-primary-600" : "border-transparent text-gray-400 hover:text-gray-600"
                                )}
                                title={t('documentViewer.thumbnails', 'Thumbnails')}
                            >
                                <Layers size={14} />
                            </button>
                            <button
                                onClick={() => setActiveLeftTab('bookmarks')}
                                className={cn(
                                    "flex-1 py-3 text-xs font-medium flex items-center justify-center gap-2 border-b-2 transition-all",
                                    activeLeftTab === 'bookmarks' ? "border-primary-600 text-primary-600" : "border-transparent text-gray-400 hover:text-gray-600"
                                )}
                                title={t('documentViewer.bookmarks', 'Bookmarks')}
                            >
                                <Bookmark size={14} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-gray-200 hover:scrollbar-thumb-gray-300">
                            {activeLeftTab === 'thumbnails' && pdfOptions && (
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

                            {activeLeftTab === 'bookmarks' && (
                                <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm py-8">
                                    <Bookmark size={24} className="mb-2 opacity-50" />
                                    <span>{t('documentViewer.noBookmarks', 'No bookmarks')}</span>
                                </div>
                            )}
                        </div>
                    </aside>
                )}

                {/* Floating Panel Handle Left */}
                {!isFocusMode && documentType === 'pdf' && numPages > 0 && (
                    <button
                        onClick={() => setLeftPanelOpen(!isLeftPanelOpen)}
                        className={cn(
                            "absolute top-1/2 -translate-y-1/2 z-40 bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-600 shadow-md p-1 rounded-r-lg hover:text-primary-600 transition-all",
                            isLeftPanelOpen ? "translate-x-[199px]" : "translate-x-0 left-0"
                        )}
                    >
                        {isLeftPanelOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                    </button>
                )}

                {/* Canvas Area */}
                <div
                    ref={canvasRef}
                    onScroll={handleScroll}
                    className="flex-1 overflow-y-auto scroll-smooth flex flex-col items-center py-8 relative select-text bg-gray-100 dark:bg-dark-900"
                    onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const selection = window.getSelection()?.toString();
                        setShowContextMenu({ show: true, x: e.clientX, y: e.clientY, selection: !!selection });
                    }}
                    onClick={() => setShowContextMenu({ ...showContextMenu, show: false })}
                >
                    {/* Search Box */}
                    {isSearchOpen && (
                        <div className="sticky top-0 z-50 w-full flex justify-center px-4 pointer-events-none mb-4">
                            <div className="bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-600 shadow-2xl rounded-xl p-2 flex items-center gap-2 pointer-events-auto min-w-[320px]">
                                <Search size={16} className="text-gray-400 ml-2" />
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder={t('documentViewer.searchPlaceholder', 'Search in document...')}
                                    className="flex-1 text-sm bg-transparent border-none focus:ring-0 placeholder:text-gray-400"
                                />
                                <button
                                    onClick={(e) => { e.stopPropagation(); setSearchOpen(false); }}
                                    className="p-1.5 hover:bg-gray-100 dark:hover:bg-dark-700 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                    title={t('common.close', 'Close')}
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Loading State */}
                    {isLoading && (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="flex flex-col items-center gap-4">
                                <Loader2 className="w-10 h-10 animate-spin text-primary-600" />
                                <span className="text-sm text-gray-500">{t('documentViewer.loading', 'Loading document...')}</span>
                            </div>
                        </div>
                    )}

                    {/* Error State */}
                    {loadError && (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="flex flex-col items-center gap-4 text-center max-w-md">
                                <AlertCircle className="w-12 h-12 text-red-500" />
                                <p className="text-gray-700 dark:text-gray-300">{loadError}</p>
                                {onDownload && (
                                    <button
                                        onClick={() => onDownload(file)}
                                        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                                    >
                                        {t('common.download', 'Download')}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* PDF Content */}
                    {documentType === 'pdf' && pdfOptions && !loadError && (
                        <Document
                            file={pdfOptions}
                            onLoadSuccess={onDocumentLoadSuccess}
                            onLoadError={onDocumentLoadError}
                            loading={null}
                            className="flex flex-col items-center gap-4"
                        >
                            {Array.from({ length: numPages }).map((_, i) => (
                                <div
                                    key={i}
                                    id={`pdf-page-${i + 1}`}
                                    className="bg-white shadow-lg"
                                    style={{ maxWidth: '95vw' }}
                                >
                                    <Page
                                        pageNumber={i + 1}
                                        width={pageWidth}
                                        renderTextLayer={true}
                                        renderAnnotationLayer={true}
                                        onRenderSuccess={() => {
                                            // Update current page based on visibility
                                        }}
                                    />
                                </div>
                            ))}
                        </Document>
                    )}

                    {/* Text Content */}
                    {documentType === 'text' && textContent && !loadError && (
                        <div
                            className="bg-white dark:bg-dark-800 shadow-lg rounded-lg p-8 mx-4"
                            style={{ width: `${pageWidth}px`, maxWidth: '95vw', minHeight: '60vh' }}
                        >
                            <pre className="whitespace-pre-wrap break-words max-w-full font-mono text-sm text-gray-800 dark:text-gray-200 overflow-x-hidden">
                                {textContent}
                            </pre>
                        </div>
                    )}

                    {/* Spreadsheet Content */}
                    {documentType === 'spreadsheet' && spreadsheetHtml && !loadError && (
                        <div className="flex flex-col items-center gap-4 w-full">
                            {spreadsheetSheets.length > 1 && (
                                <div className="flex flex-wrap items-center justify-center gap-2 px-4">
                                    {spreadsheetSheets.map((sheet, index) => (
                                        <button
                                            key={`${sheet}-${index}`}
                                            type="button"
                                            onClick={() => handleSheetChange(index)}
                                            className={cn(
                                                "px-3 py-1.5 text-xs rounded-full border transition-colors",
                                                spreadsheetSheetIndex === index
                                                    ? "bg-primary-600 text-white border-primary-600"
                                                    : "bg-white dark:bg-dark-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-dark-700 hover:bg-gray-50 dark:hover:bg-dark-700"
                                            )}
                                        >
                                            {sheet || `${t('documents.sheet', 'Sheet')} ${index + 1}`}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <div
                                className="bg-white dark:bg-dark-800 shadow-lg rounded-lg p-4 mx-4 overflow-auto w-full"
                                style={{ width: 'min(1600px, 95vw)', minHeight: '70vh', maxHeight: '85vh' }}
                            >
                                <div dangerouslySetInnerHTML={{ __html: sanitizedSpreadsheetHtml || '' }} />
                            </div>
                        </div>
                    )}

                    {/* Office Documents - Converting or PDF Preview or Download Prompt */}
                    {documentType === 'office' && !loadError && (
                        <>
                            {/* Conversion in progress */}
                            {isConverting && (
                                <div className="flex-1 flex items-center justify-center">
                                    <div className="flex flex-col items-center gap-4 text-center max-w-md p-8 bg-white dark:bg-dark-800 rounded-xl shadow-lg">
                                        <Loader2 className="w-12 h-12 text-primary-600 animate-spin" />
                                        <div>
                                            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">
                                                {file.name}
                                            </h3>
                                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                                {conversionMessage || t('gallery.convertingDocument', 'Converting document to PDF...')}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Converted PDF Preview */}
                            {!isConverting && signedUrl && pdfOptions && (
                                <Document
                                    file={pdfOptions}
                                    onLoadSuccess={onDocumentLoadSuccess}
                                    onLoadError={onDocumentLoadError}
                                    loading={null}
                                    className="flex flex-col items-center gap-4"
                                >
                                    {Array.from({ length: numPages }).map((_, i) => (
                                        <div
                                            key={i}
                                            id={`pdf-page-${i + 1}`}
                                            className="bg-white shadow-lg"
                                            style={{ maxWidth: '95vw' }}
                                        >
                                            <Page
                                                pageNumber={i + 1}
                                                width={pageWidth}
                                                renderTextLayer={true}
                                                renderAnnotationLayer={true}
                                            />
                                        </div>
                                    ))}
                                </Document>
                            )}

                            {/* Conversion failed - Download Prompt */}
                            {!isConverting && conversionFailed && !signedUrl && (
                                <div className="flex-1 flex items-center justify-center">
                                    <div className="flex flex-col items-center gap-6 text-center max-w-md p-8 bg-white dark:bg-dark-800 rounded-xl shadow-lg">
                                        <FileText className="w-16 h-16 text-gray-400" />
                                        <div>
                                            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">
                                                {file.name}
                                            </h3>
                                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                                {conversionMessage || t('documentViewer.officePreviewNotSupported', 'Preview is not available for this file type. Please download the file to view it.')}
                                            </p>
                                        </div>
                                        {onDownload && (
                                            <button
                                                onClick={() => onDownload(file)}
                                                className="flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
                                            >
                                                <Download size={18} />
                                                {t('common.download', 'Download')}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* Page Floating Indicator */}
                    {documentType === 'pdf' && numPages > 0 && (
                        <div className={cn(
                            "fixed bottom-24 bg-white/90 dark:bg-dark-800/90 backdrop-blur-sm border border-gray-200 dark:border-dark-600 text-[11px] font-semibold text-gray-600 dark:text-gray-300 px-3 py-1.5 rounded-full shadow-lg transition-opacity duration-500 z-50",
                            showBottomBar ? "opacity-100" : "opacity-0"
                        )}>
                            {t('documentViewer.pageOf', 'Page {{current}} of {{total}}', { current: currentPage, total: numPages })}
                        </div>
                    )}
                </div>

                {/* Right Sidebar (Info) */}
                {!isFocusMode && (
                    <aside
                        className={cn(
                            "transition-all duration-300 border-l border-gray-200 dark:border-dark-700 bg-white dark:bg-dark-800 flex flex-col z-30 shadow-sm",
                            isRightPanelOpen ? "w-[280px]" : "w-0 overflow-hidden border-none"
                        )}
                        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    >
                        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-dark-700">
                            <h3 className="text-sm font-semibold flex items-center gap-2 text-gray-700 dark:text-gray-200">
                                <Info size={16} className="text-gray-400" /> {t('documentViewer.details', 'Details')}
                            </h3>
                            <button onClick={() => setRightPanelOpen(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-dark-700 rounded transition-colors text-gray-400">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-gray-200 hover:scrollbar-thumb-gray-300">
                            {/* File Info Section */}
                            <section className="space-y-4">
                                <div className="flex items-start gap-3">
                                    <div className="p-2.5 bg-primary-50 dark:bg-primary-900/20 rounded-lg text-primary-600">
                                        <FileText size={20} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-sm font-medium leading-none mb-1 truncate">{file.name}</h4>
                                        <p className="text-xs text-gray-500">{file.mimeType}</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4 pt-2">
                                    <div>
                                        <h4 className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1">{t('common.size', 'Size')}</h4>
                                        <p className="text-xs text-gray-700 dark:text-gray-300">{formatBytes(file.size)}</p>
                                    </div>
                                    {documentType === 'pdf' && numPages > 0 && (
                                        <div>
                                            <h4 className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1">{t('documentViewer.pages', 'Pages')}</h4>
                                            <p className="text-xs text-gray-700 dark:text-gray-300">{numPages}</p>
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <h4 className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1">{t('common.modified', 'Modified')}</h4>
                                    <p className="text-xs text-gray-700 dark:text-gray-300">{formatDateTime(file.updatedAt)}</p>
                                </div>
                                <div>
                                    <h4 className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1">{t('common.created', 'Created')}</h4>
                                    <p className="text-xs text-gray-700 dark:text-gray-300">{formatDateTime(file.createdAt)}</p>
                                </div>
                            </section>
                        </div>
                    </aside>
                )}
            </main>

            {/* Bottom Bar (Auto-hide Floating) */}
            {documentType === 'pdf' && numPages > 0 && (
                <footer
                    className={cn(
                        "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-500",
                        (showBottomBar || isFocusMode) ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"
                    )}
                >
                    <div className="bg-white/95 dark:bg-dark-800/95 backdrop-blur-md border border-gray-200 dark:border-dark-600 shadow-2xl rounded-2xl h-[48px] px-2 flex items-center gap-4">
                        {/* Zoom controls */}
                        <div className="flex items-center gap-1 bg-gray-50 dark:bg-dark-700 rounded-xl p-1 shrink-0">
                            <button
                                onClick={() => setZoom(prev => Math.max(prev - 10, 25))}
                                className="p-1.5 hover:bg-white dark:hover:bg-dark-600 hover:shadow-sm rounded-lg text-gray-600 dark:text-gray-300 transition-all"
                                title={t('gallery.zoomOut', 'Zoom out')}
                            >
                                <Minus size={14} />
                            </button>
                            <button className="px-2 text-xs font-bold text-gray-700 dark:text-gray-200 min-w-[45px] text-center">
                                {zoom}%
                            </button>
                            <button
                                onClick={() => setZoom(prev => Math.min(prev + 10, 300))}
                                className="p-1.5 hover:bg-white dark:hover:bg-dark-600 hover:shadow-sm rounded-lg text-gray-600 dark:text-gray-300 transition-all"
                                title={t('gallery.zoomIn', 'Zoom in')}
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

                        {/* Focus mode toggle */}
                        <button
                            onClick={toggleFocusMode}
                            className={cn(
                                "p-2 rounded-xl transition-all",
                                isFocusMode ? "bg-primary-600 text-white" : "hover:bg-gray-100 dark:hover:bg-dark-700 text-gray-600 dark:text-gray-300"
                            )}
                            title={isFocusMode ? t('documentViewer.exitFocusMode', 'Exit focus mode') : t('documentViewer.focusMode', 'Focus mode')}
                        >
                            {isFocusMode ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                        </button>
                    </div>
                </footer>
            )}

            {/* Focus Mode Exit Button */}
            {isFocusMode && (
                <button
                    onClick={toggleFocusMode}
                    className="fixed top-6 right-6 z-[60] bg-white/50 dark:bg-dark-800/50 hover:bg-white dark:hover:bg-dark-800 border border-gray-200 dark:border-dark-600 text-gray-900 dark:text-gray-100 px-4 py-2 rounded-full shadow-xl text-xs font-bold transition-all flex items-center gap-2 backdrop-blur-md"
                >
                    <X size={14} /> {t('documentViewer.exitFocus', 'Exit focus')}
                </button>
            )}

            {/* Custom Context Menu */}
            {showContextMenu.show && (
                <div
                    className="fixed z-[100] bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-600 shadow-2xl rounded-xl py-1.5 min-w-[160px] select-none"
                    style={{ top: showContextMenu.y, left: showContextMenu.x }}
                >
                    {showContextMenu.selection ? (
                        <>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(window.getSelection()?.toString() || '');
                                    setShowContextMenu({ ...showContextMenu, show: false });
                                }}
                                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:text-primary-600 transition-colors"
                            >
                                <Copy size={14} /> {t('common.copy', 'Copy')}
                            </button>
                        </>
                    ) : (
                        <>
                            {onDownload && file && (
                                <button
                                    onClick={() => {
                                        if (file) onDownload(file);
                                        setShowContextMenu({ ...showContextMenu, show: false });
                                    }}
                                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:text-primary-600 transition-colors"
                                >
                                    <Download size={14} /> {t('common.download', 'Download')}
                                </button>
                            )}
                            {onShare && file && (
                                <button
                                    onClick={() => {
                                        if (file) onShare(file);
                                        setShowContextMenu({ ...showContextMenu, show: false });
                                    }}
                                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:text-primary-600 transition-colors"
                                >
                                    <Share2 size={14} /> {t('common.share', 'Share')}
                                </button>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>,
        document.body
    );
}
