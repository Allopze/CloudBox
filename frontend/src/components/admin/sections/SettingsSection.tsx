import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../../lib/api';
import { cn } from '../../../lib/utils';
import Button from '../../ui/Button';
import Input from '../../ui/Input';
import { toast } from '../../ui/Toast';
import { HardDrive, FileType, Check, Upload, Save, TrendingUp, Shield } from 'lucide-react';

// Helper functions (copied from AdminDashboard)
const bytesToUnit = (bytes: string): { value: string; unit: string } => {
    const b = parseInt(bytes) || 0;
    if (b >= 1099511627776) return { value: (b / 1099511627776).toString(), unit: 'TB' };
    if (b >= 1073741824) return { value: (b / 1073741824).toString(), unit: 'GB' };
    return { value: (b / 1048576).toString(), unit: 'MB' };
};

const unitToBytes = (value: string, unit: string): string => {
    const v = parseFloat(value) || 0;
    switch (unit) {
        case 'TB': return Math.round(v * 1099511627776).toString();
        case 'GB': return Math.round(v * 1073741824).toString();
        case 'MB': default: return Math.round(v * 1048576).toString();
    }
};

const parseExtensionsInput = (value: string): string[] => {
    return value
        .split(/[\n,]+/)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
};

interface SystemSettings {
    siteName: string;
    siteDescription: string;
    allowRegistration: boolean;
    defaultStorageQuota: string;
    maxFileSize: string;
    allowedFileTypes: string;
}

interface UploadLimits {
    maxFileSize: string;
    chunkSize: string;
    concurrentChunks: string;
}

