import { useTranslation } from 'react-i18next';
import { Search, X } from 'lucide-react';

interface SearchBarProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function SearchBar({ isOpen, onClose }: SearchBarProps) {
    const { t } = useTranslation();

    if (!isOpen) return null;

    return (
        <div className="sticky top-0 z-50 w-full flex justify-center px-4 pointer-events-none mb-4">
            <div className="bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-600 shadow-2xl rounded-xl p-2 flex items-center gap-2 pointer-events-auto min-w-[320px]">
                <Search size={16} className="text-gray-400 ml-2" />
                <input
                    autoFocus
                    type="text"
                    placeholder={t('documentViewer.searchPlaceholder')}
                    className="flex-1 text-sm bg-transparent border-none focus:ring-0 placeholder:text-gray-400"
                />
                <button
                    onClick={(e) => { e.stopPropagation(); onClose(); }}
                    className="p-1.5 hover:bg-gray-100 dark:hover:bg-dark-700 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    title={t('common.close')}
                >
                    <X size={16} />
                </button>
            </div>
        </div>
    );
}
