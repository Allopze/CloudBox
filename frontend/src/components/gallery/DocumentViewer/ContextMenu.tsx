import { useTranslation } from 'react-i18next';
import { Copy, Download, Share2 } from 'lucide-react';
import { FileItem } from '../../../types';

interface ContextMenuState {
    show: boolean;
    x: number;
    y: number;
    selection: boolean;
}

interface ContextMenuProps {
    state: ContextMenuState;
    file: FileItem;
    onClose: () => void;
    onDownload?: (file: FileItem) => void;
    onShare?: (file: FileItem) => void;
}

export default function ContextMenu({
    state,
    file,
    onClose,
    onDownload,
    onShare,
}: ContextMenuProps) {
    const { t } = useTranslation();

    if (!state.show) return null;

    const handleCopy = () => {
        navigator.clipboard.writeText(window.getSelection()?.toString() || '');
        onClose();
    };

    return (
        <div
            className="fixed z-[100] bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-600 shadow-2xl rounded-xl py-1.5 min-w-[160px] select-none"
            style={{ top: state.y, left: state.x }}
        >
            {state.selection ? (
                <button
                    onClick={handleCopy}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:text-primary-600 transition-colors"
                >
                    <Copy size={14} /> {t('common.copy')}
                </button>
            ) : (
                <>
                    {onDownload && (
                        <button
                            onClick={() => { onDownload(file); onClose(); }}
                            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:text-primary-600 transition-colors"
                        >
                            <Download size={14} /> {t('common.download')}
                        </button>
                    )}
                    {onShare && (
                        <button
                            onClick={() => { onShare(file); onClose(); }}
                            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:text-primary-600 transition-colors"
                        >
                            <Share2 size={14} /> {t('common.share')}
                        </button>
                    )}
                </>
            )}
        </div>
    );
}

export type { ContextMenuState };