export default function SettingsSection() {
    const { t } = useTranslation();

    // Settings State
    const [systemSettings, setSystemSettings] = useState<SystemSettings>({
        siteName: 'CloudBox',
        siteDescription: 'Your files, everywhere',
        allowRegistration: true,
        defaultStorageQuota: '10737418240',
        maxFileSize: '1073741824',
        allowedFileTypes: '*',
    });

    const [uploadLimits, setUploadLimits] = useState<UploadLimits>({
        maxFileSize: String(1024 * 1024 * 1024),
        chunkSize: String(20 * 1024 * 1024),
        concurrentChunks: '4',
    });

    const [savingSystem, setSavingSystem] = useState(false);
    const [savingUploadLimits, setSavingUploadLimits] = useState(false);
    const [savingCors, setSavingCors] = useState(false);
    const [savingBlockedExtensions, setSavingBlockedExtensions] = useState(false);
    const [loading, setLoading] = useState(true);

    // CORS State
    const [allowedOrigins, setAllowedOrigins] = useState('');
    const [blockedExtensions, setBlockedExtensions] = useState('');
    const [blockedExtensionsDefault, setBlockedExtensionsDefault] = useState(true);

    // Helper State
    const [quotaValue, setQuotaValue] = useState('');
    const [quotaUnit, setQuotaUnit] = useState('GB');
    const [maxFileSizeValue, setMaxFileSizeValue] = useState('');
    const [maxFileSizeUnit, setMaxFileSizeUnit] = useState('GB');

    const [uploadMaxValue, setUploadMaxValue] = useState('');
    const [uploadMaxUnit, setUploadMaxUnit] = useState('GB');
    const [uploadChunkValue, setUploadChunkValue] = useState('');
    const [uploadChunkUnit, setUploadChunkUnit] = useState('MB');

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const [systemRes, limitsRes, corsRes, blockedRes] = await Promise.all([
                api.get('/admin/settings/system').catch(() => ({ data: {} })),
                api.get('/admin/settings/limits').catch(() => ({ data: {} })),
                api.get('/admin/settings/cors').catch(() => ({ data: {} })),
                api.get('/admin/settings/blocked-extensions').catch(() => ({ data: null }))
            ]);

            if (systemRes.data) {
                setSystemSettings(prev => ({ ...prev, ...systemRes.data }));

                // Parse units
                const q = bytesToUnit(systemRes.data.defaultStorageQuota || '10737418240');
                setQuotaValue(q.value);
                setQuotaUnit(q.unit);

                const m = bytesToUnit(systemRes.data.maxFileSize || '1073741824');
                setMaxFileSizeValue(m.value);
                setMaxFileSizeUnit(m.unit);
            }

            if (limitsRes.data && limitsRes.data.maxFileSize) {
                setUploadLimits(limitsRes.data);

                const maxParsed = bytesToUnit(limitsRes.data.maxFileSize);
                setUploadMaxValue(maxParsed.value);
                setUploadMaxUnit(maxParsed.unit);

                const chunkParsed = bytesToUnit(limitsRes.data.chunkSize);
                setUploadChunkValue(chunkParsed.value);
                setUploadChunkUnit(chunkParsed.unit);
            }

            if (corsRes.data) {
                // Convert comma-separated to newline-separated for textarea
                setAllowedOrigins((corsRes.data.allowedOrigins || '').split(',').filter((s: string) => s).join('\n'));
            }

            if (blockedRes.data) {
                const list = Array.isArray(blockedRes.data.extensions) ? blockedRes.data.extensions : [];
                setBlockedExtensions(list.join('\n'));
                setBlockedExtensionsDefault(Boolean(blockedRes.data.isDefault));
            }
        } catch (error) {
            toast(t('admin.loadError'), 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleQuotaChange = (value: string, unit: string) => {
        setQuotaValue(value);
        setQuotaUnit(unit);
        setSystemSettings(prev => ({
            ...prev,
            defaultStorageQuota: unitToBytes(value, unit)
        }));
    };

    const handleMaxFileSizeChange = (value: string, unit: string) => {
        setMaxFileSizeValue(value);
        setMaxFileSizeUnit(unit);
        setSystemSettings(prev => ({
            ...prev,
            maxFileSize: unitToBytes(value, unit)
        }));
    };

    const saveSystemSettings = async () => {
        setSavingSystem(true);
        try {
            await api.put('/admin/settings/system', systemSettings);
            toast(t('admin.configSaved'), 'success');
        } catch (error) {
            toast(t('admin.saveError'), 'error');
        } finally {
            setSavingSystem(false);
        }
    };

    // Upload limits handlers
    const handleUploadMaxChange = (value: string, unit: string) => {
        setUploadMaxValue(value);
        setUploadMaxUnit(unit);
        setUploadLimits(prev => ({
            ...prev,
            maxFileSize: unitToBytes(value, unit)
        }));
    };

    const handleChunkSizeChange = (value: string, unit: string) => {
        setUploadChunkValue(value);
        setUploadChunkUnit(unit);
        setUploadLimits(prev => ({
            ...prev,
            chunkSize: unitToBytes(value, unit)
        }));
    };

    const saveUploadLimits = async () => {
        setSavingUploadLimits(true);
        try {
            await api.put('/admin/settings/limits', uploadLimits);
            toast(t('admin.limitsSaved'), 'success');
        } catch (error: any) {
            toast(error.response?.data?.error || t('admin.limitsSaveError'), 'error');
        } finally {
            setSavingUploadLimits(false);
        }
    };

    // CORS handlers
    const saveCorsSettings = async () => {
        setSavingCors(true);
        try {
            await api.put('/admin/settings/cors', { allowedOrigins });
            toast(t('admin.corsSaved'), 'success');
        } catch (error: any) {
            toast(error.response?.data?.error || t('admin.corsError'), 'error');
        } finally {
            setSavingCors(false);
        }
    };

    const saveBlockedExtensions = async () => {
        setSavingBlockedExtensions(true);
        try {
            const extensions = parseExtensionsInput(blockedExtensions);
            const response = await api.put('/admin/settings/blocked-extensions', { extensions });
            const saved = Array.isArray(response.data?.extensions) ? response.data.extensions : extensions;
            setBlockedExtensions(saved.join('\n'));
            setBlockedExtensionsDefault(false);
            toast(t('admin.blockedExtensions.saved'), 'success');
        } catch (error: any) {
            toast(error.response?.data?.error || t('admin.blockedExtensions.saveError'), 'error');
        } finally {
            setSavingBlockedExtensions(false);
        }
    };

    if (loading) {
        return <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>;
    }

    return (
        <div className="space-y-8">
            {/* General Settings */}
            <section>
                <div className="mb-4">
                    <h2 className="text-2xl font-bold text-dark-900 dark:text-white">
                        {t('admin.general.title')}
                    </h2>
                    <p className="text-dark-500 dark:text-dark-400 mt-1">
                        {t('admin.general.description')}
                    </p>
                </div>
                <div className="py-2">
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <Input
                            label={t('admin.general.siteName')}
                            value={systemSettings.siteName}
                            onChange={(e) => setSystemSettings({ ...systemSettings, siteName: e.target.value })}
                        />
                        <Input
                            label={t('admin.general.siteDescription')}
                            value={systemSettings.siteDescription}
                            onChange={(e) => setSystemSettings({ ...systemSettings, siteDescription: e.target.value })}
                        />
                    </div>

                    <div className="flex items-center justify-between p-4 bg-dark-50 dark:bg-dark-900 rounded-xl mb-4 border border-dark-100 dark:border-dark-700">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-white dark:bg-dark-800 rounded-full shadow-sm">
                                <Check className="w-4 h-4 text-primary-600" />
                            </div>
                            <div>
                                <p className="font-semibold text-dark-900 dark:text-white">{t('admin.general.allowRegistration')}</p>
                                <p className="text-sm text-dark-500">{t('admin.general.allowRegistrationDesc')}</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setSystemSettings({ ...systemSettings, allowRegistration: !systemSettings.allowRegistration })}
                            className={cn(
                                "relative w-11 h-6 rounded-full transition-colors duration-300",
                                systemSettings.allowRegistration ? 'bg-primary-600' : 'bg-dark-300 dark:bg-dark-600'
                            )}
                        >
                            <span className={cn(
                                "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300",
                                systemSettings.allowRegistration ? 'left-[calc(100%-1.375rem)]' : 'left-0.5'
                            )} />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        <div>
                            <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
                                <HardDrive className="w-4 h-4 inline mr-1" /> {t('admin.general.defaultQuota')}
                            </label>
                            <div className="flex rounded-xl border border-dark-300 dark:border-dark-600 focus-within:ring-2 focus-within:ring-primary-500 overflow-hidden">
                                <input
                                    type="number"
                                    value={quotaValue}
                                    onChange={(e) => handleQuotaChange(e.target.value, quotaUnit)}
                                    className="w-full px-3 py-2 bg-transparent text-dark-900 dark:text-white focus:outline-none"
                                />
                                <select
                                    value={quotaUnit}
                                    onChange={(e) => handleQuotaChange(quotaValue, e.target.value)}
                                    className="px-2 bg-dark-50 dark:bg-dark-700 border-l border-dark-200 dark:border-dark-600 focus:outline-none"
                                >
                                    <option value="MB">{t('common.units.mb')}</option>
                                    <option value="GB">{t('common.units.gb')}</option>
                                    <option value="TB">{t('common.units.tb')}</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
                                <FileType className="w-4 h-4 inline mr-1" /> {t('admin.general.maxFileSize')}
                            </label>
                            <div className="flex rounded-xl border border-dark-300 dark:border-dark-600 focus-within:ring-2 focus-within:ring-primary-500 overflow-hidden">
                                <input
                                    type="number"
                                    value={maxFileSizeValue}
                                    onChange={(e) => handleMaxFileSizeChange(e.target.value, maxFileSizeUnit)}
                                    className="w-full px-3 py-2 bg-transparent text-dark-900 dark:text-white focus:outline-none"
                                />
                                <select
                                    value={maxFileSizeUnit}
                                    onChange={(e) => handleMaxFileSizeChange(maxFileSizeValue, e.target.value)}
                                    className="px-2 bg-dark-50 dark:bg-dark-700 border-l border-dark-200 dark:border-dark-600 focus:outline-none"
                                >
                                    <option value="MB">{t('common.units.mb')}</option>
                                    <option value="GB">{t('common.units.gb')}</option>
                                    <option value="TB">{t('common.units.tb')}</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Allowed Origins */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
                            <Shield className="w-4 h-4 inline mr-1" /> {t('admin.general.allowedOrigins')}
                        </label>
                        <p className="text-xs text-dark-500 mb-2">
                            {t('admin.general.allowedOriginsDesc')}
                        </p>
                        <textarea
                            value={allowedOrigins}
                            onChange={(e) => setAllowedOrigins(e.target.value)}
                            rows={4}
                            placeholder={t('admin.general.allowedOriginsPlaceholder')}
                            className="w-full px-3 py-2 rounded-xl border border-dark-300 dark:border-dark-600 bg-transparent text-dark-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
                        />
                        <div className="flex justify-end mt-2">
                            <Button onClick={saveCorsSettings} loading={savingCors} variant="secondary" icon={<Save className="w-4 h-4" />}>
                                {t('admin.general.saveCors')}
                            </Button>
                        </div>
                    </div>

                    <div className="flex justify-end pt-4 border-t border-dark-100 dark:border-dark-700">
                        <Button onClick={saveSystemSettings} loading={savingSystem} icon={<Save className="w-4 h-4" />}>
                            {t('admin.general.save')}
                        </Button>
                    </div>
                </div>
            </section>

            {/* Upload Limits */}
            <section>
                <div className="flex items-center gap-2 mb-2">
                    <Upload className="w-5 h-5 text-primary-600" />
                    <h2 className="text-xl font-bold text-dark-900 dark:text-white">
                        {t('admin.limits.title')}
                    </h2>
                </div>
                <div className="py-2">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                        <div>
                            <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
                                {t('admin.limits.maxFileSize')}
                            </label>
                            <div className="flex rounded-xl border border-dark-300 dark:border-dark-600 focus-within:ring-2 focus-within:ring-primary-500 overflow-hidden">
                                <input
                                    type="number"
                                    value={uploadMaxValue}
                                    onChange={(e) => handleUploadMaxChange(e.target.value, uploadMaxUnit)}
                                    className="w-full px-3 py-2 bg-transparent text-dark-900 dark:text-white focus:outline-none"
                                />
                                <select
                                    value={uploadMaxUnit}
                                    onChange={(e) => handleUploadMaxChange(uploadMaxValue, e.target.value)}
                                    className="px-2 bg-dark-50 dark:bg-dark-700 border-l border-dark-200 dark:border-dark-600 focus:outline-none"
                                >
                                    <option value="MB">{t('common.units.mb')}</option>
                                    <option value="GB">{t('common.units.gb')}</option>
                                    <option value="TB">{t('common.units.tb')}</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
                                {t('admin.limits.chunkSize')}
                            </label>
                            <div className="flex rounded-xl border border-dark-300 dark:border-dark-600 focus-within:ring-2 focus-within:ring-primary-500 overflow-hidden">
                                <input
                                    type="number"
                                    value={uploadChunkValue}
                                    onChange={(e) => handleChunkSizeChange(e.target.value, uploadChunkUnit)}
                                    className="w-full px-3 py-2 bg-transparent text-dark-900 dark:text-white focus:outline-none"
                                />
                                <select
                                    value={uploadChunkUnit}
                                    onChange={(e) => handleChunkSizeChange(uploadChunkValue, e.target.value)}
                                    className="px-2 bg-dark-50 dark:bg-dark-700 border-l border-dark-200 dark:border-dark-600 focus:outline-none"
                                >
                                    <option value="MB">{t('common.units.mb')}</option>
                                    <option value="GB">{t('common.units.gb')}</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
                                <TrendingUp className="w-4 h-4 inline mr-1" /> {t('admin.limits.concurrentChunks')}
                            </label>
                            <input
                                type="number"
                                value={uploadLimits.concurrentChunks}
                                onChange={(e) => setUploadLimits({ ...uploadLimits, concurrentChunks: e.target.value })}
                                className="w-full px-3 py-2 rounded-xl border border-dark-300 dark:border-dark-600 bg-transparent text-dark-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                                min="1"
                                max="10"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end pt-4 border-t border-dark-100 dark:border-dark-700">
                        <Button onClick={saveUploadLimits} loading={savingUploadLimits} icon={<Save className="w-4 h-4" />}>
                            {t('admin.limits.save')}
                        </Button>
                    </div>
                </div>
            </section>

            {/* Blocked Extensions */}
            <section>
                <div className="flex items-center gap-2 mb-2">
                    <Shield className="w-5 h-5 text-primary-600" />
                    <h2 className="text-xl font-bold text-dark-900 dark:text-white">
                        {t('admin.blockedExtensions.title')}
                    </h2>
                </div>
                <p className="text-sm text-dark-500 dark:text-dark-400 mb-3">
                    {t('admin.blockedExtensions.description')}
                </p>
                <textarea
                    value={blockedExtensions}
                    onChange={(e) => setBlockedExtensions(e.target.value)}
                    rows={6}
                    placeholder={t('admin.blockedExtensions.placeholder')}
                    className="w-full px-3 py-2 rounded-xl border border-dark-300 dark:border-dark-600 bg-transparent text-dark-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
                />
                <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-dark-500 dark:text-dark-400">
                        {blockedExtensionsDefault
                            ? t('admin.blockedExtensions.defaultList')
                            : t('admin.blockedExtensions.customList')}
                    </span>
                    <Button onClick={saveBlockedExtensions} loading={savingBlockedExtensions} variant="secondary" icon={<Save className="w-4 h-4" />}>
                        {t('admin.blockedExtensions.save')}
                    </Button>
                </div>
            </section>
        </div>
    );
}
