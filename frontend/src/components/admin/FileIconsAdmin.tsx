import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { useFileIconStore, FileIconCategory } from '../../stores/fileIconStore';
import { cn } from '../../lib/utils';
import { toast } from '../ui/Toast';
import { File, Upload, RotateCcw, Info } from 'lucide-react';

interface IconInfo {
    category: FileIconCategory;
    hasCustomIcon: boolean;
    svg: string | null;
    updatedAt: string | null;
}

const formatExtensionName = (category: FileIconCategory): string => {
    const mapping: Partial<Record<FileIconCategory, string>> = {
        pdf: '.PDF',
        word: '.DOC',
        spreadsheet: '.XLS',
        presentation: '.PPT',
        csv: '.CSV',
        text: '.TXT',
        markdown: '.MD',
        ebook: '.EPUB',
        onenote: '.ONE',
        access: '.MDB',
        publisher: '.PUB',
        js: '.JS',
        html: '.HTML',
        css: '.CSS',
        py: '.PY',
        json: '.JSON',
        sql: '.SQL',
        illustrator: '.AI',
        photoshop: '.PSD',
        indesign: '.INDD',
        figma: '.FIG',
        vector: '.SVG',
        zip: '.ZIP',
        rar: '.RAR',
        '7z': '.7Z',
        exe: '.EXE',
        dmg: '.DMG',
        apk: '.APK',
        ipa: '.IPA',
        deb: '.DEB',
        rpm: '.RPM',
    };

    return mapping[category] || category.toUpperCase();
};


export default function FileIconsAdmin() {
    const { t } = useTranslation();
    const { loadIcons } = useFileIconStore();
    const [icons, setIcons] = useState<IconInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState<FileIconCategory | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedCategory, setSelectedCategory] = useState<FileIconCategory | null>(null);

    const fetchIcons = async () => {
        try {
            const res = await api.get('/file-icons/admin');
            setIcons(res.data);
        } catch (error) {
            console.error('Failed to load icons:', error);
            toast(t('admin.fileIcons.loadError', 'Failed to load icons'), 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchIcons();
    }, []);

    const handleUploadClick = (category: FileIconCategory) => {
        setSelectedCategory(category);
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedCategory) return;

        if (file.type !== 'image/svg+xml') {
            toast(t('admin.fileIcons.svgOnly', 'Only SVG files are allowed'), 'error');
            return;
        }

        setUploading(selectedCategory);

        try {
            const text = await file.text();
            await api.put(`/file-icons/admin/${selectedCategory}`, { svg: text });
            toast(t('admin.fileIcons.uploadSuccess', 'Icon updated successfully'), 'success');
            await fetchIcons();
            await loadIcons(); // Refresh global icon store
        } catch (error) {
            console.error('Failed to upload icon:', error);
            toast(t('admin.fileIcons.uploadError', 'Failed to upload icon'), 'error');
        } finally {
            setUploading(null);
            setSelectedCategory(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleReset = async (category: FileIconCategory) => {
        if (!confirm(t('admin.fileIcons.confirmReset', 'Reset this icon to default?'))) {
            return;
        }

        try {
            await api.delete(`/file-icons/admin/${category}`);
            toast(t('admin.fileIcons.resetSuccess', 'Icon reset to default'), 'success');
            await fetchIcons();
            await loadIcons();
        } catch (error) {
            console.error('Failed to reset icon:', error);
            toast(t('admin.fileIcons.resetError', 'Failed to reset icon'), 'error');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-10">
            <input
                ref={fileInputRef}
                type="file"
                accept=".svg,image/svg+xml"
                className="hidden"
                onChange={handleFileChange}
            />

            <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
                {icons.map((iconInfo) => (
                    <div
                        key={iconInfo.category}
                        className="group relative p-4 rounded-2xl border border-dark-100 dark:border-dark-800 bg-white dark:bg-dark-900 hover:border-primary-500/30 dark:hover:border-primary-500/30 transition-all duration-300 flex flex-col items-center"
                    >
                        <div className="w-20 h-20 flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
                            {iconInfo.hasCustomIcon && iconInfo.svg ? (
                                <div
                                    className="w-16 h-16 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full [&>svg]:block [&>svg]:mx-auto"
                                    dangerouslySetInnerHTML={{ __html: iconInfo.svg }}
                                />
                            ) : (
                                <div className="w-16 h-16 flex items-center justify-center bg-dark-50 dark:bg-dark-800 rounded-xl text-dark-300 dark:text-dark-600">
                                    <File className="w-10 h-10" />
                                </div>
                            )}
                        </div>

                        <div className="mt-4 text-center w-full">
                            <h4 className="text-base font-bold text-dark-900 dark:text-white uppercase truncate px-1">
                                {formatExtensionName(iconInfo.category)}
                            </h4>

                            <div className="mt-1 flex items-center justify-center gap-1.5">
                                <span className={cn(
                                    "w-1.5 h-1.5 rounded-full",
                                    iconInfo.hasCustomIcon ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-dark-300 dark:bg-dark-600"
                                )} />
                                <span className="text-[10px] font-bold text-dark-500 dark:text-dark-400 tracking-wider">
                                    {iconInfo.hasCustomIcon
                                        ? t('admin.fileIcons.customIcon', 'Personalizado')
                                        : t('admin.fileIcons.defaultIcon', 'Por defecto')}
                                </span>
                            </div>
                        </div>

                        <div className="mt-4 flex items-center gap-2 w-full">
                            <button
                                onClick={() => handleUploadClick(iconInfo.category)}
                                disabled={uploading === iconInfo.category}
                                title={t('admin.fileIcons.upload', 'Subir SVG')}
                                className={cn(
                                    'flex-1 h-9 flex items-center justify-center gap-2 px-3 rounded-lg text-xs font-bold transition-all',
                                    'bg-dark-50 dark:bg-dark-800 text-dark-900 dark:text-white hover:bg-dark-100 dark:hover:bg-dark-700',
                                    'disabled:opacity-50 disabled:cursor-not-allowed border border-dark-100 dark:border-dark-700'
                                )}
                            >
                                <Upload className="w-3.5 h-3.5" />
                                <span className="truncate">
                                    {uploading === iconInfo.category ? t('common.uploading', '...') : t('admin.fileIcons.uploadShort', 'Subir')}
                                </span>
                            </button>

                            {iconInfo.hasCustomIcon && (
                                <button
                                    onClick={() => handleReset(iconInfo.category)}
                                    title={t('admin.fileIcons.reset', 'Restablecer')}
                                    className="h-9 w-9 flex items-center justify-center rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors border border-red-200/50 dark:border-red-900/50"
                                >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <div className="p-8 rounded-[2rem] bg-gradient-to-br from-blue-50 to-blue-100/30 dark:from-blue-900/10 dark:to-blue-800/5 border border-blue-100 dark:border-blue-900/30 flex gap-6">
                <div className="p-3.5 rounded-[1.25rem] bg-white dark:bg-blue-900/40 shrink-0 h-fit shadow-sm">
                    <Info className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                    <h4 className="text-lg font-bold text-blue-900 dark:text-blue-100">
                        {t('admin.fileIcons.tips', 'Consejos')}
                    </h4>
                    <ul className="mt-3 text-sm text-blue-800/70 dark:text-blue-200/60 font-medium space-y-2">
                        <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                            {t('admin.fileIcons.tip1', 'Usa iconos SVG simples para mejores resultados')}
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                            {t('admin.fileIcons.tip2', 'Tamaño recomendado: 48x64 o iconos cuadrados')}
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                            {t('admin.fileIcons.tip3', 'Los SVGs se limpian automáticamente por seguridad')}
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
