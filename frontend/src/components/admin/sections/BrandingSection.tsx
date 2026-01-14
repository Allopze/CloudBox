import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../../lib/api';
import Button from '../../ui/Button';
import Input from '../../ui/Input';
import { toast } from '../../ui/Toast';
import { Upload, Trash2, Save } from 'lucide-react';
import { useBrandingStore, BrandingSettings } from '../../../stores/brandingStore';

// Helper interface removed, using store type

export default function BrandingSection() {
    const { t } = useTranslation();
    const { branding, loadBranding } = useBrandingStore();

    const [brandingSettings, setBrandingSettings] = useState<BrandingSettings>({
        primaryColor: '#dc2626',
        logoLightUrl: undefined,
        logoDarkUrl: undefined,
        faviconUrl: undefined,
        siteName: 'CloudBox',
        customCss: '',
    });

    const [uploading, setUploading] = useState<Record<string, boolean>>({});
    const [savingBranding, setSavingBranding] = useState(false);

    useEffect(() => {
        // Initialize state from store
        if (branding) {
            setBrandingSettings({
                primaryColor: branding.primaryColor || '#dc2626',
                logoLightUrl: branding.logoLightUrl || undefined,
                logoDarkUrl: branding.logoDarkUrl || undefined,
                faviconUrl: branding.faviconUrl || undefined,
                siteName: branding.siteName || 'CloudBox',
                customCss: branding.customCss || '',
            });
        }
    }, [branding]);

    const uploadBrandingAsset = async (type: 'logo-light' | 'logo-dark' | 'favicon', file: File | null) => {
        if (!file) return;
        setUploading(prev => ({ ...prev, [type]: true }));

        // Create form data
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', type);

        try {
            await api.post(`/admin/branding/${type}`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });
            toast(t('admin.branding.uploadSuccess'), 'success');
            loadBranding(); // Reload store
        } catch (error) {
            toast(t('admin.branding.uploadError'), 'error');
        } finally {
            setUploading(prev => ({ ...prev, [type]: false }));
        }
    };

    const deleteBrandingAsset = async (type: 'logo-light' | 'logo-dark' | 'favicon') => {
        try {
            await api.delete(`/admin/branding/${type}`);
            toast(t('admin.branding.deleteSuccess'), 'success');
            loadBranding();
        } catch (error) {
            toast(t('admin.branding.deleteError'), 'error');
        }
    };

    const saveBranding = async () => {
        setSavingBranding(true);
        try {
            await api.put('/admin/settings/branding', {
                primaryColor: brandingSettings.primaryColor,
                customCss: brandingSettings.customCss,
                siteName: brandingSettings.siteName,
            });
            toast(t('admin.branding.saveSuccess'), 'success');
            loadBranding();
        } catch (error) {
            toast(t('admin.branding.saveError'), 'error');
        } finally {
            setSavingBranding(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-dark-900 dark:text-white">{t('admin.branding.title')}</h2>
                <p className="text-dark-500 dark:text-dark-400 mt-1">{t('admin.branding.description')}</p>
            </div>

            <div className="">
                {/* Color */}
                <div className="flex items-center gap-4 mb-6">
                    <label className="text-sm font-medium text-dark-700 dark:text-dark-300 w-32">{t('admin.branding.primaryColor')}</label>
                    <div className="flex items-center gap-3">
                        <input
                            type="color"
                            value={brandingSettings.primaryColor}
                            onChange={(e) => setBrandingSettings({ ...brandingSettings, primaryColor: e.target.value })}
                            className="color-input w-10 h-10 rounded-full cursor-pointer border border-dark-200 dark:border-dark-600 bg-white dark:bg-dark-800 overflow-hidden"
                            aria-label={t('admin.branding.primaryColor')}
                        />
                        <Input
                            value={brandingSettings.primaryColor}
                            onChange={(e) => setBrandingSettings({ ...brandingSettings, primaryColor: e.target.value })}
                            className="w-32 font-mono uppercase"
                        />
                    </div>
                </div>

                {/* Browser Tab Title */}
                <div className="mb-6">
                    <Input
                        label={t('admin.branding.siteName')}
                        value={brandingSettings.siteName || ''}
                        onChange={(e) => setBrandingSettings({ ...brandingSettings, siteName: e.target.value })}
                        placeholder={t('admin.branding.siteNamePlaceholder')}
                    />
                    <p className="text-xs text-dark-500 mt-1">
                        {t('admin.branding.siteNameHint')}
                    </p>
                </div>

                {/* Logo Uploads */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    {/* Logo Light */}
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-dark-700 dark:text-dark-300">{t('admin.branding.logoLight')}</label>
                        <div className="relative group">
                            <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => uploadBrandingAsset('logo-light', e.target.files?.[0] || null)}
                                className="hidden"
                                id="logo-light-upload"
                                disabled={uploading['logo-light']}
                            />
                            <label
                                htmlFor="logo-light-upload"
                                className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-dark-200 dark:border-dark-700 rounded-xl cursor-pointer hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/10 transition-all"
                            >
                                {brandingSettings.logoLightUrl ? (
                                    <div className="relative w-full h-full flex items-center justify-center p-4">
                                        <img src={brandingSettings.logoLightUrl} alt={t('common.logoAlt')} className="max-h-full max-w-full object-contain" />
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center text-dark-400">
                                        <Upload className="w-8 h-8 mb-2" />
                                        <span className="text-xs">{t('admin.branding.uploadImage')}</span>
                                    </div>
                                )}
                            </label>
                            {brandingSettings.logoLightUrl && (
                                <button
                                    onClick={() => deleteBrandingAsset('logo-light')}
                                    className="absolute top-2 right-2 p-1.5 bg-red-100 text-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-200"
                                    title={t('common.delete')}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                        <p className="text-xs text-dark-400">{t('admin.branding.lightBackground')}</p>
                    </div>

                    {/* Logo Dark */}
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-dark-700 dark:text-dark-300">{t('admin.branding.logoDark')}</label>
                        <div className="relative group">
                            <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => uploadBrandingAsset('logo-dark', e.target.files?.[0] || null)}
                                className="hidden"
                                id="logo-dark-upload"
                                disabled={uploading['logo-dark']}
                            />
                            <label
                                htmlFor="logo-dark-upload"
                                className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-dark-200 dark:border-dark-700 rounded-xl cursor-pointer hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/10 transition-all bg-dark-800"
                            >
                                {brandingSettings.logoDarkUrl ? (
                                    <div className="relative w-full h-full flex items-center justify-center p-4">
                                        <img src={brandingSettings.logoDarkUrl} alt={t('common.logoAlt')} className="max-h-full max-w-full object-contain" />
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center text-dark-400">
                                        <Upload className="w-8 h-8 mb-2" />
                                        <span className="text-xs">{t('admin.branding.uploadImage')}</span>
                                    </div>
                                )}
                            </label>
                            {brandingSettings.logoDarkUrl && (
                                <button
                                    onClick={() => deleteBrandingAsset('logo-dark')}
                                    className="absolute top-2 right-2 p-1.5 bg-red-100 text-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-200"
                                    title={t('common.delete')}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                        <p className="text-xs text-dark-400">{t('admin.branding.darkBackground')}</p>
                    </div>

                    {/* Favicon */}
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-dark-700 dark:text-dark-300">{t('admin.branding.favicon')}</label>
                        <div className="relative group">
                            <input
                                type="file"
                                accept="image/x-icon,image/png"
                                onChange={(e) => uploadBrandingAsset('favicon', e.target.files?.[0] || null)}
                                className="hidden"
                                id="favicon-upload"
                                disabled={uploading['favicon']}
                            />
                            <label
                                htmlFor="favicon-upload"
                                className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-dark-200 dark:border-dark-700 rounded-xl cursor-pointer hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/10 transition-all"
                            >
                                {brandingSettings.faviconUrl ? (
                                    <div className="relative w-full h-full flex items-center justify-center p-4">
                                        <img src={brandingSettings.faviconUrl} alt={t('common.faviconAlt')} className="w-8 h-8 object-contain" />
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center text-dark-400">
                                        <Upload className="w-8 h-8 mb-2" />
                                        <span className="text-xs">{t('admin.branding.uploadImage')}</span>
                                    </div>
                                )}
                            </label>
                            {brandingSettings.faviconUrl && (
                                <button
                                    onClick={() => deleteBrandingAsset('favicon')}
                                    className="absolute top-2 right-2 p-1.5 bg-red-100 text-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-200"
                                    title={t('common.delete')}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                        <p className="text-xs text-dark-400">{t('admin.branding.tabIcon')}</p>
                    </div>
                </div>

                {/* Custom CSS */}
                <div className="mb-6">
                    <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-2">{t('admin.branding.customCss')}</label>
                    <textarea
                        value={brandingSettings.customCss}
                        onChange={(e) => setBrandingSettings({ ...brandingSettings, customCss: e.target.value })}
                        className="w-full h-32 px-4 py-3 bg-dark-50 dark:bg-dark-900 border border-dark-200 dark:border-dark-700 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                        placeholder={t('admin.branding.customCssPlaceholder')}
                    />
                    <p className="text-xs text-dark-500 mt-1">{t('admin.branding.customCssHint')}</p>
                </div>

                <div className="flex justify-end pt-4 border-t border-dark-100 dark:border-dark-700">
                    <Button onClick={saveBranding} loading={savingBranding} icon={<Save className="w-4 h-4" />}>
                        {t('admin.branding.save')}
                    </Button>
                </div>
            </div>
        </div>
    );
}
