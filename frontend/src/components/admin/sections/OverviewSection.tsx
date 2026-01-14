import { HardDrive, AlertCircle, ServerCog, Mail, RefreshCw, Image, Wrench, FileSearch, Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatBytes } from '../../../lib/utils';
import Button from '../../ui/Button';
import { api } from '../../../lib/api';
import { useState } from 'react';
import { toast } from '../../ui/Toast';

interface OverviewSectionProps {
    summary: any | null;
}

type StatusTone = 'ok' | 'alert' | 'critical' | 'neutral';

function StatusBadge({ tone, label }: { tone: StatusTone; label: string }) {
    const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium';
    const tones: Record<StatusTone, string> = {
        ok: 'bg-green-50 text-green-600',
        alert: 'bg-yellow-50 text-yellow-700',
        critical: 'bg-red-50 text-red-600',
        neutral: 'bg-dark-100 text-dark-700',
    };
    return <span className={`${base} ${tones[tone]}`}>{label}</span>;
}

export default function OverviewSection({ summary }: OverviewSectionProps) {
    const { t } = useTranslation();
    const [loadingExport, setLoadingExport] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    // Quick actions state
    const [loadingSmtp, setLoadingSmtp] = useState(false);
    const [loadingReindex, setLoadingReindex] = useState(false);
    const [loadingThumbnails, setLoadingThumbnails] = useState(false);
    const [loadingMaintenance, setLoadingMaintenance] = useState(false);
    const [loadingRetryJobs, setLoadingRetryJobs] = useState(false);
    const [showSmtpModal, setShowSmtpModal] = useState(false);
    const [testEmail, setTestEmail] = useState('');
    const [maintenanceMode, setMaintenanceMode] = useState(false);
    const [showAllAlerts, setShowAllAlerts] = useState(false);
    const [showAllTopFiles, setShowAllTopFiles] = useState(false);
    const [showAllFailIps, setShowAllFailIps] = useState(false);

    const lastUpdated = summary?.generatedAt ? new Date(summary.generatedAt) : null;
    const listLimit = 5;
    const alerts = summary?.alerts ?? [];
    const topLargeFiles = summary?.capacity?.topLargeFiles ?? [];
    const topFailIps = summary?.security?.topFailIps ?? [];
    const visibleAlerts = showAllAlerts ? alerts : alerts.slice(0, listLimit);
    const visibleTopFiles = showAllTopFiles ? topLargeFiles : topLargeFiles.slice(0, listLimit);
    const visibleFailIps = showAllFailIps ? topFailIps : topFailIps.slice(0, listLimit);
    const notAvailableLabel = t('admin.overview.notAvailable');

    const getStatusMeta = (rawStatus?: string | null) => {
        const status = (rawStatus ?? '').toString().trim();
        const normalized = status.toUpperCase();

        if (!normalized) {
            return { tone: 'neutral' as const, label: t('admin.overview.health.statusUnknown') };
        }

        if (normalized === 'OK' || normalized === 'HEALTHY') {
            return { tone: 'ok' as const, label: t('admin.overview.health.statusOk') };
        }

        if (normalized === 'CONFIGURED') {
            return { tone: 'ok' as const, label: t('admin.overview.health.statusConfigured') };
        }

        if (normalized === 'DEGRADED') {
            return { tone: 'alert' as const, label: t('admin.overview.health.statusDegraded') };
        }

        if (normalized === 'ALERT' || normalized === 'STUCK' || normalized === 'ATASCADA' || normalized === 'ALERTA') {
            return { tone: 'alert' as const, label: t('admin.overview.health.statusAlert') };
        }

        if (normalized === 'NOT_CONFIGURED' || normalized === 'NO_CONFIGURADO') {
            return { tone: 'neutral' as const, label: t('admin.overview.health.statusNotConfigured') };
        }

        if (normalized === 'DOWN' || normalized === 'CAÍDO' || normalized === 'CAIDO') {
            return { tone: 'critical' as const, label: t('admin.overview.health.statusDown') };
        }

        if (normalized === 'CRITICAL' || normalized === 'FAILED' || normalized === 'CRÍTICO' || normalized === 'CRITICO') {
            return { tone: 'critical' as const, label: t('admin.overview.health.statusCritical') };
        }

        return { tone: 'neutral' as const, label: status };
    };

    const apiStatus = getStatusMeta(summary?.health?.api?.status ?? 'OK');
    const dbStatus = getStatusMeta(summary?.health?.db?.status ?? 'OK');
    const storageStatus = getStatusMeta(summary?.health?.storage?.status ?? 'OK');
    const jobsStatus = getStatusMeta(summary?.health?.jobs?.status ?? 'OK');
    const smtpStatus = getStatusMeta(summary?.health?.smtp?.status ?? '');

    const handleRefresh = async () => {
        try {
            setRefreshing(true);
            await api.get('/admin/summary');
            window.location.reload();
        } catch (err) {
            console.error('Failed to refresh summary', err);
        } finally {
            setRefreshing(false);
        }
    };

    const handleExport = async () => {
        try {
            setLoadingExport(true);
            const res = await api.get('/admin/summary/export', { responseType: 'blob' });
            if (res.status === 202) {
                toast(t('admin.overview.exportNotReady'), 'warning');
                return;
            }
            const blob = new Blob([res.data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `cloudbox-summary.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            toast(t('admin.overview.exportSuccess'), 'success');
        } catch (err) {
            console.error('Export failed', err);
            toast(t('admin.overview.exportError'), 'error');
        } finally {
            setLoadingExport(false);
        }
    };

    // Quick Actions handlers
    const handleTestSmtp = async () => {
        if (!testEmail) {
            toast(t('admin.overview.emailRequired'), 'warning');
            return;
        }
        try {
            setLoadingSmtp(true);
            const res = await api.post('/admin/summary/actions/test-smtp', { email: testEmail });
            if (res.data.success) {
                toast(t('admin.overview.smtpSuccess'), 'success');
                setShowSmtpModal(false);
                setTestEmail('');
            } else {
                toast(res.data.message || t('admin.overview.smtpError'), 'error');
            }
        } catch (err: any) {
            console.error('SMTP test failed', err);
            toast(err.response?.data?.message || t('admin.overview.smtpError'), 'error');
        } finally {
            setLoadingSmtp(false);
        }
    };

    const handleReindex = async () => {
        try {
            setLoadingReindex(true);
            const res = await api.post('/admin/summary/actions/reindex');
            if (res.data.success) {
                toast(t('admin.overview.reindexSuccess', { count: res.data.count }), 'success');
            } else {
                toast(res.data.message || t('admin.overview.reindexError'), 'error');
            }
        } catch (err: any) {
            console.error('Reindex failed', err);
            toast(err.response?.data?.message || t('admin.overview.reindexError'), 'error');
        } finally {
            setLoadingReindex(false);
        }
    };

    const handleRegenerateThumbnails = async () => {
        try {
            setLoadingThumbnails(true);
            const res = await api.post('/admin/summary/actions/regenerate-thumbnails');
            if (res.data.success) {
                toast(t('admin.overview.thumbnailsSuccess', {
                    images: res.data.images ?? 0,
                    videos: res.data.videos ?? 0,
                    documents: res.data.documents ?? 0,
                }), 'success');
            } else {
                toast(res.data.message || t('admin.overview.thumbnailsError'), 'error');
            }
        } catch (err: any) {
            console.error('Regenerate thumbnails failed', err);
            toast(err.response?.data?.message || t('admin.overview.thumbnailsError'), 'error');
        } finally {
            setLoadingThumbnails(false);
        }
    };

    const handleToggleMaintenance = async () => {
        try {
            setLoadingMaintenance(true);
            const res = await api.post('/admin/summary/actions/toggle-maintenance');
            if (res.data.success) {
                setMaintenanceMode(res.data.maintenance);
                toast(res.data.message, 'success');
            } else {
                toast(res.data.message || t('admin.overview.maintenanceError'), 'error');
            }
        } catch (err: any) {
            console.error('Toggle maintenance failed', err);
            toast(err.response?.data?.message || t('admin.overview.maintenanceError'), 'error');
        } finally {
            setLoadingMaintenance(false);
        }
    };

    const handleRetryJobs = async () => {
        try {
            setLoadingRetryJobs(true);
            const res = await api.post('/admin/summary/actions/retry-jobs');
            if (res.data.success) {
                toast(res.data.message, 'success');
            } else {
                toast(res.data.message || t('admin.overview.retryJobsError'), 'error');
            }
        } catch (err: any) {
            console.error('Retry jobs failed', err);
            toast(err.response?.data?.message || t('admin.overview.retryJobsError'), 'error');
        } finally {
            setLoadingRetryJobs(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* SMTP Test Modal */}
            {showSmtpModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-dark-900 rounded-2xl p-6 w-full max-w-md shadow-xl">
                        <h3 className="text-lg font-semibold mb-4">{t('admin.overview.testSmtpTitle')}</h3>
                        <p className="text-sm text-dark-500 mb-4">{t('admin.overview.testSmtpDesc')}</p>
                        <input
                            type="email"
                            value={testEmail}
                            onChange={(e) => setTestEmail(e.target.value)}
                            placeholder={t('admin.overview.testEmailPlaceholder')}
                            className="w-full px-4 py-2 rounded-xl border border-dark-200 dark:border-dark-700 bg-white dark:bg-dark-800 mb-4"
                        />
                        <div className="flex gap-3 justify-end">
                            <Button variant="ghost" onClick={() => setShowSmtpModal(false)}>
                                {t('common.cancel')}
                            </Button>
                            <Button onClick={handleTestSmtp} loading={loadingSmtp}>
                                <Mail className="w-4 h-4 mr-2" />
                                {t('admin.overview.sendTest')}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex items-start justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-dark-900 dark:text-white">{t('admin.overview.title')}</h2>
                    <p className="text-dark-500 dark:text-dark-400 mt-1">{t('admin.overview.subtitle')}</p>
                    {lastUpdated && (
                        <p className="text-sm text-dark-500 mt-2">{t('admin.overview.lastUpdated')}: {new Date(lastUpdated).toLocaleString()}</p>
                    )}
                </div>
                <div className="flex gap-3">
                    <Button variant="outline" size="sm" onClick={handleRefresh} loading={refreshing}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        {t('admin.overview.refresh')}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleExport} loading={loadingExport}>
                        {t('admin.overview.export')}
                    </Button>
                </div>
            </div>

            {/* Row 1: Health */}
            <div className="p-6 bg-dark-50/50 dark:bg-dark-900/40 rounded-[1.5rem] border border-dark-100 dark:border-dark-800">
                <h3 className="text-lg font-semibold mb-4">{t('admin.overview.health.title')}</h3>
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-md bg-blue-50 flex items-center justify-center text-blue-600"><ServerCog className="w-4 h-4" /></div>
                            <div>
                                <p className="text-sm font-medium text-dark-700">{t('admin.overview.health.api')}</p>
                                <p className="text-sm text-dark-500">{t('admin.overview.health.apiStatus')}</p>
                            </div>
                        </div>
                        <StatusBadge tone={apiStatus.tone} label={apiStatus.label} />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-md bg-indigo-50 flex items-center justify-center text-indigo-600"><HardDrive className="w-4 h-4" /></div>
                            <div>
                                <p className="text-sm font-medium text-dark-700">{t('admin.overview.health.database')}</p>
                                <p className="text-sm text-dark-500">
                                    {t('admin.overview.health.latency')}: {summary?.health?.db?.latencyMs != null ? `${summary.health.db.latencyMs}ms` : notAvailableLabel}
                                </p>
                            </div>
                        </div>
                        <StatusBadge tone={dbStatus.tone} label={dbStatus.label} />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-md bg-purple-50 flex items-center justify-center text-purple-600"><HardDrive className="w-4 h-4" /></div>
                            <div>
                                <p className="text-sm font-medium text-dark-700">{t('admin.overview.health.storage')}</p>
                                <p className="text-sm text-dark-500">
                                    {t('admin.overview.health.storageUsage')}: {summary?.health?.storage ? `${formatBytes(Number(summary.health.storage.usedBytes || 0))} / ${summary.health.storage.totalQuota ? formatBytes(Number(summary.health.storage.totalQuota)) : notAvailableLabel}` : notAvailableLabel}
                                </p>
                            </div>
                        </div>
                        <StatusBadge tone={storageStatus.tone} label={storageStatus.label} />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-md bg-yellow-50 flex items-center justify-center text-yellow-600"><AlertCircle className="w-4 h-4" /></div>
                            <div>
                                <p className="text-sm font-medium text-dark-700">{t('admin.overview.health.jobs')}</p>
                                <p className="text-sm text-dark-500">
                                    {t('admin.overview.health.pending')}: {summary?.health?.jobs?.details?.transcoding?.waiting ?? notAvailableLabel}
                                </p>
                            </div>
                        </div>
                        <StatusBadge tone={jobsStatus.tone} label={jobsStatus.label} />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-md bg-gray-50 flex items-center justify-center text-gray-600"><Mail className="w-4 h-4" /></div>
                            <div>
                                <p className="text-sm font-medium text-dark-700">{t('admin.overview.health.smtp')}</p>
                                <p className="text-sm text-dark-500">{summary?.health?.smtp?.status ? smtpStatus.label : notAvailableLabel}</p>
                            </div>
                        </div>
                        <StatusBadge tone={smtpStatus.tone} label={smtpStatus.label} />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-md bg-gray-50 flex items-center justify-center text-gray-600"><ServerCog className="w-4 h-4" /></div>
                            <div>
                                <p className="text-sm font-medium text-dark-700">{t('admin.overview.health.version')}</p>
                                <p className="text-sm text-dark-500">
                                    {summary?.health?.version?.version || notAvailableLabel}
                                    {summary?.health?.version?.migrationsPending ? ` (${t('admin.overview.health.migrationsPending')})` : ''}
                                </p>
                            </div>
                        </div>
                        <StatusBadge tone={apiStatus.tone} label={apiStatus.label} />
                    </div>
                </div>
            </div>

            {/* Row 2: Metrics tiles */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="flex flex-col p-6 bg-dark-50/50 dark:bg-dark-900/40 rounded-[1.5rem] border border-dark-100 dark:border-dark-800">
                    <p className="text-sm font-medium text-dark-500">{t('admin.overview.metrics.totalUsers')}</p>
                    <p className="text-3xl font-bold text-dark-900 dark:text-white mt-2">{summary?.metrics?.users?.total ?? notAvailableLabel}</p>
                    <p className="text-sm text-dark-500 mt-1">{t('admin.overview.metrics.activeUsers24h')}: {summary?.metrics?.users?.active24 ?? notAvailableLabel}</p>
                </div>

                <div className="flex flex-col p-6 bg-dark-50/50 dark:bg-dark-900/40 rounded-[1.5rem] border border-dark-100 dark:border-dark-800">
                    <p className="text-sm font-medium text-dark-500">{t('admin.overview.metrics.newUsers')}</p>
                    <p className="text-3xl font-bold text-dark-900 dark:text-white mt-2">{t('admin.overview.metrics.today')}: {summary?.metrics?.users?.newToday ?? notAvailableLabel}</p>
                    <p className="text-sm text-dark-500 mt-1">{t('admin.overview.metrics.week')}: {summary?.metrics?.users?.newWeek ?? notAvailableLabel}</p>
                </div>

                <div className="flex flex-col p-6 bg-dark-50/50 dark:bg-dark-900/40 rounded-[1.5rem] border border-dark-100 dark:border-dark-800">
                    <p className="text-sm font-medium text-dark-500">{t('admin.overview.metrics.uploads')}</p>
                    <p className="text-3xl font-bold text-dark-900 dark:text-white mt-2">{summary?.metrics?.uploads?.count24h ?? notAvailableLabel}</p>
                    <p className="text-sm text-dark-500 mt-1">{summary?.metrics?.uploads?.bytes24h != null ? formatBytes(Number(summary.metrics.uploads.bytes24h)) : notAvailableLabel}</p>
                </div>

                <div className="flex flex-col p-6 bg-dark-50/50 dark:bg-dark-900/40 rounded-[1.5rem] border border-dark-100 dark:border-dark-800">
                    <p className="text-sm font-medium text-dark-500">{t('admin.overview.metrics.downloads')}</p>
                    <p className="text-3xl font-bold text-dark-900 dark:text-white mt-2">{summary?.metrics?.downloads?.count24h ?? notAvailableLabel}</p>
                </div>
            </div>

            {/* Row 3: Capacity and Top files */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="col-span-2 p-6 bg-dark-50/50 dark:bg-dark-900/40 rounded-[1.5rem] border border-dark-100 dark:border-dark-800">
                    <h4 className="font-semibold mb-3">{t('admin.overview.capacity.diskUsage')}</h4>
                    {summary?.capacity?.storageSeries?.length ? (
                        <div className="space-y-2">
                            {(() => {
                                const series = summary.capacity.storageSeries;
                                const maxBytes = Math.max(...series.map((s: any) => Number(s.bytes)));
                                return series.map((s: any) => {
                                    const percent = maxBytes > 0 ? (Number(s.bytes) / maxBytes) * 100 : 0;
                                    return (
                                        <div key={s.date} className="flex items-center gap-3">
                                            <div className="w-16 text-xs text-dark-500">{s.date.slice(5)}</div>
                                            <div className="flex-1 h-4 bg-dark-200 dark:bg-dark-700 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-primary-500 rounded-full transition-all"
                                                    style={{ width: `${percent}%` }}
                                                />
                                            </div>
                                            <div className="w-20 text-xs text-right font-medium">{formatBytes(Number(s.bytes))}</div>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    ) : <div className="text-sm text-dark-500">{t('admin.overview.capacity.noData')}</div>}
                    {summary?.capacity?.projectionDays != null && (
                        <p className="text-sm text-dark-500 mt-3">
                            {t('admin.overview.capacity.projection')}: ~{summary?.capacity?.projectionDays} {t('admin.overview.capacity.daysRemaining')}
                        </p>
                    )}
                </div>

                <div className="p-6 bg-dark-50/50 dark:bg-dark-900/40 rounded-[1.5rem] border border-dark-100 dark:border-dark-800">
                    <h4 className="font-semibold mb-3">{t('admin.overview.capacity.topFiles')}</h4>
                    {topLargeFiles.length ? (
                        <>
                            <div className="space-y-2">
                                {visibleTopFiles.map((f: any) => (
                                    <div key={f.id} className="flex items-center justify-between">
                                        <div className="text-sm">
                                            <div className="font-medium">{f.name}</div>
                                            <div className="text-xs text-dark-500">{f.owner?.email}</div>
                                        </div>
                                        <div className="text-sm text-right">
                                            <div>{formatBytes(Number(f.size))}</div>
                                            <a className="text-xs text-primary-600" href={`/files/${f.id}`}>{t('admin.overview.capacity.viewInExplorer')}</a>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {topLargeFiles.length > listLimit && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="w-full mt-3"
                                    onClick={() => setShowAllTopFiles((prev) => !prev)}
                                >
                                    {showAllTopFiles ? t('admin.overview.showLess') : t('admin.overview.showAll')}
                                </Button>
                            )}
                        </>
                    ) : <div className="text-sm text-dark-500">{t('admin.overview.capacity.noData')}</div>}
                </div>
            </div>

            {/* Row 4: Alerts and Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-6 bg-dark-50/50 dark:bg-dark-900/40 rounded-[1.5rem] border border-dark-100 dark:border-dark-800">
                    <h4 className="font-semibold mb-3">{t('admin.overview.alerts.title')}</h4>
                    {alerts.length ? (
                        <>
                            <div className="space-y-2">
                                {visibleAlerts.map((a: any, idx: number) => (
                                    <div key={idx} className="flex items-center justify-between">
                                        <div>
                                            <div className="text-sm font-medium">{a.message}</div>
                                            <div className="text-xs text-dark-500">{new Date(a.timestamp).toLocaleString()}</div>
                                        </div>
                                        <div className="text-sm">{getStatusMeta(a.severity).label}</div>
                                    </div>
                                ))}
                            </div>
                            {alerts.length > listLimit && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="w-full mt-3"
                                    onClick={() => setShowAllAlerts((prev) => !prev)}
                                >
                                    {showAllAlerts ? t('admin.overview.showLess') : t('admin.overview.showAll')}
                                </Button>
                            )}
                        </>
                    ) : <div className="text-sm text-dark-500">{t('admin.overview.alerts.noAlerts')}</div>}
                </div>

                <div className="p-6 bg-dark-50/50 dark:bg-dark-900/40 rounded-[1.5rem] border border-dark-100 dark:border-dark-800">
                    <h4 className="font-semibold mb-3">{t('admin.overview.actions.title')}</h4>
                    <div className="flex flex-col gap-2">
                        <Button onClick={() => setShowSmtpModal(true)} loading={loadingSmtp}>
                            <Mail className="w-4 h-4 mr-2" />
                            {t('admin.overview.actions.testSmtp')}
                        </Button>
                        <Button variant="outline" onClick={handleReindex} loading={loadingReindex}>
                            <FileSearch className="w-4 h-4 mr-2" />
                            {t('admin.overview.actions.forceReindex')}
                        </Button>
                        <Button variant="outline" onClick={handleRegenerateThumbnails} loading={loadingThumbnails}>
                            <Image className="w-4 h-4 mr-2" />
                            {t('admin.overview.actions.regenerateThumbnails')}
                        </Button>
                        <Button variant="ghost" onClick={handleToggleMaintenance} loading={loadingMaintenance}>
                            <Wrench className="w-4 h-4 mr-2" />
                            {maintenanceMode
                                ? t('admin.overview.actions.disableMaintenance')
                                : t('admin.overview.actions.enableMaintenance')
                            }
                        </Button>
                        {summary?.health?.jobs?.details?.transcoding?.failed > 0 && (
                            <Button variant="ghost" onClick={handleRetryJobs} loading={loadingRetryJobs}>
                                <Activity className="w-4 h-4 mr-2" />
                                {t('admin.overview.alerts.retryJobs', {
                                    count: summary.health.jobs.details.transcoding.failed,
                                })}
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {/* Security compact */}
            <div className="p-6 bg-dark-50/50 dark:bg-dark-900/40 rounded-[1.5rem] border border-dark-100 dark:border-dark-800">
                <h4 className="font-semibold mb-3">{t('admin.overview.security.title')}</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <p className="text-sm text-dark-500">{t('admin.overview.security.logins24h')}</p>
                        <p className="text-xl font-bold">{summary?.security?.logins?.success ?? 0}</p>
                    </div>
                    <div>
                        <p className="text-sm text-dark-500">{t('admin.overview.security.failed24h')}</p>
                        <p className="text-xl font-bold text-red-600">{summary?.security?.logins?.failed ?? 0}</p>
                    </div>
                    <div>
                        <p className="text-sm text-dark-500">{t('admin.overview.security.topFailIps')}</p>
                        {topFailIps.length ? (
                            <>
                                <div className="text-sm space-y-1">
                                    {visibleFailIps.map((ip: any) => <div key={ip.ip}>{ip.ip} ({ip.count})</div>)}
                                </div>
                                {topFailIps.length > listLimit && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="w-full mt-2"
                                        onClick={() => setShowAllFailIps((prev) => !prev)}
                                    >
                                        {showAllFailIps ? t('admin.overview.showLess') : t('admin.overview.showAll')}
                                    </Button>
                                )}
                            </>
                        ) : <div className="text-sm text-dark-500">{t('admin.overview.capacity.noData')}</div>}
                    </div>
                </div>
            </div>
        </div>
    );
}



