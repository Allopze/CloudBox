import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../../lib/api';
import Button from '../../ui/Button';
import { toast } from '../../ui/Toast';
import { Save } from 'lucide-react';

interface LegalSettings {
    privacyPolicy: string;
    termsOfService: string;
}

type LegalLocale = 'es' | 'en';

export default function LegalSection() {
    const { t } = useTranslation();
    const emptySettings: LegalSettings = { privacyPolicy: '', termsOfService: '' };

    const [activeLocale, setActiveLocale] = useState<LegalLocale>('es');
    const [legalSettingsByLocale, setLegalSettingsByLocale] = useState<Record<LegalLocale, LegalSettings>>({
        es: { ...emptySettings },
        en: { ...emptySettings },
    });
    const [loadedLocales, setLoadedLocales] = useState<Record<LegalLocale, boolean>>({
        es: false,
        en: false,
    });

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<'privacy' | 'terms'>('privacy');

    useEffect(() => {
        if (!loadedLocales[activeLocale]) {
            loadLegalSettings(activeLocale);
        }
    }, [activeLocale, loadedLocales]);

    const loadLegalSettings = async (locale: LegalLocale) => {
        try {
            setLoading(true);
            const response = await api.get('/admin/legal', { params: { locale } });
            const pages = response.data;
            if (Array.isArray(pages)) {
                const privacy = pages.find((p: any) => p.slug === 'privacy');
                const terms = pages.find((p: any) => p.slug === 'terms');

                setLegalSettingsByLocale((prev) => ({
                    ...prev,
                    [locale]: {
                        privacyPolicy: privacy?.content || '',
                        termsOfService: terms?.content || '',
                    },
                }));
                setLoadedLocales((prev) => ({ ...prev, [locale]: true }));
            }
        } catch (error) {
            toast(t('admin.loadError'), 'error');
        } finally {
            setLoading(false);
        }
    };

    const saveLegalSettings = async () => {
        setSaving(true);
        try {
            const currentSettings = legalSettingsByLocale[activeLocale];
            const titles: Record<LegalLocale, { privacy: string; terms: string }> = {
                es: {
                    privacy: 'Politica de Privacidad',
                    terms: 'Terminos de Servicio',
                },
                en: {
                    privacy: 'Privacy Policy',
                    terms: 'Terms of Service',
                },
            };
            // Save each page individually as the backend expects
            await Promise.all([
                api.put('/admin/legal/privacy', {
                    title: titles[activeLocale].privacy,
                    content: currentSettings.privacyPolicy,
                    isActive: true,
                    locale: activeLocale
                }),
                api.put('/admin/legal/terms', {
                    title: titles[activeLocale].terms,
                    content: currentSettings.termsOfService,
                    isActive: true,
                    locale: activeLocale
                })
            ]);
            toast(t('admin.legal.saved'), 'success');
        } catch (error) {
            toast(t('admin.saveError'), 'error');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-bold text-dark-900 dark:text-white">{t('admin.legal.title', 'Paginas Legales')}</h2>
                    <p className="text-dark-500 dark:text-dark-400 mt-1">{t('admin.legal.description', 'Edita el contenido de las paginas de Privacidad y Terminos.')}</p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-sm text-dark-500 dark:text-dark-400">{t('language.label', 'Language')}</span>
                    <select
                        value={activeLocale}
                        onChange={(e) => setActiveLocale(e.target.value as LegalLocale)}
                        className="input h-9 py-1.5 px-3 w-32"
                    >
                        <option value="es">{t('language.es', 'Spanish')}</option>
                        <option value="en">{t('language.en', 'English')}</option>
                    </select>
                </div>
            </div>

            <div className="border border-dark-100 dark:border-dark-700 rounded-2xl overflow-hidden">
                {/* Tabs */}
                <div className="flex border-b border-dark-100 dark:border-dark-700">
                    <button
                        onClick={() => setActiveTab('privacy')}
                        className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${activeTab === 'privacy'
                            ? 'text-primary-600 border-b-2 border-primary-600 bg-primary-50/50 dark:bg-primary-900/10'
                            : 'text-dark-500 hover:text-dark-900 dark:hover:text-white hover:bg-dark-50 dark:hover:bg-dark-700/50'
                            }`}
                    >
                        {t('admin.legal.privacy')}
                    </button>
                    <button
                        onClick={() => setActiveTab('terms')}
                        className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${activeTab === 'terms'
                            ? 'text-primary-600 border-b-2 border-primary-600 bg-primary-50/50 dark:bg-primary-900/10'
                            : 'text-dark-500 hover:text-dark-900 dark:hover:text-white hover:bg-dark-50 dark:hover:bg-dark-700/50'
                            }`}
                    >
                        {t('admin.legal.terms')}
                    </button>
                </div>

                {/* Editor */}
                <div className="p-6">
                    {activeTab === 'privacy' ? (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-sm font-medium text-dark-700 dark:text-dark-300">Contenido (Markdown)</label>
                                <a href="/privacy" target="_blank" rel="noreferrer" className="text-xs text-primary-600 hover:underline">{t('admin.legal.viewPublic', 'Ver página pública')}</a>
                            </div>
                            <textarea
                                value={legalSettingsByLocale[activeLocale].privacyPolicy}
                                onChange={(e) => setLegalSettingsByLocale((prev) => ({
                                    ...prev,
                                    [activeLocale]: {
                                        ...prev[activeLocale],
                                        privacyPolicy: e.target.value,
                                    },
                                }))}
                                className="w-full h-[500px] px-4 py-3 bg-dark-50 dark:bg-dark-900 border border-dark-200 dark:border-dark-700 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none leading-relaxed"
                                placeholder="# Política de Privacidad..."
                            />
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-sm font-medium text-dark-700 dark:text-dark-300">Contenido (Markdown)</label>
                                <a href="/terms" target="_blank" rel="noreferrer" className="text-xs text-primary-600 hover:underline">{t('admin.legal.viewPublic', 'Ver página pública')}</a>
                            </div>
                            <textarea
                                value={legalSettingsByLocale[activeLocale].termsOfService}
                                onChange={(e) => setLegalSettingsByLocale((prev) => ({
                                    ...prev,
                                    [activeLocale]: {
                                        ...prev[activeLocale],
                                        termsOfService: e.target.value,
                                    },
                                }))}
                                className="w-full h-[500px] px-4 py-3 bg-dark-50 dark:bg-dark-900 border border-dark-200 dark:border-dark-700 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none leading-relaxed"
                                placeholder="# Términos y Condiciones..."
                            />
                        </div>
                    )}
                </div>

                <div className="flex justify-end p-4 border-t border-dark-100 dark:border-dark-700">
                    <Button onClick={saveLegalSettings} loading={saving} icon={<Save className="w-4 h-4" />}>
                        {t('common.save')}
                    </Button>
                </div>
            </div>
        </div>
    );
}






