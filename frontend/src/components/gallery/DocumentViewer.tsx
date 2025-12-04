import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import {
  X,
  Download,
  Share2,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Loader2,
  FileText,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { FileItem } from '../../types';
import { getFileUrl, api } from '../../lib/api';
import mammoth from 'mammoth';
import { Document, Page, pdfjs } from 'react-pdf';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// Type for spreadsheet data from backend
interface SpreadsheetData {
  html: string;
  sheetNames: string[];
  currentSheet: number;
}

interface DocumentViewerProps {
  file: FileItem | null;
  isOpen: boolean;
  onClose: () => void;
  onShare?: (file: FileItem) => void;
  onDownload?: (file: FileItem) => void;
  files?: FileItem[];
  onNavigate?: (file: FileItem) => void;
}

type DocumentType = 'pdf' | 'word' | 'text' | 'code' | 'spreadsheet' | 'unknown';

const getDocumentType = (mimeType: string, fileName: string): DocumentType => {
  if (mimeType === 'application/pdf') return 'pdf';
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword' ||
    fileName.endsWith('.docx') ||
    fileName.endsWith('.doc')
  ) {
    return 'word';
  }
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.ms-excel' ||
    fileName.endsWith('.xlsx') ||
    fileName.endsWith('.xls') ||
    fileName.endsWith('.csv')
  ) {
    return 'spreadsheet';
  }
  if (
    mimeType.startsWith('text/') ||
    fileName.endsWith('.txt') ||
    fileName.endsWith('.md') ||
    fileName.endsWith('.json') ||
    fileName.endsWith('.xml') ||
    fileName.endsWith('.yaml') ||
    fileName.endsWith('.yml')
  ) {
    return 'text';
  }
  if (
    fileName.endsWith('.js') ||
    fileName.endsWith('.ts') ||
    fileName.endsWith('.tsx') ||
    fileName.endsWith('.jsx') ||
    fileName.endsWith('.py') ||
    fileName.endsWith('.java') ||
    fileName.endsWith('.c') ||
    fileName.endsWith('.cpp') ||
    fileName.endsWith('.h') ||
    fileName.endsWith('.cs') ||
    fileName.endsWith('.php') ||
    fileName.endsWith('.rb') ||
    fileName.endsWith('.go') ||
    fileName.endsWith('.rs') ||
    fileName.endsWith('.swift') ||
    fileName.endsWith('.kt') ||
    fileName.endsWith('.html') ||
    fileName.endsWith('.css') ||
    fileName.endsWith('.scss') ||
    fileName.endsWith('.sql')
  ) {
    return 'code';
  }
  return 'unknown';
};

