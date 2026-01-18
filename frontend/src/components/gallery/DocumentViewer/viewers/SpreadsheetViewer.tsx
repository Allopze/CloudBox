import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { useTranslation } from 'react-i18next';
import { cn } from '../../../../lib/utils';

interface SpreadsheetViewerProps {
    html: string;
    sheets: string[];
    currentSheet: number;
    onSheetChange: (index: number) => void;
}

export default function SpreadsheetViewer({
    html,
    sheets,
    currentSheet,
    onSheetChange,
}: SpreadsheetViewerProps) {
    const { t } = useTranslation();

    const sanitizedHtml = useMemo(() => {
        return DOMPurify.sanitize(html, {
            USE_PROFILES: { html: true },
            ADD_TAGS: ['table', 'thead', 'tbody', 'tr', 'th', 'td', 'br'],
            ADD_ATTR: ['style', 'rowspan', 'colspan'],
        });
    }, [html]);

    return (
        <div className="flex flex-col items-center gap-4 w-full">
            {sheets.length > 1 && (
                <div className="flex flex-wrap items-center justify-center gap-2 px-4">
                    {sheets.map((sheet, index) => (
                        <button
                            key={`${sheet}-${index}`}
                            type="button"
                            onClick={() => onSheetChange(index)}
                            className={cn(
                                "px-3 py-1.5 text-xs rounded-full border transition-colors",
                                currentSheet === index
                                    ? "bg-primary-600 text-white border-primary-600"
                                    : "bg-white dark:bg-dark-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-dark-700 hover:bg-gray-50 dark:hover:bg-dark-700"
                            )}
                        >
                            {sheet || `${t('documents.sheet')} ${index + 1}`}
                        </button>
                    ))}
                </div>
            )}
            <div
                className="bg-white dark:bg-dark-800 shadow-lg rounded-lg p-4 mx-4 overflow-auto w-full"
                style={{ width: 'min(1600px, 95vw)', minHeight: '70vh', maxHeight: '85vh' }}
            >
                <div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
            </div>
        </div>
    );
}
