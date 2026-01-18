import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

import { FileItem } from '../../../types';
import { cn } from '../../../lib/utils';
import { getSignedFileUrl, api } from '../../../lib/api';

// Sub-components
import TopBar from './TopBar';
import ThumbnailPanel from './ThumbnailPanel';
import DetailsPanel from './DetailsPanel';
import ZoomControls, { ReadingMode } from './ZoomControls';
import SearchBar from './SearchBar';
import ContextMenu, { ContextMenuState } from './ContextMenu';

// Viewers
import PDFViewer from './viewers/PDFViewer';
import TextViewer from './viewers/TextViewer';
import SpreadsheetViewer from './viewers/SpreadsheetViewer';
import OfficeViewer from './viewers/OfficeViewer';

// Hooks
import { getDocumentType, DocumentType } from './hooks/useDocumentLoader';

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

type LeftTabType = 'thumbnails' | 'bookmarks';

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

    // --- UI State ---
    const [isLeftPanelOpen, setLeftPanelOpen] = useState(true);
    const [isRightPanelOpen, setRightPanelOpen] = useState(false);
    const [isFocusMode, setFocusMode] = useState(false);
    const [isSearchOpen, setSearchOpen] = useState(false);
    const [zoom, setZoom] = useState(100);
    const [currentPage, setCurrentPage] = useState(1);
    const [activeLeftTab, setActiveLeftTab] = useState<LeftTabType>('thumbnails');
    const [showBottomBar, setShowBottomBar] = useState(true);
    const [showContextMenu, setShowContextMenu] = useState<ContextMenuState>({ show: false, x: 0, y: 0, selection: false });
    const [readingMode, setReadingMode] = useState<ReadingMode>('normal');

    // Document loading state
    const [signedUrl, setSignedUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [numPages, setNumPages] = useState<number>(0);
    const [textContent, setTextContent] = useState<string | null>(null);
    const [spreadsheetHtml, setSpreadsheetHtml] = useState<string | null>(null);
    const [spreadsheetSheets, setSpreadsheetSheets] = useState<string[]>([]);
    const [spreadsheetSheetIndex, setSpreadsheetSheetIndex] = useState(0);

    // Office conversion state
    const [isConverting, setIsConverting] = useState(false);
    const [conversionMessage, setConversionMessage] = useState<string | null>(null);
    const [conversionFailed, setConversionFailed] = useState(false);

    // Refs
    const shareId = (file as any)?.shareId as string | undefined;
    const blobUrlRef = useRef<string | null>(null);
    const canvasRef = useRef<HTMLDivElement>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const conversionPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Computed values
    const documentType = useMemo<DocumentType>(() => {
        if (!file) return 'unknown';
        return getDocumentType(file.mimeType, file.name);
    }, [file]);

    const currentFileIndex = useMemo(() => {
        if (!file || files.length === 0) return -1;
        return files.findIndex(f => f.id === file.id);
    }, [file, files]);

    const pdfOptions = useMemo(() => {
        if (!signedUrl) return null;
        return {
            url: signedUrl,
            cMapUrl: 'https://unpkg.com/pdfjs-dist@5.4.296/cmaps/',
            cMapPacked: true,
            withCredentials: true,
        };
    }, [signedUrl]);

    const pageWidth = (800 * zoom) / 100;

    const readingModeStyle = useMemo(() => {
        switch (readingMode) {
            case 'dark': return { filter: 'invert(1) hue-rotate(180deg)' };
            case 'sepia': return { filter: 'sepia(0.4) brightness(0.95)' };
            default: return {};
        }
    }, [readingMode]);

    // --- Callbacks ---
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
                const serverMessage = typeof response.data?.error === 'string' ? response.data.error : null;
                const debugMessage = typeof response.data?.details?.message === 'string' ? response.data.details.message : null;
                const combined = [serverMessage || t('errorLoadingSpreadsheet'), debugMessage].filter(Boolean).join(' ');
                setLoadError(combined);
            } else {
                setSpreadsheetHtml(response.data.html);
                setSpreadsheetSheets(response.data.sheetNames || []);
                setSpreadsheetSheetIndex(typeof response.data.currentSheet === 'number' ? response.data.currentSheet : sheetIndex);
            }
        } catch {
            setLoadError(t('errorLoadingSpreadsheet'));
        }
        setIsLoading(false);
    }, [file, t, shareId]);

    const handleSheetChange = useCallback((index: number) => {
        if (index === spreadsheetSheetIndex) return;
        setSpreadsheetSheetIndex(index);
        void loadSpreadsheetPreview(index);
    }, [spreadsheetSheetIndex, loadSpreadsheetPreview]);

    const goToPage = useCallback((page: number) => {
        if (page >= 1 && page <= numPages) {
            setCurrentPage(page);
            const pageElement = document.getElementById(`pdf-page-${page}`);
            if (pageElement) {
                pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    }, [numPages]);

    const cycleReadingMode = useCallback(() => {
        setReadingMode(current => {
            if (current === 'normal') return 'dark';
            if (current === 'dark') return 'sepia';
            return 'normal';
        });
    }, []);

    const toggleFocusMode = () => setFocusMode(!isFocusMode);

    const handleScroll = () => {
        setShowBottomBar(true);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setShowBottomBar(false), 3000);
    };

    const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
        setNumPages(numPages);
        setIsLoading(false);
    }, []);

    const onDocumentLoadError = useCallback((error: Error) => {
        console.error('PDF load error:', error);
        setLoadError(t('documentViewer.pdfError'));
        setIsLoading(false);
    }, [t]);

    // --- Document Loading Effect ---
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

        if (conversionPollingRef.current) {
            clearInterval(conversionPollingRef.current);
            conversionPollingRef.current = null;
        }

        const fetchPdfPreview = async () => {
            revokeBlobUrl();
            const pdfResponse = await api.get(`/files/${file.id}/pdf-preview`, { responseType: 'arraybuffer' });
            const blob = new Blob([pdfResponse.data], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            blobUrlRef.current = url;
            setSignedUrl(url);
        };

        const startConversionPolling = (fetchPdf: () => Promise<void>) => {
            let attempts = 0;
            const maxAttempts = 60;

            conversionPollingRef.current = setInterval(async () => {
                attempts++;
                if (attempts > maxAttempts) {
                    if (conversionPollingRef.current) clearInterval(conversionPollingRef.current);
                    setConversionMessage(t('gallery.conversionTimeout'));
                    setConversionFailed(true);
                    setIsConverting(false);
                    setIsLoading(false);
                    return;
                }

                try {
                    const statusResponse = await api.get(`/files/${file.id}/pdf-preview/status`, { validateStatus: (s: number) => s < 500 });
                    const status = statusResponse.data?.status;

                    if (status === 'completed') {
                        if (conversionPollingRef.current) clearInterval(conversionPollingRef.current);
                        await fetchPdf();
                        setIsConverting(false);
                        setConversionMessage(null);
                    } else if (status === 'failed') {
                        if (conversionPollingRef.current) clearInterval(conversionPollingRef.current);
                        setConversionMessage(t('gallery.conversionFailed'));
                        setConversionFailed(true);
                        setIsConverting(false);
                        setIsLoading(false);
                    } else {
                        setConversionMessage(t('gallery.convertingDocument'));
                    }
                } catch (error) {
                    console.error('Error polling conversion status:', error);
                }
            }, 2000);
        };

        const loadOfficePdfPreview = async () => {
            try {
                setIsConverting(true);
                setConversionMessage(t('gallery.convertingDocument'));

                const response = await api.get(`/files/${file.id}/pdf-preview`, { validateStatus: (s: number) => s < 500 });

                if (response.status === 200) {
                    await fetchPdfPreview();
                    setIsConverting(false);
                    setConversionMessage(null);
                } else if (response.status === 202) {
                    const status = response.data?.status;
                    setConversionMessage(status === 'queued' ? t('gallery.conversionQueued') : t('gallery.convertingDocument'));
                    startConversionPolling(fetchPdfPreview);
                } else {
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

        const loadDocument = async () => {
            try {
                if (documentType === 'pdf') {
                    if (shareId) {
                        const response = await api.get(`/shares/${shareId}/files/${file.id}/view`, { responseType: 'arraybuffer' });
                        const blob = new Blob([response.data], { type: 'application/pdf' });
                        const url = URL.createObjectURL(blob);
                        blobUrlRef.current = url;
                        setSignedUrl(url);
                    } else {
                        const url = await getSignedFileUrl(file.id, 'view');
                        setSignedUrl(url);
                    }
                } else if (documentType === 'text') {
                    const viewUrl = shareId ? `/shares/${shareId}/files/${file.id}/view` : `/files/${file.id}/view`;
                    const response = await api.get(viewUrl, { responseType: 'text' });
                    setTextContent(response.data);
                    setIsLoading(false);
                } else if (documentType === 'spreadsheet') {
                    await loadSpreadsheetPreview(0);
                } else if (documentType === 'office') {
                    if (shareId) {
                        setConversionFailed(true);
                        setConversionMessage(t('documentViewer.officePreviewNotSupported'));
                        setIsLoading(false);
                    } else {
                        await loadOfficePdfPreview();
                    }
                } else {
                    setIsLoading(false);
                }
            } catch (error) {
                console.error('Error loading document:', error);
                setLoadError(t('documentViewer.loadError'));
                setIsLoading(false);
            }
        };

        loadDocument();

        return () => {
            if (conversionPollingRef.current) clearInterval(conversionPollingRef.current);
            revokeBlobUrl();
        };
    }, [isOpen, file, documentType, t, shareId, revokeBlobUrl, loadSpreadsheetPreview]);

    // --- Keyboard Shortcuts ---
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                setSearchOpen(true);
            }
            if (e.key === 'Escape') {
                if (isSearchOpen) setSearchOpen(false);
                else if (isFocusMode) setFocusMode(false);
                else onClose();
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

    if (!isOpen || !file) return null;

    return createPortal(
        <div className={cn(
            "fixed inset-0 z-50 flex flex-col bg-[#F5F5F7] dark:bg-dark-900 text-gray-900 dark:text-gray-100 font-sans overflow-hidden transition-colors duration-500",
            isFocusMode && "bg-white dark:bg-dark-800"
        )}>
            {/* Top Bar */}
            {!isFocusMode && (
                <TopBar
                    file={file}
                    files={files}
                    currentFileIndex={currentFileIndex}
                    onClose={onClose}
                    onNavigate={onNavigate}
                    onShare={onShare}
                    onDownload={onDownload}
                    showSearch={documentType === 'pdf'}
                    isSearchOpen={isSearchOpen}
                    onSearchToggle={() => setSearchOpen(!isSearchOpen)}
                    isRightPanelOpen={isRightPanelOpen}
                    onRightPanelToggle={() => setRightPanelOpen(!isRightPanelOpen)}
                />
            )}

            {/* Main Container */}
            <main className="flex flex-1 overflow-hidden relative">
                {/* Left Sidebar - Only for PDFs */}
                {!isFocusMode && documentType === 'pdf' && numPages > 0 && (
                    <ThumbnailPanel
                        pdfOptions={pdfOptions}
                        numPages={numPages}
                        currentPage={currentPage}
                        goToPage={goToPage}
                        isOpen={isLeftPanelOpen}
                        onToggle={() => setLeftPanelOpen(!isLeftPanelOpen)}
                        activeTab={activeLeftTab}
                        setActiveTab={setActiveLeftTab}
                    />
                )}

                {/* Canvas Area */}
                <div
                    ref={canvasRef}
                    onScroll={handleScroll}
                    className="flex-1 overflow-y-auto scroll-smooth flex flex-col items-center py-8 relative select-text bg-gray-100 dark:bg-dark-900"
                    onContextMenu={(e) => {
                        e.preventDefault();
                        const selection = window.getSelection()?.toString();
                        setShowContextMenu({ show: true, x: e.clientX, y: e.clientY, selection: !!selection });
                    }}
                    onClick={() => setShowContextMenu({ ...showContextMenu, show: false })}
                >
                    {/* Search Box */}
                    <SearchBar isOpen={isSearchOpen} onClose={() => setSearchOpen(false)} />

                    {/* Loading State */}
                    {isLoading && (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="flex flex-col items-center gap-4">
                                <div className="w-10 h-10 border-3 border-dark-200 dark:border-dark-600 border-t-primary-500 rounded-full animate-spin" />
                                <span className="text-sm text-gray-500">{t('documentViewer.loading')}</span>
                            </div>
                        </div>
                    )}

                    {/* Error State */}
                    {loadError && (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="flex flex-col items-center gap-4 text-center max-w-md">
                                <p className="text-gray-700 dark:text-gray-300">{loadError}</p>
                                {onDownload && (
                                    <button
                                        onClick={() => onDownload(file)}
                                        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                                    >
                                        {t('common.download')}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* PDF Content */}
                    {documentType === 'pdf' && pdfOptions && !loadError && (
                        <PDFViewer
                            pdfOptions={pdfOptions}
                            numPages={numPages}
                            pageWidth={pageWidth}
                            readingModeStyle={readingModeStyle}
                            onLoadSuccess={onDocumentLoadSuccess}
                            onLoadError={onDocumentLoadError}
                        />
                    )}

                    {/* Text Content */}
                    {documentType === 'text' && textContent && !loadError && (
                        <TextViewer content={textContent} pageWidth={pageWidth} />
                    )}

                    {/* Spreadsheet Content */}
                    {documentType === 'spreadsheet' && spreadsheetHtml && !loadError && (
                        <SpreadsheetViewer
                            html={spreadsheetHtml}
                            sheets={spreadsheetSheets}
                            currentSheet={spreadsheetSheetIndex}
                            onSheetChange={handleSheetChange}
                        />
                    )}

                    {/* Office Documents */}
                    {documentType === 'office' && !loadError && (
                        <OfficeViewer
                            file={file}
                            isConverting={isConverting}
                            conversionFailed={conversionFailed}
                            conversionMessage={conversionMessage}
                            pdfOptions={pdfOptions}
                            numPages={numPages}
                            pageWidth={pageWidth}
                            onDownload={onDownload}
                            onLoadSuccess={onDocumentLoadSuccess}
                            onLoadError={onDocumentLoadError}
                        />
                    )}

                    {/* Page Floating Indicator */}
                    {documentType === 'pdf' && numPages > 0 && (
                        <div className={cn(
                            "fixed bottom-24 bg-white/90 dark:bg-dark-800/90 backdrop-blur-sm border border-gray-200 dark:border-dark-600 text-[11px] font-semibold text-gray-600 dark:text-gray-300 px-3 py-1.5 rounded-full shadow-lg transition-opacity duration-500 z-50",
                            showBottomBar ? "opacity-100" : "opacity-0"
                        )}>
                            {t('documentViewer.pageOf', { current: currentPage, total: numPages })}
                        </div>
                    )}
                </div>

                {/* Right Sidebar */}
                {!isFocusMode && (
                    <DetailsPanel
                        file={file}
                        numPages={numPages}
                        documentType={documentType}
                        isOpen={isRightPanelOpen}
                        onClose={() => setRightPanelOpen(false)}
                    />
                )}
            </main>

            {/* Bottom Bar (PDFs only) */}
            {documentType === 'pdf' && numPages > 0 && (
                <ZoomControls
                    zoom={zoom}
                    setZoom={setZoom}
                    numPages={numPages}
                    currentPage={currentPage}
                    goToPage={goToPage}
                    readingMode={readingMode}
                    cycleReadingMode={cycleReadingMode}
                    isFocusMode={isFocusMode}
                    toggleFocusMode={toggleFocusMode}
                    visible={showBottomBar || isFocusMode}
                />
            )}

            {/* Focus Mode Exit Button */}
            {isFocusMode && (
                <button
                    onClick={toggleFocusMode}
                    className="fixed top-6 right-6 z-[60] bg-white/50 dark:bg-dark-800/50 hover:bg-white dark:hover:bg-dark-800 border border-gray-200 dark:border-dark-600 text-gray-900 dark:text-gray-100 px-4 py-2 rounded-full shadow-xl text-xs font-bold transition-all flex items-center gap-2 backdrop-blur-md"
                >
                    <X size={14} /> {t('documentViewer.exitFocus')}
                </button>
            )}

            {/* Context Menu */}
            <ContextMenu
                state={showContextMenu}
                file={file}
                onClose={() => setShowContextMenu({ ...showContextMenu, show: false })}
                onDownload={onDownload}
                onShare={onShare}
            />
        </div>,
        document.body
    );
}