export default function DocumentViewer({
  file,
  isOpen,
  onClose,
  onShare,
  onDownload,
  files = [],
  onNavigate,
}: DocumentViewerProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState<string>('');
  const [spreadsheetData, setSpreadsheetData] = useState<SpreadsheetData | null>(null);
  const [zoom, setZoom] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  const documentType = file ? getDocumentType(file.mimeType, file.name) : 'unknown';
  const currentIndex = files.findIndex((f) => f.id === file?.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < files.length - 1;

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setLoading(false);
  }, []);

  const onDocumentLoadError = useCallback(() => {
    setError(t('gallery.loadError'));
    setLoading(false);
  }, [t]);

  useEffect(() => {
    if (!isOpen || !file) return;

    setLoading(true);
    setError(null);
    setContent('');
    setSpreadsheetData(null);
    setZoom(100);
    setCurrentPage(1);
    setNumPages(0);

    const loadDocument = async () => {
      try {
        const fileUrl = getFileUrl(file.id, 'view');

        switch (documentType) {
          case 'pdf':
            // PDF will be rendered via react-pdf
            // Loading state will be handled by onDocumentLoadSuccess
            break;

          case 'word':
            // Fetch and convert Word document
            const response = await fetch(fileUrl);
            const arrayBuffer = await response.arrayBuffer();
            const result = await mammoth.convertToHtml({ arrayBuffer });
            setContent(result.value);
            setLoading(false);
            break;

          case 'text':
          case 'code':
            // Fetch text content
            const textResponse = await fetch(fileUrl);
            const text = await textResponse.text();
            setContent(text);
            setLoading(false);
            break;

          case 'spreadsheet':
            // Use backend to convert Excel to HTML with styles
            try {
              const response = await api.get(`/files/${file.id}/excel-html?sheet=0`);
              setSpreadsheetData(response.data);
            } catch (err) {
              console.error('Error loading spreadsheet:', err);
              setError(t('gallery.errorLoadingSpreadsheet'));
            }
            setLoading(false);
            break;

          default:
            setError(t('gallery.unsupportedDocument'));
            setLoading(false);
        }
      } catch (err) {
        console.error('Error loading document:', err);
        setError(t('gallery.errorLoading'));
        setLoading(false);
      }
    };

    loadDocument();
  }, [isOpen, file, documentType]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          if (documentType === 'pdf' && currentPage > 1) {
            setCurrentPage(prev => prev - 1);
          } else if (hasPrev && onNavigate) {
            onNavigate(files[currentIndex - 1]);
          }
          break;
        case 'ArrowRight':
          if (documentType === 'pdf' && currentPage < numPages) {
            setCurrentPage(prev => prev + 1);
          } else if (hasNext && onNavigate) {
            onNavigate(files[currentIndex + 1]);
          }
          break;
        case 'ArrowUp':
          if (documentType === 'pdf' && currentPage > 1) {
            setCurrentPage(prev => prev - 1);
          }
          break;
        case 'ArrowDown':
          if (documentType === 'pdf' && currentPage < numPages) {
            setCurrentPage(prev => prev + 1);
          }
          break;
        case '+':
        case '=':
          e.preventDefault();
          setZoom((prev) => Math.min(prev + 25, 200));
          break;
        case '-':
          e.preventDefault();
          setZoom((prev) => Math.max(prev - 25, 50));
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, hasPrev, hasNext, currentIndex, files, onNavigate, documentType, currentPage, numPages]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const switchSheet = async (sheetIndex: number) => {
    if (!spreadsheetData || !file) return;
    
    try {
      setLoading(true);
      const response = await api.get(`/files/${file.id}/excel-html?sheet=${sheetIndex}`);
      setSpreadsheetData(response.data);
    } catch (err) {
      console.error('Error switching sheet:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  if (!isOpen || !file) return null;

  const fileUrl = getFileUrl(file.id, 'view');

  const renderContent = () => {
    if (error) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4">
          <FileText className="w-16 h-16 text-white/40" />
          <p className="text-white/60 text-center max-w-md">{error}</p>
          {onDownload && (
            <button
              onClick={() => onDownload(file)}
              className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
            >
              {t('gallery.downloadFile')}
            </button>
          )}
        </div>
      );
    }

    // Show loading for non-PDF documents
    if (loading && documentType !== 'pdf') {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4">
          <Loader2 className="w-12 h-12 text-primary-500 animate-spin" />
          <p className="text-white/60">{t('gallery.loading')}</p>
        </div>
      );
    }

    switch (documentType) {
      case 'pdf':
        return (
          <div 
            ref={pdfContainerRef}
            className="h-full overflow-auto flex flex-col items-center py-4"
          >
            <Document
              file={fileUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={
                <div className="flex flex-col items-center justify-center h-64 gap-4">
                  <Loader2 className="w-12 h-12 text-primary-500 animate-spin" />
                  <p className="text-white/60">{t('gallery.loadingPdf')}</p>
                </div>
              }
              className="flex flex-col items-center gap-4"
            >
              <Page
                pageNumber={currentPage}
                scale={zoom / 100}
                renderTextLayer={true}
                renderAnnotationLayer={true}
                className="shadow-2xl"
              />
            </Document>
          </div>
        );

      case 'word':
        return (
          <div
            className="w-full h-full overflow-auto bg-white rounded-lg p-8"
            style={{ fontSize: `${zoom}%` }}
          >
            <div
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: content }}
            />
          </div>
        );

      case 'text':
        return (
          <div
            className="w-full h-full overflow-auto bg-white dark:bg-dark-900 rounded-lg p-6"
            style={{ fontSize: `${zoom}%` }}
          >
            <pre className="whitespace-pre-wrap font-sans text-dark-900 dark:text-white">
              {content}
            </pre>
          </div>
        );

      case 'code':
        return (
          <div
            className="w-full h-full overflow-auto bg-dark-900 rounded-lg p-6"
            style={{ fontSize: `${zoom}%` }}
          >
            <pre className="whitespace-pre-wrap font-mono text-sm text-green-400">
              {content}
            </pre>
          </div>
        );

      case 'spreadsheet':
        if (!spreadsheetData) return null;
        return (
          <div className="w-full h-full overflow-hidden bg-white rounded-lg flex flex-col">
            {/* Sheet tabs */}
            {spreadsheetData.sheetNames.length > 1 && (
              <div className="flex-shrink-0 flex gap-1 p-2 bg-gray-100 border-b overflow-x-auto">
                {spreadsheetData.sheetNames.map((name, index) => (
                  <button
                    key={name}
                    onClick={() => switchSheet(index)}
                    className={`px-3 py-1.5 text-sm rounded whitespace-nowrap transition-colors ${
                      spreadsheetData.currentSheet === index
                        ? 'bg-green-500 text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
            {/* Excel HTML content */}
            <div 
              className="flex-1 overflow-auto p-2"
              style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top left' }}
              dangerouslySetInnerHTML={{ __html: spreadsheetData.html }}
            />
          </div>
        );

      default:
        return (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <FileText className="w-16 h-16 text-white/40" />
            <p className="text-white/60">{t('gallery.unsupportedType')}</p>
          </div>
        );
    }
  };

  return createPortal(
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black/95 flex flex-col"
      onClick={(e) => {
        if (e.target === containerRef.current) {
          onClose();
        }
      }}
    >
      {/* Top bar */}
      <div className="flex-shrink-0 p-4 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center justify-between max-w-screen-xl mx-auto">
          <div className="text-white flex-1 min-w-0">
            <h3 className="font-medium truncate">{file.name}</h3>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              {documentType === 'pdf' && numPages > 0 && (
                <span>{t('gallery.pageOf', { current: currentPage, total: numPages })}</span>
              )}
              {files.length > 1 && documentType !== 'pdf' && (
                <span>{currentIndex + 1} / {files.length}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* PDF Page navigation */}
            {documentType === 'pdf' && numPages > 1 && (
              <>
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage <= 1}
                  className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
                  title={t('gallery.previousPage')}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="text-white/80 text-sm min-w-[60px] text-center">
                  {currentPage} / {numPages}
                </span>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(numPages, prev + 1))}
                  disabled={currentPage >= numPages}
                  className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
                  title={t('gallery.nextPage')}
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
                <div className="w-px h-6 bg-white/20 mx-2" />
              </>
            )}

            {/* Zoom controls */}
            <button
              onClick={() => setZoom((prev) => Math.max(prev - 25, 50))}
              disabled={zoom <= 50}
              className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
              title={t('gallery.zoomOut')}
            >
              <ZoomOut className="w-5 h-5" />
            </button>
            <span className="text-white/80 text-sm min-w-[50px] text-center">{zoom}%</span>
            <button
              onClick={() => setZoom((prev) => Math.min(prev + 25, 200))}
              disabled={zoom >= 200}
              className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
              title={t('gallery.zoomIn')}
            >
              <ZoomIn className="w-5 h-5" />
            </button>

            <div className="w-px h-6 bg-white/20 mx-2" />

            <button
              onClick={toggleFullscreen}
              className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title={isFullscreen ? t('gallery.exitFullscreen') : t('gallery.fullscreen')}
            >
              {isFullscreen ? (
                <Minimize2 className="w-5 h-5" />
              ) : (
                <Maximize2 className="w-5 h-5" />
              )}
            </button>

            {onDownload && (
              <button
                onClick={() => onDownload(file)}
                className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                title={t('gallery.download')}
              >
                <Download className="w-5 h-5" />
              </button>
            )}
            {onShare && (
              <button
                onClick={() => onShare(file)}
                className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                title={t('gallery.share')}
              >
                <Share2 className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title={t('gallery.closeEsc')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Document content */}
      <div className="flex-1 relative overflow-hidden p-4">
        <div className="h-full max-w-5xl mx-auto">{renderContent()}</div>

        {/* Navigation arrows for documents */}
        {files.length > 1 && documentType !== 'pdf' && (
          <>
            {hasPrev && onNavigate && (
              <button
                onClick={() => onNavigate(files[currentIndex - 1])}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-black/70 text-white rounded-full transition-all"
                title={t('gallery.previous')}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}
            {hasNext && onNavigate && (
              <button
                onClick={() => onNavigate(files[currentIndex + 1])}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-black/70 text-white rounded-full transition-all"
                title={t('gallery.next')}
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
