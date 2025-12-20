import { useState, useEffect, memo, useMemo, useCallback } from 'react';
import { FileText, FileSpreadsheet, File, Loader2 } from 'lucide-react';
import { getFileUrl, api } from '../../lib/api';
import { Document, Page, pdfjs } from 'react-pdf';
import mammoth from 'mammoth';

// Configure PDF.js worker using Vite's ?url import
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface DocumentThumbnailProps {
  fileId: string;
  fileName: string;
  mimeType: string;
  className?: string;
}

// Get icon and solid color based on document type
const getDocumentStyle = (mimeType: string, fileName: string) => {
  if (mimeType === 'application/pdf' || fileName.endsWith('.pdf')) {
    return {
      icon: FileText,
      bgColor: 'bg-red-500',
      label: 'PDF',
    };
  }
  if (mimeType.includes('word') || fileName.endsWith('.doc') || fileName.endsWith('.docx')) {
    return {
      icon: FileText,
      bgColor: 'bg-blue-600',
      label: 'DOC',
    };
  }
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet') ||
    fileName.endsWith('.xls') || fileName.endsWith('.xlsx') || fileName.endsWith('.csv')) {
    return {
      icon: FileSpreadsheet,
      bgColor: 'bg-emerald-600',
      label: 'XLSX',
    };
  }
  if (mimeType.includes('presentation') || fileName.endsWith('.ppt') || fileName.endsWith('.pptx')) {
    return {
      icon: FileText,
      bgColor: 'bg-orange-500',
      label: 'PPT',
    };
  }
  if (mimeType === 'text/plain' || fileName.endsWith('.txt')) {
    return {
      icon: FileText,
      bgColor: 'bg-slate-500',
      label: 'TXT',
    };
  }
  if (mimeType === 'text/markdown' || fileName.endsWith('.md')) {
    return {
      icon: FileText,
      bgColor: 'bg-violet-600',
      label: 'MD',
    };
  }
  return {
    icon: File,
    bgColor: 'bg-slate-600',
    label: '',
  };
};

// Get file extension for badge
const getExtension = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toUpperCase() || '';
  return ext.length <= 4 ? ext : '';
};

