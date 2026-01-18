import { Document, Page } from 'react-pdf';
import { CSSProperties } from 'react';

interface PDFViewerProps {
    pdfOptions: { url: string; cMapUrl: string; cMapPacked: boolean; withCredentials: boolean } | null;
    numPages: number;
    pageWidth: number;
    readingModeStyle: CSSProperties;
    onLoadSuccess: (data: { numPages: number }) => void;
    onLoadError: (error: Error) => void;
}

export default function PDFViewer({
    pdfOptions,
    numPages,
    pageWidth,
    readingModeStyle,
    onLoadSuccess,
    onLoadError,
}: PDFViewerProps) {
    if (!pdfOptions) return null;

    return (
        <Document
            file={pdfOptions}
            onLoadSuccess={onLoadSuccess}
            onLoadError={onLoadError}
            loading={null}
            className="flex flex-col items-center gap-4"
        >
            {Array.from({ length: numPages }).map((_, i) => (
                <div
                    key={i}
                    id={`pdf-page-${i + 1}`}
                    className="bg-white shadow-lg transition-all duration-300"
                    style={{ maxWidth: '95vw', ...readingModeStyle }}
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
    );
}
