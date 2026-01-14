import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../../lib/api';
import { cn } from '../../../lib/utils';
import Button from '../../ui/Button';
import Input from '../../ui/Input';
import { toast } from '../../ui/Toast';
import { Save, Globe, Shield, Clock, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';

interface WopiSettings {
    enabled: boolean;
    editEnabled: boolean;
    publicUrl: string;
    discoveryUrl: string;
    allowedIframeOrigins: string;
    tokenTtlSeconds: number;
    lockTtlSeconds: number;
    lockProvider: 'db' | 'redis';
    maxFileSize: number;
}

export default function WopiSection() {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testingDiscovery, setTestingDiscovery] = useState(false);
    const [discoveryStatus, setDiscoveryStatus] = useState<'unknown' | 'success' | 'error'>('unknown');
    const [supportedExtensions, setSupportedExtensions] = useState<string[]>([]);

    const [settings, setSettings] = useState<WopiSettings>({
        enabled: false,
        editEnabled: false,
        publicUrl: '',
        discoveryUrl: '',
        allowedIframeOrigins: '',
        tokenTtlSeconds: 900,
        lockTtlSeconds: 1800,
        lockProvider: 'db',
        maxFileSize: 104857600, // 100MB
    });

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const response = await api.get('/admin/settings/wopi');
            if (response.data) {
                setSettings(prev => ({ ...prev, ...response.data }));
            }
        } catch (error) {
            console.error('Failed to load WOPI settings', error);
            // If 404, settings don't exist yet - use defaults
        } finally {
            setLoading(false);
        }
    };

    const saveSettings = async () => {
        setSaving(true);
        try {
            await api.put('/admin/settings/wopi', settings);
            toast(t('admin.wopi.saved'), 'success');
        } catch (error: any) {
            toast(error.response?.data?.error || t('admin.wopi.saveError'), 'error');
        } finally {
            setSaving(false);
        }
    };

    const testDiscovery = async () => {
        if (!settings.discoveryUrl) {
            toast(t('admin.wopi.noDiscoveryUrl'), 'error');
            return;
        }

        setTestingDiscovery(true);
        setDiscoveryStatus('unknown');

        try {
            const response = await api.post('/admin/settings/wopi/test-discovery', {
                discoveryUrl: settings.discoveryUrl,
            });
            setDiscoveryStatus('success');
            setSupportedExtensions(response.data.extensions || []);
            toast(t('admin.wopi.discoverySuccess'), 'success');
        } catch (error: any) {
            setDiscoveryStatus('error');
            setSupportedExtensions([]);
            toast(error.response?.data?.error || t('admin.wopi.discoveryError'), 'error');
        } finally {
            setTestingDiscovery(false);
        }
    };

    const handleChange = (field: keyof WopiSettings, value: any) => {
        setSettings(prev => ({ ...prev, [field]: value }));
    };

    if (loading) {
        return (
            <div className="flex justify-center p-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h2 className="text-2xl font-bold text-dark-900 dark:text-white">
                    {t('admin.wopi.title')}
                </h2>
                <p className="text-dark-500 dark:text-dark-400 mt-1">
                    {t('admin.wopi.description')}
                </p>
            </div>

            {/* Enable/Disable Toggle */}
            <section className="bg-dark-50 dark:bg-dark-800/50 rounded-xl p-6 border border-dark-100 dark:border-dark-700">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            "p-2 rounded-full",
                            settings.enabled ? "bg-green-100 dark:bg-green-900/30" : "bg-dark-200 dark:bg-dark-700"
                        )}>
                            {settings.enabled ? (
                                <CheckCircle2 className="w-5 h-5 text-green-600" />
                            ) : (
                                <AlertCircle className="w-5 h-5 text-dark-400" />
                            )}
                        </div>
                        <div>
                            <p className="font-semibold text-dark-900 dark:text-white">
                                {t('admin.wopi.enableIntegration')}
                            </p>
                            <p className="text-sm text-dark-500">
                                {t('admin.wopi.enableDesc')}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => handleChange('enabled', !settings.enabled)}
                        className={cn(
                            "relative w-11 h-6 rounded-full transition-colors duration-300",
                            settings.enabled ? 'bg-primary-600' : 'bg-dark-300 dark:bg-dark-600'
                        )}
                    >
                        <span className={cn(
                            "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300",
                            settings.enabled ? 'left-[calc(100%-1.375rem)]' : 'left-0.5'
                        )} />
                    </button>
                </div>

                {settings.enabled && (
                    <div className="mt-4 pt-4 border-t border-dark-200 dark:border-dark-600">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="font-medium text-dark-900 dark:text-white">
                                    {t('admin.wopi.enableEdit')}
                                </p>
                                <p className="text-sm text-dark-500">
                                    {t('admin.wopi.enableEditDesc')}
                                </p>
                            </div>
                            <button
                                onClick={() => handleChange('editEnabled', !settings.editEnabled)}
                                className={cn(
                                    "relative w-11 h-6 rounded-full transition-colors duration-300",
                                    settings.editEnabled ? 'bg-primary-600' : 'bg-dark-300 dark:bg-dark-600'
                                )}
                            >
                                <span className={cn(
                                    "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300",
                                    settings.editEnabled ? 'left-[calc(100%-1.375rem)]' : 'left-0.5'
                                )} />
                            </button>
                        </div>
                    </div>
                )}
            </section>

            {settings.enabled && (
                <>
                    {/* Discovery Configuration */}
                    <section>
                        <div className="flex items-center gap-2 mb-4">
                            <Globe className="w-5 h-5 text-primary-600" />
                            <h3 className="text-lg font-semibold text-dark-900 dark:text-white">
                                {t('admin.wopi.discoveryTitle')}
                            </h3>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
                                    {t('admin.wopi.publicUrl')}
                                </label>
                                <Input
                                    value={settings.publicUrl}
                                    onChange={(e) => handleChange('publicUrl', e.target.value)}
                                    placeholder={t('admin.wopi.publicUrlPlaceholder')}
                                />
                                <p className="text-xs text-dark-500 mt-1">
                                    {t('admin.wopi.publicUrlDesc')}
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
                                    {t('admin.wopi.discoveryUrl')}
                                </label>
                                <div className="flex gap-2">
                                    <Input
                                        value={settings.discoveryUrl}
                                        onChange={(e) => handleChange('discoveryUrl', e.target.value)}
                                        placeholder={t('admin.wopi.discoveryUrlPlaceholder')}
                                        className="flex-1"
                                    />
                                    <Button
                                        onClick={testDiscovery}
                                        loading={testingDiscovery}
                                        variant="secondary"
                                        icon={<RefreshCw className="w-4 h-4" />}
                                    >
                                        {t('admin.wopi.testDiscovery')}
                                    </Button>
                                </div>
                                <p className="text-xs text-dark-500 mt-1">
                                    {t('admin.wopi.discoveryUrlDesc')}
                                </p>

                                {discoveryStatus === 'success' && supportedExtensions.length > 0 && (
                                    <div className="mt-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                                        <p className="text-sm font-medium text-green-800 dark:text-green-300 mb-1">
                                            {t('admin.wopi.supportedFormats')}
                                        </p>
                                        <div className="flex flex-wrap gap-1">
                                            {supportedExtensions.slice(0, 15).map(ext => (
                                                <span key={ext} className="px-2 py-0.5 text-xs bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-200 rounded">
                                                    .{ext}
                                                </span>
                                            ))}
                                            {supportedExtensions.length > 15 && (
                                                <span className="px-2 py-0.5 text-xs bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-200 rounded">
                                                    +{supportedExtensions.length - 15}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {discoveryStatus === 'error' && (
                                    <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                                        <p className="text-sm text-red-800 dark:text-red-300">
                                            {t('admin.wopi.discoveryFailed')}
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
                                    <Shield className="w-4 h-4 inline mr-1" />
                                    {t('admin.wopi.allowedOrigins')}
                                </label>
                                <Input
                                    value={settings.allowedIframeOrigins}
                                    onChange={(e) => handleChange('allowedIframeOrigins', e.target.value)}
                                    placeholder={t('admin.wopi.allowedOriginsPlaceholder')}
                                />
                                <p className="text-xs text-dark-500 mt-1">
                                    {t('admin.wopi.allowedOriginsDesc')}
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* Advanced Settings */}
                    <section>
                        <div className="flex items-center gap-2 mb-4">
                            <Clock className="w-5 h-5 text-primary-600" />
                            <h3 className="text-lg font-semibold text-dark-900 dark:text-white">
                                {t('admin.wopi.advancedTitle')}
                            </h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
                                    {t('admin.wopi.tokenTtl')}
                                </label>
                                <Input
                                    type="number"
                                    value={settings.tokenTtlSeconds}
                                    onChange={(e) => handleChange('tokenTtlSeconds', parseInt(e.target.value) || 900)}
                                    min={60}
                                    max={86400}
                                />
                                <p className="text-xs text-dark-500 mt-1">
                                    {t('admin.wopi.tokenTtlDesc')}
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
                                    {t('admin.wopi.lockTtl')}
                                </label>
                                <Input
                                    type="number"
                                    value={settings.lockTtlSeconds}
                                    onChange={(e) => handleChange('lockTtlSeconds', parseInt(e.target.value) || 1800)}
                                    min={300}
                                    max={86400}
                                />
                                <p className="text-xs text-dark-500 mt-1">
                                    {t('admin.wopi.lockTtlDesc')}
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
                                    {t('admin.wopi.lockProvider')}
                                </label>
                                <select
                                    value={settings.lockProvider}
                                    onChange={(e) => handleChange('lockProvider', e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl border border-dark-300 dark:border-dark-600 bg-white dark:bg-dark-800 text-dark-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                                >
                                    <option value="db">{t('admin.wopi.lockProviderOptions.db')}</option>
                                    <option value="redis">{t('admin.wopi.lockProviderOptions.redis')}</option>
                                </select>
                                <p className="text-xs text-dark-500 mt-1">
                                    {t('admin.wopi.lockProviderDesc')}
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
                                    {t('admin.wopi.maxFileSize')}
                                </label>
                                <Input
                                    type="number"
                                    value={Math.round(settings.maxFileSize / 1048576)}
                                    onChange={(e) => handleChange('maxFileSize', (parseInt(e.target.value) || 100) * 1048576)}
                                    min={1}
                                    max={1024}
                                />
                                <p className="text-xs text-dark-500 mt-1">
                                    {t('admin.wopi.maxFileSizeDesc')}
                                </p>
                            </div>
                        </div>
                    </section>
                </>
            )}

            {/* Save Button */}
            <div className="flex justify-end pt-4 border-t border-dark-100 dark:border-dark-700">
                <Button onClick={saveSettings} loading={saving} icon={<Save className="w-4 h-4" />}>
                    {t('admin.wopi.save')}
                </Button>
            </div>
        </div>
    );
}