const DocumentThumbnail = memo(function DocumentThumbnail({
  fileId,
  fileName,
  mimeType,
  className = '',
}: DocumentThumbnailProps) {
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [pdfLoaded, setPdfLoaded] = useState(false);

  const { icon: DocIcon, bgColor, label } = getDocumentStyle(mimeType, fileName);
  const ext = getExtension(fileName);
  const isPdf = mimeType === 'application/pdf' || fileName.endsWith('.pdf');
  const isWord = mimeType.includes('word') || fileName.endsWith('.doc') || fileName.endsWith('.docx');
  const isText = mimeType.startsWith('text/') || fileName.endsWith('.txt') || fileName.endsWith('.md');
  const isSpreadsheet = mimeType.includes('excel') || mimeType.includes('spreadsheet') ||
    fileName.endsWith('.xls') || fileName.endsWith('.xlsx') || fileName.endsWith('.csv');

  // Memoize the file URL to prevent unnecessary re-renders
  const fileUrl = useMemo(() => getFileUrl(fileId, 'view'), [fileId]);

  // Memoize file options with auth header for react-pdf to prevent re-renders
  const pdfOptions = useMemo(() => ({
    url: fileUrl,
    httpHeaders: {
      Authorization: `Bearer ${localStorage.getItem('accessToken') || ''}`,
    },
    cMapUrl: 'https://unpkg.com/pdfjs-dist@5.4.296/cmaps/',
    cMapPacked: true,
  }), [fileUrl]);

  // Memoize callbacks to prevent Document re-renders
  const onPdfLoadSuccess = useCallback(() => setPdfLoaded(true), []);
  const onPdfLoadError = useCallback(() => setError(true), []);

  useEffect(() => {
    let mounted = true;
    let blobUrl: string | null = null; // Track blob URL for cleanup

    const loadPreview = async () => {
      // PDF uses react-pdf, no need to load anything else
      if (isPdf) {
        if (mounted) setLoading(false);
        return;
      }

      // For spreadsheets, try to load a server-generated thumbnail using authenticated request
      if (isSpreadsheet) {
        try {
          const response = await api.get(`/files/${fileId}/thumbnail`, {
            responseType: 'blob',
          });
          if (mounted) {
            blobUrl = URL.createObjectURL(response.data);
            setThumbnailUrl(blobUrl);
          }
        } catch {
          // No thumbnail available, will show fallback icon
        }
        if (mounted) setLoading(false);
        return;
      }

      // Other documents - no preview needed for now
      if (!isText && !isWord) {
        if (mounted) setLoading(false);
        return;
      }

      try {
        // Use axios api instance to include Authorization header
        // Use direct path instead of replacing baseURL from getFileUrl result
        const response = await api.get(`/files/${fileId}/view`, {
          responseType: isWord ? 'arraybuffer' : 'text',
        });

        if (!mounted) return;

        if (isWord) {
          const arrayBuffer = response.data;
          const result = await mammoth.extractRawText({ arrayBuffer });
          // Only take first 500 chars for preview
          if (mounted) setPreviewContent(result.value.slice(0, 500));
        } else if (isText) {
          const text = response.data;
          // Only take first 500 chars for preview
          if (mounted) setPreviewContent(text.slice(0, 500));
        }

        if (mounted) setLoading(false);
      } catch (err) {
        console.error('Error loading document preview:', err);
        if (mounted) {
          setError(true);
          setLoading(false);
        }
      }
    };

    loadPreview();

    return () => {
      mounted = false;
      // Clean up blob URL if created
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [fileId, fileUrl, isPdf, isWord, isText, isSpreadsheet]);

  // Suppress the pdfLoaded warning
  void pdfLoaded;

  // PDF preview using react-pdf
  if (isPdf) {
    return (
      <div className={`relative w-full h-full overflow-hidden ${className}`}>
        <Document
          file={pdfOptions}
          onLoadSuccess={onPdfLoadSuccess}
          onLoadError={onPdfLoadError}
          loading={
            <div className="flex items-center justify-center w-full h-full bg-gray-100 dark:bg-dark-700">
              <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
            </div>
          }
          error={
            <div className="flex flex-col items-center justify-center w-full h-full bg-red-500">
              <DocIcon className="w-12 h-12 text-white/80 mb-2" />
              <span className="text-white/90 text-xs font-bold tracking-wider">{label}</span>
            </div>
          }
          className="w-full h-full"
        >
          <Page
            pageNumber={1}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            className="[&>canvas]:!w-full [&>canvas]:!h-full [&>canvas]:object-cover"
          />
        </Document>
        {/* Extension badge - always visible */}
        <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-white/90 text-[10px] font-bold text-red-600 shadow-sm">
          {label}
        </div>
      </div>
    );
  }

  // Text/Word preview
  if ((isText || isWord) && previewContent && !error) {
    return (
      <div className={`relative w-full h-full ${className}`}>
        <div className="absolute inset-0 bg-white dark:bg-dark-800 p-3 overflow-hidden">
          <div className="text-[7px] leading-tight text-dark-600 dark:text-dark-300 font-mono whitespace-pre-wrap overflow-hidden h-full">
            {previewContent}
          </div>
          {/* Fade at bottom */}
          <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white dark:from-dark-800 to-transparent" />
        </div>
        {/* Extension badge */}
        <div className={`absolute bottom-2 left-2 px-2 py-0.5 rounded text-[10px] font-bold text-white ${bgColor} shadow-sm`}>
          {ext || label}
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className={`relative w-full h-full ${bgColor} ${className}`}>
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-white/80 animate-spin" />
        </div>
      </div>
    );
  }

  // Default fallback with icon (also used for spreadsheets)
  return (
    <div className={`relative w-full h-full ${thumbnailUrl ? '' : bgColor} ${className}`}>
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt={fileName}
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setThumbnailUrl(null)}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <DocIcon className="w-12 h-12 text-white/80 mb-2" />
          <span className="text-white/90 text-xs font-bold tracking-wider">
            {label || ext}
          </span>
        </div>
      )}
      {/* Extension badge - show when there's a thumbnail */}
      {thumbnailUrl && (label || ext) && (
        <div className={`absolute bottom-2 left-2 px-2 py-0.5 rounded text-[10px] font-bold text-white ${bgColor} shadow-sm`}>
          {label || ext}
        </div>
      )}
    </div>
  );
});

export default DocumentThumbnail;
