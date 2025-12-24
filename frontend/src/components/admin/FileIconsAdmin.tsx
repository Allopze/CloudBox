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

const CATEGORY_INFO: Record<FileIconCategory, { color: string }> = {
    // Structure
    folder: { color: 'bg-primary-600' },
    default: { color: 'bg-slate-500' },

    // Multimedia
    audio: { color: 'bg-fuchsia-500' },
    image: { color: 'bg-emerald-500' },
    video: { color: 'bg-indigo-500' },

    // Documents
    pdf: { color: 'bg-primary-600' },
    word: { color: 'bg-blue-600' },
    spreadsheet: { color: 'bg-green-600' },
    presentation: { color: 'bg-orange-500' },
    csv: { color: 'bg-teal-600' },
    text: { color: 'bg-slate-500' },
    markdown: { color: 'bg-sky-500' },
    ebook: { color: 'bg-amber-700' },

    // Office Extra
    onenote: { color: 'bg-purple-600' },
    access: { color: 'bg-red-700' },
    publisher: { color: 'bg-teal-700' },

    // Programming & DB
    js: { color: 'bg-violet-600' },
    html: { color: 'bg-orange-500' },
    css: { color: 'bg-blue-500' },
    py: { color: 'bg-blue-600' },
    json: { color: 'bg-yellow-600' },
    sql: { color: 'bg-blue-700' },

    // Design
    illustrator: { color: 'bg-orange-700' },
    photoshop: { color: 'bg-blue-800' },
    indesign: { color: 'bg-pink-700' },
    figma: { color: 'bg-purple-500' },
    vector: { color: 'bg-yellow-600' },

    // Archive
    zip: { color: 'bg-amber-500' },
    rar: { color: 'bg-amber-600' },
    '7z': { color: 'bg-amber-700' },

    // Systems
    exe: { color: 'bg-slate-700' },
    dmg: { color: 'bg-slate-600' },
    apk: { color: 'bg-green-600' },
    ipa: { color: 'bg-slate-800' },
    deb: { color: 'bg-zinc-800' },
    rpm: { color: 'bg-zinc-700' },
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
            <div className="bg-white dark:bg-dark-800 p-8 rounded-3xl border border-dark-100 dark:border-dark-700 shadow-sm transition-all">
                <h3 className="text-2xl font-bold text-dark-900 dark:text-white">
                    {t('admin.fileIcons.title', 'Iconos de Archivos')}
                </h3>
                <p className="mt-2 text-sm text-dark-500 dark:text-dark-400 max-w-2xl">
                    {t('admin.fileIcons.description', 'Personaliza los iconos que se muestran para los diferentes tipos de archivo. Sube iconos SVG personalizados para cada categoría.')}
                </p>
            </div>

            <input
                ref={fileInputRef}
                type="file"
                accept=".svg,image/svg+xml"
                className="hidden"
                onChange={handleFileChange}
            />

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {icons.map((iconInfo) => (
                    <div
                        key={iconInfo.category}
                        className="p-6 rounded-[2.5rem] border border-dark-100 dark:border-dark-700 bg-white dark:bg-dark-800 shadow-sm hover:shadow-xl hover:shadow-dark-200/20 dark:hover:shadow-black/20 transition-all duration-300 group overflow-hidden"
                    >
                        <div className="flex items-center gap-6">
                            <div className={cn(
                                'w-20 h-20 rounded-[1.5rem] flex items-center justify-center text-white shrink-0 shadow-inner overflow-hidden relative border-4 border-white dark:border-dark-900',
                                CATEGORY_INFO[iconInfo.category]?.color || 'bg-slate-500'
                            )}>
                                {iconInfo.hasCustomIcon && iconInfo.svg ? (
                                    <div
                                        className="w-12 h-16 flex items-center justify-center transition-transform group-hover:scale-110 duration-300 [&>svg]:w-full [&>svg]:h-full [&>svg]:block [&>svg]:mx-auto"
                                        dangerouslySetInnerHTML={{ __html: iconInfo.svg }}
                                    />
                                ) : (
                                    <File className="w-10 h-10 opacity-30" />
                                )}
                            </div>

                            <div className="flex-1 min-w-0">
                                <h4 className="text-lg font-bold text-dark-900 dark:text-white capitalize truncate mb-1">
                                    {t(`admin.fileIcons.categories.${iconInfo.category}`, iconInfo.category)}
                                </h4>
                                <div className="flex items-center gap-2">
                                    <span className={cn(
                                        "w-2 h-2 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.1)]",
                                        iconInfo.hasCustomIcon ? "bg-emerald-500 shadow-emerald-500/50" : "bg-dark-300 dark:bg-dark-600"
                                    )} />
                                    <p className="text-xs font-bold text-dark-500 dark:text-dark-400 tracking-wide uppercase">
                                        {iconInfo.hasCustomIcon
                                            ? t('admin.fileIcons.customIcon', 'Icono personalizado')
                                            : t('admin.fileIcons.defaultIcon', 'Icono por defecto')}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 flex gap-3">
                            <button
                                onClick={() => handleUploadClick(iconInfo.category)}
                                disabled={uploading === iconInfo.category}
                                className={cn(
                                    'flex-1 flex items-center justify-center gap-2 px-6 py-3.5 text-sm font-bold rounded-2xl transition-all',
                                    'bg-primary-600 text-white hover:bg-primary-700 hover:shadow-lg hover:shadow-primary-500/30 active:scale-[0.98]',
                                    'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100'
                                )}
                            >
                                <Upload className="w-4.5 h-4.5" />
                                {uploading === iconInfo.category
                                    ? t('common.uploading', 'Subiendo...')
                                    : t('admin.fileIcons.upload', 'Subir SVG')}
                            </button>

                            {iconInfo.hasCustomIcon && (
                                <button
                                    onClick={() => handleReset(iconInfo.category)}
                                    title={t('admin.fileIcons.reset', 'Restablecer')}
                                    className="p-3.5 rounded-2xl border-2 border-dark-100 dark:border-dark-700 text-dark-500 dark:text-dark-400 hover:bg-dark-50 dark:hover:bg-dark-700 hover:text-dark-900 dark:hover:text-white transition-all active:scale-[0.9] hover:border-dark-200 dark:hover:border-dark-600"
                                >
                                    <RotateCcw className="w-5 h-5" />
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
