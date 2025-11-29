import { useState, useEffect, memo } from 'react';
import { FileText, FileSpreadsheet, File, Loader2 } from 'lucide-react';
import { getFileUrl } from '../../lib/api';
import { Document, Page, pdfjs } from 'react-pdf';
import mammoth from 'mammoth';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface DocumentThumbnailProps {
  fileId: string;
  fileName: string;
  mimeType: string;
  className?: string;
}

// Get icon and gradient based on document type
const getDocumentStyle = (mimeType: string, fileName: string) => {
  if (mimeType === 'application/pdf' || fileName.endsWith('.pdf')) {
    return { 
      icon: FileText, 
      gradient: ['from-red-400', 'to-red-600'],
    };
  }
  if (mimeType.includes('word') || fileName.endsWith('.doc') || fileName.endsWith('.docx')) {
    return { 
      icon: FileText, 
      gradient: ['from-blue-400', 'to-blue-600'],
    };
  }
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet') || 
      fileName.endsWith('.xls') || fileName.endsWith('.xlsx') || fileName.endsWith('.csv')) {
    return { 
      icon: FileSpreadsheet, 
      gradient: ['from-green-400', 'to-green-600'],
    };
  }
  if (mimeType.includes('presentation') || fileName.endsWith('.ppt') || fileName.endsWith('.pptx')) {
    return { 
      icon: FileText, 
      gradient: ['from-orange-400', 'to-orange-600'],
    };
  }
  if (mimeType === 'text/plain' || fileName.endsWith('.txt')) {
    return { 
      icon: FileText, 
      gradient: ['from-gray-400', 'to-gray-600'],
    };
  }
  if (mimeType === 'text/markdown' || fileName.endsWith('.md')) {
    return { 
      icon: FileText, 
      gradient: ['from-purple-400', 'to-purple-600'],
    };
  }
  return { 
    icon: File, 
    gradient: ['from-slate-400', 'to-slate-600'],
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

  const { icon: DocIcon, gradient } = getDocumentStyle(mimeType, fileName);
  const ext = getExtension(fileName);
  const isPdf = mimeType === 'application/pdf' || fileName.endsWith('.pdf');
  const isWord = mimeType.includes('word') || fileName.endsWith('.doc') || fileName.endsWith('.docx');
  const isText = mimeType.startsWith('text/') || fileName.endsWith('.txt') || fileName.endsWith('.md');
  const isSpreadsheet = mimeType.includes('excel') || mimeType.includes('spreadsheet') || 
      fileName.endsWith('.xls') || fileName.endsWith('.xlsx') || fileName.endsWith('.csv');

  useEffect(() => {
    const loadPreview = async () => {
      // PDF uses react-pdf, no need to load anything else
      if (isPdf) {
        setLoading(false);
        return;
      }

      // For spreadsheets, try to load a server-generated thumbnail
      if (isSpreadsheet) {
        const url = getFileUrl(`/files/${fileId}/thumbnail`);
        setThumbnailUrl(url);
        setLoading(false);
        return;
      }

      // Other documents - no preview needed for now
      if (!isText && !isWord) {
        setLoading(false);
        return;
      }

      try {
        const fileUrl = getFileUrl(fileId, 'view');
        const response = await fetch(fileUrl);

        if (isWord) {
          const arrayBuffer = await response.arrayBuffer();
          const result = await mammoth.extractRawText({ arrayBuffer });
          // Only take first 500 chars for preview
          setPreviewContent(result.value.slice(0, 500));
        } else if (isText) {
          const text = await response.text();
          // Only take first 500 chars for preview
          setPreviewContent(text.slice(0, 500));
        }

        setLoading(false);
      } catch (err) {
        console.error('Error loading document preview:', err);
        setError(true);
        setLoading(false);
      }
    };

    loadPreview();
  }, [fileId, isPdf, isWord, isText, isSpreadsheet]);

  const fileUrl = getFileUrl(fileId, 'view');

  // PDF preview using react-pdf
  if (isPdf) {
    return (
      <div className={`relative w-full h-full bg-gradient-to-br ${gradient[0]} ${gradient[1]} ${className}`}>
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-white">
          <Document
            file={fileUrl}
            loading={
              <div className="flex items-center justify-center w-full h-full">
                <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
              </div>
            }
            error={
              <div className={`flex flex-col items-center justify-center w-full h-full bg-gradient-to-br ${gradient[0]} ${gradient[1]}`}>
                <DocIcon className="w-12 h-12 text-white/80 mb-2" />
                <span className="text-white/90 text-xs font-bold tracking-wider">{ext}</span>
              </div>
            }
            className="w-full h-full"
          >
            <Page
              pageNumber={1}
              width={200}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              className="!w-full !h-full [&>canvas]:!w-full [&>canvas]:!h-full [&>canvas]:object-cover"
            />
          </Document>
        </div>
      </div>
    );
  }

  // Text/Word preview
  if ((isText || isWord) && previewContent && !error) {
    return (
      <div className={`relative w-full h-full ${className}`}>
        <div className="absolute inset-0 bg-white p-2 overflow-hidden">
          <div className="text-[6px] leading-tight text-dark-600 font-mono whitespace-pre-wrap overflow-hidden h-full">
            {previewContent}
          </div>
          {/* Gradient fade at bottom */}
          <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent" />
        </div>
        {/* Extension badge */}
        <div className={`absolute bottom-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-bold text-white bg-gradient-to-br ${gradient[0]} ${gradient[1]}`}>
          {ext}
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className={`relative w-full h-full bg-gradient-to-br ${gradient[0]} ${gradient[1]} ${className}`}>
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-white/80 animate-spin" />
        </div>
      </div>
    );
  }

  // Default fallback with icon (also used for spreadsheets)
  // If thumbnailUrl loaded successfully, show it; otherwise show icon
  return (
    <div className={`relative w-full h-full bg-gradient-to-br ${gradient[0]} ${gradient[1]} ${className}`}>
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt={fileName}
          className="absolute inset-0 w-full h-full object-cover rounded-lg"
          onError={() => setThumbnailUrl(null)}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <DocIcon className="w-12 h-12 text-white/80 mb-2" />
          {ext && (
            <span className="text-white/90 text-xs font-bold tracking-wider">
              {ext}
            </span>
          )}
        </div>
      )}
    </div>
  );
});

export default DocumentThumbnail;
