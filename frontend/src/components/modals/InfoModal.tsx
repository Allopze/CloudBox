import { useTranslation } from 'react-i18next';
import { FileItem, Folder } from '../../types';
import { formatBytes, formatDate } from '../../lib/utils';
import {
    X,
    File,
    Folder as FolderIcon,
    Calendar,
    HardDrive,
    FileType,
    Clock,
    Star,
    Trash2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface InfoModalProps {
    isOpen: boolean;
    onClose: () => void;
    item: FileItem | Folder;
    type: 'file' | 'folder';
}

export default function InfoModal({ isOpen, onClose, item, type }: InfoModalProps) {
    const { t } = useTranslation();

    const isFile = type === 'file';
    const file = isFile ? (item as FileItem) : null;
    const folder = !isFile ? (item as Folder) : null;

    const infoItems = isFile && file ? [
        { icon: FileType, label: t('infoModal.type'), value: file.mimeType },
        { icon: HardDrive, label: t('infoModal.size'), value: formatBytes(Number(file.size)) },
        { icon: Calendar, label: t('infoModal.created'), value: formatDate(file.createdAt) },
        { icon: Clock, label: t('infoModal.modified'), value: formatDate(file.updatedAt) },
        ...(file.isFavorite ? [{ icon: Star, label: t('infoModal.favorite'), value: t('common.yes') }] : []),
        ...(file.isTrash ? [{ icon: Trash2, label: t('infoModal.inTrash'), value: t('common.yes') }] : []),
    ] : folder ? [
        { icon: HardDrive, label: t('infoModal.size'), value: formatBytes(Number(folder.size || 0)) },
        { icon: File, label: t('infoModal.files'), value: String(folder._count?.files || 0) },
        { icon: Calendar, label: t('infoModal.created'), value: formatDate(folder.createdAt) },
        { icon: Clock, label: t('infoModal.modified'), value: formatDate(folder.updatedAt) },
        ...(folder.isFavorite ? [{ icon: Star, label: t('infoModal.favorite'), value: t('common.yes') }] : []),
        ...(folder.isTrash ? [{ icon: Trash2, label: t('infoModal.inTrash'), value: t('common.yes') }] : []),
    ] : [];

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        onClick={(e) => e.stopPropagation()}
                        className="relative w-full max-w-md mx-4 bg-white dark:bg-dark-800 rounded-2xl shadow-2xl border border-dark-100 dark:border-dark-700 overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-100 dark:border-dark-700">
                            <div className="flex items-center gap-3">
                                {isFile ? (
                                    <File className="w-5 h-5 text-primary-500" />
                                ) : (
                                    <FolderIcon className="w-5 h-5 text-primary-500" />
                                )}
                                <h2 className="text-lg font-semibold text-dark-900 dark:text-white">
                                    {t('infoModal.title')}
                                </h2>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-lg text-dark-500 hover:text-dark-700 dark:hover:text-dark-300 hover:bg-dark-100 dark:hover:bg-dark-700 transition-colors"
                                aria-label={t('common.close')}
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-6">
                            {/* Name */}
                            <div className="mb-6">
                                <p className="text-sm text-dark-500 mb-1">{t('infoModal.name')}</p>
                                <p className="text-lg font-medium text-dark-900 dark:text-white break-all">
                                    {item.name}
                                </p>
                            </div>

                            {/* Info Grid */}
                            <div className="space-y-4">
                                {infoItems.map((infoItem, index) => (
                                    <div key={index} className="flex items-start gap-3">
                                        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-dark-50 dark:bg-dark-700 flex items-center justify-center">
                                            <infoItem.icon className="w-4 h-4 text-dark-500" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-dark-500">{infoItem.label}</p>
                                            <p className="text-dark-900 dark:text-white break-all">
                                                {infoItem.value}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-dark-100 dark:border-dark-700 bg-dark-50 dark:bg-dark-900/50">
                            <button
                                onClick={onClose}
                                className="w-full py-2.5 px-4 rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-medium transition-colors"
                            >
                                {t('common.close')}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
