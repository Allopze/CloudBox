import { useTranslation } from 'react-i18next';
import { Document, Page } from 'react-pdf';
import { Loader2, FileText, Download } from 'lucide-react';
import { FileItem } from '../../../../types';

interface OfficeViewerProps {
    file: FileItem;
    isConverting: boolean;
    conversionFailed: boolean;
    conversionMessage: string | null;
    pdfOptions: { url: string; cMapUrl: string; cMapPacked: boolean; withCredentials: boolean } | null;
    numPages: number;
    pageWidth: number;
    onDownload?: (file: FileItem) => void;
    onLoadSuccess: (data: { numPages: number }) => void;
    onLoadError: (error: Error) => void;
}

export default function OfficeViewer({
    file,
    isConverting,
    conversionFailed,
    conversionMessage,
    pdfOptions,
    numPages,
    pageWidth,
    onDownload,
    onLoadSuccess,
    onLoadError,
}: OfficeViewerProps) {
    const { t } = useTranslation();

    // Conversion in progress
    if (isConverting) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4 text-center max-w-md p-8 bg-white dark:bg-dark-800 rounded-xl shadow-lg">
                    <Loader2 className="w-12 h-12 text-primary-600 animate-spin" />
                    <div>
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">
                            {file.name}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            {conversionMessage || t('gallery.convertingDocument')}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    // Converted PDF Preview
    if (pdfOptions && !conversionFailed) {
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
        );
    }

    // Conversion failed - Download Prompt
    if (conversionFailed) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center gap-6 text-center max-w-md p-8 bg-white dark:bg-dark-800 rounded-xl shadow-lg">
                    <FileText className="w-16 h-16 text-gray-400" />
                    <div>
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">
                            {file.name}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            {conversionMessage || t('documentViewer.officePreviewNotSupported')}
                        </p>
                    </div>
                    {onDownload && (
                        <button
                            onClick={() => onDownload(file)}
                            className="flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
                        >
                            <Download size={18} />
                            {t('common.download')}
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return null;
}
