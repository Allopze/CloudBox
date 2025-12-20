import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    X,
    FileType,
    Image,
    Calendar,
    HardDrive,
    Tag,
    Link,
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
}

export default function DetailsPanel({
    file,
    isOpen,
    onClose,
    onCopyLink,
}: DetailsPanelProps) {
    const { t } = useTranslation();
    const [linkCopied, setLinkCopied] = useState(false);

    const handleCopyLink = () => {
        onCopyLink?.();
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
    };

    // Parse metadata if available
    const metadata = file.metadata ? JSON.parse(file.metadata) : null;
    const dimensions = metadata?.width && metadata?.height
        ? `${metadata.width} × ${metadata.height}`
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
                'absolute top-0 right-0 h-full w-[320px]',
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

                {/* Copy Link */}
                <button
                    onClick={handleCopyLink}
                    className={cn(
                        'w-full flex items-center justify-center gap-2 py-2.5 rounded-lg',
                        'text-sm font-medium',
                        'border border-dark-200 dark:border-dark-600',
                        'hover:bg-dark-50 dark:hover:bg-dark-700',
                        'transition-colors duration-150',
                        linkCopied
                            ? 'text-green-600 dark:text-green-400 border-green-300 dark:border-green-700'
                            : 'text-dark-700 dark:text-dark-200'
                    )}
                >
                    {linkCopied ? (
                        <>
                            <Check className="w-4 h-4" />
                            {t('mediaViewer.linkCopied')}
                        </>
                    ) : (
                        <>
                            <Link className="w-4 h-4" />
                            {t('mediaViewer.copyLink')}
                        </>
                    )}
                </button>
            </div>
        </aside>
    );
}
