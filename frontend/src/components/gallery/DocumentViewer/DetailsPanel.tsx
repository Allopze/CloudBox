import { useTranslation } from 'react-i18next';
import { X, Info, FileText } from 'lucide-react';
import { FileItem } from '../../../types';
import { cn, formatBytes, formatDateTime } from '../../../lib/utils';
import { DocumentType } from './hooks/useDocumentLoader';

interface DetailsPanelProps {
    file: FileItem;
    numPages: number;
    documentType: DocumentType;
    isOpen: boolean;
    onClose: () => void;
}

export default function DetailsPanel({
    file,
    numPages,
    documentType,
    isOpen,
    onClose,
}: DetailsPanelProps) {
    const { t } = useTranslation();

    return (
        <aside
            className={cn(
                "transition-all duration-300 border-l border-gray-200 dark:border-dark-700 bg-white dark:bg-dark-800 flex flex-col z-30 shadow-sm",
                isOpen ? "w-[280px]" : "w-0 overflow-hidden border-none"
            )}
            onContextMenu={(e) => e.preventDefault()}
        >
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-dark-700">
                <h3 className="text-sm font-semibold flex items-center gap-2 text-gray-700 dark:text-gray-200">
                    <Info size={16} className="text-gray-400" /> {t('documentViewer.details')}
                </h3>
                <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-dark-700 rounded transition-colors text-gray-400">
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
                            <h4 className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1">{t('common.size')}</h4>
                            <p className="text-xs text-gray-700 dark:text-gray-300">{formatBytes(file.size)}</p>
                        </div>
                        {documentType === 'pdf' && numPages > 0 && (
                            <div>
                                <h4 className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1">{t('documentViewer.pages')}</h4>
                                <p className="text-xs text-gray-700 dark:text-gray-300">{numPages}</p>
                            </div>
                        )}
                    </div>
                    <div>
                        <h4 className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1">{t('common.modified')}</h4>
                        <p className="text-xs text-gray-700 dark:text-gray-300">{formatDateTime(file.updatedAt)}</p>
                    </div>
                    <div>
                        <h4 className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1">{t('common.created')}</h4>
                        <p className="text-xs text-gray-700 dark:text-gray-300">{formatDateTime(file.createdAt)}</p>
                    </div>
                </section>
            </div>
        </aside>
    );
}
