import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    X,
    FileType,
    Image,
    Calendar,
    HardDrive,
    Tag,
    Check,
    Camera,
} from 'lucide-react';
import { FileItem } from '../../../types';
import { cn, formatBytes, formatDate } from '../../../lib/utils';

interface DetailsPanelProps {
    file: FileItem;
    isOpen: boolean;
    onClose: () => void;
    onCopyLink?: () => void;
    actions?: Array<{
        id: string;
        label: string;
        icon: React.ComponentType<{ className?: string }>;
        onClick?: () => void;
        danger?: boolean;
        active?: boolean;
    }>;
}

export default function DetailsPanel({
    file,
    isOpen,
    onClose,
    onCopyLink,
    actions = [],
}: DetailsPanelProps) {
    const { t } = useTranslation();
    const [linkCopied, setLinkCopied] = useState(false);

    const handleCopyLink = () => {
        onCopyLink?.();
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
    };

    // Parse metadata if available
    let metadata: any = null;
    if (file.metadata) {
        try {
            metadata = JSON.parse(file.metadata);
        } catch {
            metadata = null;
        }
    }
    const dimensions = metadata?.width && metadata?.height
        ? `${metadata.width} x ${metadata.height}`
        : null;

    const infoItems = [
        { icon: FileType, label: t('mediaViewer.format'), value: file.mimeType },
        dimensions && { icon: Image, label: t('mediaViewer.dimensions'), value: dimensions },
        { icon: HardDrive, label: t('common.size'), value: formatBytes(Number(file.size)) },
        { icon: Calendar, label: t('common.created'), value: formatDate(file.createdAt) },
        { icon: Calendar, label: t('common.modified'), value: formatDate(file.updatedAt) },
    ].filter(Boolean) as { icon: React.ComponentType<{ className?: string }>; label: string; value: string }[];

    // EXIF data if available
    const exifItems = metadata?.exif ? [
        metadata.exif.camera && { label: 'Camera', value: metadata.exif.camera },
        metadata.exif.focalLength && { label: 'Focal Length', value: metadata.exif.focalLength },
        metadata.exif.aperture && { label: 'Aperture', value: metadata.exif.aperture },
        metadata.exif.iso && { label: 'ISO', value: metadata.exif.iso },
        metadata.exif.exposureTime && { label: 'Exposure', value: metadata.exif.exposureTime },
    ].filter(Boolean) : [];

    return (
        <aside
            className={cn(
                'absolute top-0 right-0 h-full w-[320px] z-30',
                'bg-white dark:bg-dark-800',
                'border-l border-dark-100 dark:border-dark-700',
                'shadow-xl',
                'transition-transform duration-200 ease-out',
                'overflow-y-auto',
                isOpen ? 'translate-x-0' : 'translate-x-full'
            )}
        >
            {/* Header */}
            <div className="sticky top-0 flex items-center justify-between p-4 bg-white dark:bg-dark-800 border-b border-dark-100 dark:border-dark-700">
                <h2 className="font-medium text-dark-900 dark:text-white">
                    {t('mediaViewer.details')}
                </h2>
                <button
                    onClick={onClose}
                    className="p-1.5 rounded-lg text-dark-500 hover:bg-dark-100 dark:hover:bg-dark-700 transition-colors"
                    aria-label={t('mediaViewer.panelClose')}
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-6">
                {/* Filename */}
                <div>
                    <p className="text-sm text-dark-500 dark:text-dark-400 mb-1">
                        {t('infoModal.name')}
                    </p>
                    <p className="text-dark-900 dark:text-white font-medium break-all">
                        {file.name}
                    </p>
                </div>

                {/* Quick Actions */}
                {actions.length > 0 && (
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <Tag className="w-4 h-4 text-dark-500" />
                            <h3 className="text-sm font-medium text-dark-700 dark:text-dark-300">
                                {t('mediaViewer.actions')}
                            </h3>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {actions.map((action) => {
                                const isCopy = action.id === 'copy-link';
                                const Icon = isCopy && linkCopied ? Check : action.icon;
                                const label = isCopy && linkCopied
                                    ? t('mediaViewer.linkCopied')
                                    : action.label;

                                return (
                                    <button
                                        key={action.id}
                                        onClick={() => {
                                            if (isCopy) {
                                                handleCopyLink();
                                            } else {
                                                action.onClick?.();
                                            }
                                        }}
                                        className={cn(
                                            'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
                                            'border border-dark-200 dark:border-dark-600',
                                            'transition-colors duration-150',
                                            action.danger
                                                ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                                                : action.active
                                                    ? 'text-primary-600 dark:text-primary-400 border-primary-200 dark:border-primary-700 hover:bg-primary-50/50 dark:hover:bg-primary-900/20'
                                                    : 'text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700'
                                        )}
                                        aria-label={label}
                                        aria-pressed={action.active}
                                    >
                                        <Icon className="w-4 h-4" />
                                        <span className="truncate">{label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Basic Info */}
                <div className="space-y-3">
                    {infoItems.map((item, idx) => (
                        <div key={idx} className="flex items-start gap-3">
                            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-dark-50 dark:bg-dark-700 flex items-center justify-center">
                                <item.icon className="w-4 h-4 text-dark-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs text-dark-500 dark:text-dark-400">{item.label}</p>
                                <p className="text-sm text-dark-900 dark:text-white truncate">{item.value}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* EXIF Data */}
                {exifItems.length > 0 && (
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <Camera className="w-4 h-4 text-dark-500" />
                            <h3 className="text-sm font-medium text-dark-700 dark:text-dark-300">
                                {t('mediaViewer.exif')}
                            </h3>
                        </div>
                        <div className="bg-dark-50 dark:bg-dark-700/50 rounded-lg p-3 space-y-2">
                            {exifItems.map((item, idx) => (
                                <div key={idx} className="flex justify-between text-sm">
                                    <span className="text-dark-500 dark:text-dark-400">{item?.label}</span>
                                    <span className="text-dark-900 dark:text-white">{item?.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Tags */}
                {metadata?.tags && metadata.tags.length > 0 && (
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <Tag className="w-4 h-4 text-dark-500" />
                            <h3 className="text-sm font-medium text-dark-700 dark:text-dark-300">
                                {t('mediaViewer.tags')}
                            </h3>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {metadata.tags.map((tag: string, idx: number) => (
                                <span
                                    key={idx}
                                    className="px-2 py-1 text-xs bg-dark-100 dark:bg-dark-700 text-dark-600 dark:text-dark-300 rounded-md"
                                >
                                    {tag}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

            </div>
        </aside>
    );
}
