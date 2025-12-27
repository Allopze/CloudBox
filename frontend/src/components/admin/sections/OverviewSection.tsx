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

function StatusBadge({ status }: { status: string }) {
    const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium';
    if (!status) return <span className={`${base} bg-dark-100 text-dark-700`}>Desconocido</span>;
    if (status === 'OK' || status === 'healthy' || status === 'CONFIGURED') return <span className={`${base} bg-green-50 text-green-600`}>OK</span>;
    if (status === 'ALERT' || status === 'ATASCADA' || status === 'ALERTA') return <span className={`${base} bg-yellow-50 text-yellow-700`}>Alerta</span>;
    if (status === 'CRITICAL' || status === 'CAÍDO' || status === 'DOWN') return <span className={`${base} bg-red-50 text-red-600`}>Crítico</span>;
    return <span className={`${base} bg-dark-100 text-dark-700`}>{status}</span>;
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

    const lastUpdated = summary?.generatedAt ? new Date(summary.generatedAt) : null;

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
                toast(t('admin.overview.exportNotReady', 'El diagnóstico aún no está listo. Inténtalo de nuevo en unos segundos.'), 'warning');
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
            toast(t('admin.overview.exportSuccess', 'Diagnóstico exportado correctamente'), 'success');
        } catch (err) {
            console.error('Export failed', err);
            toast(t('admin.overview.exportError', 'Error al exportar diagnóstico'), 'error');
        } finally {
            setLoadingExport(false);
        }
    };

    // Quick Actions handlers
    const handleTestSmtp = async () => {
        if (!testEmail) {
            toast(t('admin.overview.emailRequired', 'Ingresa un email de prueba'), 'warning');
            return;
        }
        try {
            setLoadingSmtp(true);
            const res = await api.post('/admin/summary/actions/test-smtp', { email: testEmail });
            if (res.data.success) {
                toast(t('admin.overview.smtpSuccess', 'Email de prueba enviado correctamente'), 'success');
                setShowSmtpModal(false);
                setTestEmail('');
            } else {
                toast(res.data.message || t('admin.overview.smtpError', 'Error al enviar email'), 'error');
            }
        } catch (err: any) {
            console.error('SMTP test failed', err);
            toast(err.response?.data?.message || t('admin.overview.smtpError', 'Error al probar SMTP'), 'error');
        } finally {
            setLoadingSmtp(false);
        }
    };

    const handleReindex = async () => {
        try {
            setLoadingReindex(true);
            const res = await api.post('/admin/summary/actions/reindex');
            if (res.data.success) {
                toast(t('admin.overview.reindexSuccess', `${res.data.count} archivos reindexados`), 'success');
            } else {
                toast(res.data.message || t('admin.overview.reindexError', 'Error al reindexar'), 'error');
            }
        } catch (err: any) {
            console.error('Reindex failed', err);
            toast(err.response?.data?.message || t('admin.overview.reindexError', 'Error al reindexar archivos'), 'error');
        } finally {
            setLoadingReindex(false);
        }
    };

    const handleRegenerateThumbnails = async () => {
        try {
            setLoadingThumbnails(true);
            const res = await api.post('/admin/summary/actions/regenerate-thumbnails');
            if (res.data.success) {
                toast(t('admin.overview.thumbnailsSuccess', `${res.data.images} imágenes, ${res.data.videos} videos en cola`), 'success');
            } else {
                toast(res.data.message || t('admin.overview.thumbnailsError', 'Error al regenerar thumbnails'), 'error');
            }
        } catch (err: any) {
            console.error('Regenerate thumbnails failed', err);
            toast(err.response?.data?.message || t('admin.overview.thumbnailsError', 'Error al regenerar thumbnails'), 'error');
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
                toast(res.data.message || t('admin.overview.maintenanceError', 'Error al cambiar modo mantenimiento'), 'error');
            }
        } catch (err: any) {
            console.error('Toggle maintenance failed', err);
            toast(err.response?.data?.message || t('admin.overview.maintenanceError', 'Error al cambiar modo mantenimiento'), 'error');
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
                toast(res.data.message || t('admin.overview.retryJobsError', 'Error al reintentar jobs'), 'error');
            }
        } catch (err: any) {
            console.error('Retry jobs failed', err);
            toast(err.response?.data?.message || t('admin.overview.retryJobsError', 'Error al reintentar jobs'), 'error');
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
                        <h3 className="text-lg font-semibold mb-4">{t('admin.overview.testSmtpTitle', 'Probar configuración SMTP')}</h3>
                        <p className="text-sm text-dark-500 mb-4">{t('admin.overview.testSmtpDesc', 'Ingresa un email para recibir un mensaje de prueba')}</p>
                        <input
                            type="email"
                            value={testEmail}
                            onChange={(e) => setTestEmail(e.target.value)}
                            placeholder="email@ejemplo.com"
                            className="w-full px-4 py-2 rounded-xl border border-dark-200 dark:border-dark-700 bg-white dark:bg-dark-800 mb-4"
                        />
                        <div className="flex gap-3 justify-end">
                            <Button variant="ghost" onClick={() => setShowSmtpModal(false)}>
                                {t('common.cancel', 'Cancelar')}
                            </Button>
                            <Button onClick={handleTestSmtp} loading={loadingSmtp}>
                                <Mail className="w-4 h-4 mr-2" />
                                {t('admin.overview.sendTest', 'Enviar prueba')}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex items-start justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-dark-900 dark:text-white">{t('admin.overview.title', 'Resumen')}</h2>
                    <p className="text-dark-500 dark:text-dark-400 mt-1">{t('admin.overview.subtitle', 'Estado actual del sistema y métricas clave.')}</p>
                    {lastUpdated && (
                        <p className="text-sm text-dark-500 mt-2">Actualizado: {new Date(lastUpdated).toLocaleString()}</p>
                    )}
                </div>
                <div className="flex gap-3">
                    <Button variant="outline" size="sm" onClick={handleRefresh} loading={refreshing}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Actualizar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleExport} loading={loadingExport}>Exportar diagnóstico</Button>
                </div>
            </div>

            {/* Row 1: Health */}
            <div className="p-6 bg-dark-50/50 dark:bg-dark-900/40 rounded-[1.5rem] border border-dark-100 dark:border-dark-800">
                <h3 className="text-lg font-semibold mb-4">Salud del sistema</h3>
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-md bg-blue-50 flex items-center justify-center text-blue-600"><ServerCog className="w-4 h-4" /></div>
                            <div>
                                <p className="text-sm font-medium text-dark-700">API CloudBox</p>
                                <p className="text-sm text-dark-500">Estado del endpoint</p>
                            </div>
                        </div>
                        <StatusBadge status={summary?.health?.api?.status || 'OK'} />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-md bg-indigo-50 flex items-center justify-center text-indigo-600"><HardDrive className="w-4 h-4" /></div>
                            <div>
                                <p className="text-sm font-medium text-dark-700">Base de datos</p>
                                <p className="text-sm text-dark-500">Latencia: {summary?.health?.db?.latencyMs ? `${summary.health.db.latencyMs}ms` : 'N/A'}</p>
                            </div>
                        </div>
                        <StatusBadge status={summary?.health?.db?.status || 'OK'} />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-md bg-purple-50 flex items-center justify-center text-purple-600"><HardDrive className="w-4 h-4" /></div>
                            <div>
                                <p className="text-sm font-medium text-dark-700">Almacenamiento</p>
                                <p className="text-sm text-dark-500">Usado / Total: {summary?.health?.storage ? `${formatBytes(Number(summary.health.storage.usedBytes || 0))} / ${summary.health.storage.totalQuota ? formatBytes(Number(summary.health.storage.totalQuota)) : 'N/A'}` : 'N/A'}</p>
                            </div>
                        </div>
                        <StatusBadge status={summary?.health?.storage?.status || 'OK'} />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-md bg-yellow-50 flex items-center justify-center text-yellow-600"><AlertCircle className="w-4 h-4" /></div>
                            <div>
                                <p className="text-sm font-medium text-dark-700">Cola de jobs</p>
                                <p className="text-sm text-dark-500">Pendientes: {summary?.health?.jobs?.details?.transcoding?.waiting ?? 'N/A'}</p>
                            </div>
                        </div>
                        <StatusBadge status={summary?.health?.jobs?.status || 'OK'} />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-md bg-gray-50 flex items-center justify-center text-gray-600"><Mail className="w-4 h-4" /></div>
                            <div>
                                <p className="text-sm font-medium text-dark-700">SMTP</p>
                                <p className="text-sm text-dark-500">{summary?.health?.smtp?.status || 'Desconocido'}</p>
                            </div>
                        </div>
                        <StatusBadge status={summary?.health?.smtp?.status || 'UNKNOWN'} />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-md bg-gray-50 flex items-center justify-center text-gray-600"><ServerCog className="w-4 h-4" /></div>
                            <div>
                                <p className="text-sm font-medium text-dark-700">Versión desplegada</p>
                                <p className="text-sm text-dark-500">{summary?.health?.version?.version || 'N/A'} {summary?.health?.version?.migrationsPending ? '(migraciones pendientes)' : ''}</p>
                            </div>
                        </div>
                        <StatusBadge status={summary?.health?.api?.status || 'OK'} />
                    </div>
                </div>
            </div>

            {/* Row 2: Metrics tiles */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="flex flex-col p-6 bg-dark-50/50 dark:bg-dark-900/40 rounded-[1.5rem] border border-dark-100 dark:border-dark-800">
                    <p className="text-sm font-medium text-dark-500">Usuarios totales</p>
                    <p className="text-3xl font-bold text-dark-900 dark:text-white mt-2">{summary?.metrics?.users?.total ?? '—'}</p>
                    <p className="text-sm text-dark-500 mt-1">Activos 24h: {summary?.metrics?.users?.active24 ?? '—'}</p>
                </div>

                <div className="flex flex-col p-6 bg-dark-50/50 dark:bg-dark-900/40 rounded-[1.5rem] border border-dark-100 dark:border-dark-800">
                    <p className="text-sm font-medium text-dark-500">Nuevos</p>
                    <p className="text-3xl font-bold text-dark-900 dark:text-white mt-2">Hoy: {summary?.metrics?.users?.newToday ?? '—'}</p>
                    <p className="text-sm text-dark-500 mt-1">Semana: {summary?.metrics?.users?.newWeek ?? '—'}</p>
                </div>

                <div className="flex flex-col p-6 bg-dark-50/50 dark:bg-dark-900/40 rounded-[1.5rem] border border-dark-100 dark:border-dark-800">
                    <p className="text-sm font-medium text-dark-500">Subidas (24h)</p>
                    <p className="text-3xl font-bold text-dark-900 dark:text-white mt-2">{summary?.metrics?.uploads?.count24h ?? '—'}</p>
                    <p className="text-sm text-dark-500 mt-1">{summary?.metrics?.uploads?.bytes24h ? formatBytes(Number(summary.metrics.uploads.bytes24h)) : ''}</p>
                </div>

                <div className="flex flex-col p-6 bg-dark-50/50 dark:bg-dark-900/40 rounded-[1.5rem] border border-dark-100 dark:border-dark-800">
                    <p className="text-sm font-medium text-dark-500">Descargas (24h)</p>
                    <p className="text-3xl font-bold text-dark-900 dark:text-white mt-2">{summary?.metrics?.downloads?.count24h ?? '—'}</p>
                </div>
            </div>

            {/* Row 3: Capacity and Top files */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="col-span-2 p-6 bg-dark-50/50 dark:bg-dark-900/40 rounded-[1.5rem] border border-dark-100 dark:border-dark-800">
                    <h4 className="font-semibold mb-3">Uso de disco (últimos 7 días)</h4>
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
                    ) : <div className="text-sm text-dark-500">No hay datos.</div>}
                    {summary?.capacity?.projectionDays != null && (
                        <p className="text-sm text-dark-500 mt-3">Proyección: ~{summary?.capacity?.projectionDays} días restantes (estimado)</p>
                    )}
                </div>

                <div className="p-6 bg-dark-50/50 dark:bg-dark-900/40 rounded-[1.5rem] border border-dark-100 dark:border-dark-800">
                    <h4 className="font-semibold mb-3">Top 10 archivos grandes</h4>
                    <div className="space-y-2">
                        {summary?.capacity?.topLargeFiles?.length ? summary.capacity.topLargeFiles.map((f: any) => (
                            <div key={f.id} className="flex items-center justify-between">
                                <div className="text-sm">
                                    <div className="font-medium">{f.name}</div>
                                    <div className="text-xs text-dark-500">{f.owner?.email}</div>
                                </div>
                                <div className="text-sm text-right">
                                    <div>{formatBytes(Number(f.size))}</div>
                                    <a className="text-xs text-primary-600" href={`/files/${f.id}`}>Ver en explorador</a>
                                </div>
                            </div>
                        )) : <div className="text-sm text-dark-500">No hay archivos.</div>}
                    </div>
                </div>
            </div>

            {/* Row 4: Alerts and Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-6 bg-dark-50/50 dark:bg-dark-900/40 rounded-[1.5rem] border border-dark-100 dark:border-dark-800">
                    <h4 className="font-semibold mb-3">Alertas</h4>
                    <div className="space-y-2">
                        {summary?.alerts?.length ? summary.alerts.map((a: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between">
                                <div>
                                    <div className="text-sm font-medium">{a.message}</div>
                                    <div className="text-xs text-dark-500">{new Date(a.timestamp).toLocaleString()}</div>
                                </div>
                                <div className="text-sm">{a.severity}</div>
                            </div>
                        )) : <div className="text-sm text-dark-500">Sin alertas</div>}
                    </div>
                </div>

                <div className="p-6 bg-dark-50/50 dark:bg-dark-900/40 rounded-[1.5rem] border border-dark-100 dark:border-dark-800">
                    <h4 className="font-semibold mb-3">{t('admin.overview.quickActions', 'Acciones rápidas')}</h4>
                    <div className="flex flex-col gap-2">
                        <Button onClick={() => setShowSmtpModal(true)} loading={loadingSmtp}>
                            <Mail className="w-4 h-4 mr-2" />
                            {t('admin.overview.testSmtp', 'Probar SMTP')}
                        </Button>
                        <Button variant="outline" onClick={handleReindex} loading={loadingReindex}>
                            <FileSearch className="w-4 h-4 mr-2" />
                            {t('admin.overview.reindex', 'Forzar reindex')}
                        </Button>
                        <Button variant="outline" onClick={handleRegenerateThumbnails} loading={loadingThumbnails}>
                            <Image className="w-4 h-4 mr-2" />
                            {t('admin.overview.regenerateThumbnails', 'Regenerar thumbnails')}
                        </Button>
                        <Button variant="ghost" onClick={handleToggleMaintenance} loading={loadingMaintenance}>
                            <Wrench className="w-4 h-4 mr-2" />
                            {maintenanceMode
                                ? t('admin.overview.disableMaintenance', 'Desactivar modo mantenimiento')
                                : t('admin.overview.enableMaintenance', 'Activar modo mantenimiento')
                            }
                        </Button>
                        {summary?.health?.jobs?.details?.transcoding?.failed > 0 && (
                            <Button variant="ghost" onClick={handleRetryJobs} loading={loadingRetryJobs}>
                                <Activity className="w-4 h-4 mr-2" />
                                {t('admin.overview.retryJobs', `Reintentar ${summary.health.jobs.details.transcoding.failed} jobs fallidos`)}
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {/* Security compact */}
            <div className="p-6 bg-dark-50/50 dark:bg-dark-900/40 rounded-[1.5rem] border border-dark-100 dark:border-dark-800">
                <h4 className="font-semibold mb-3">Seguridad y acceso</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <p className="text-sm text-dark-500">Inicios (24h)</p>
                        <p className="text-xl font-bold">{summary?.security?.logins?.success ?? 0}</p>
                    </div>
                    <div>
                        <p className="text-sm text-dark-500">Fallidos (24h)</p>
                        <p className="text-xl font-bold text-red-600">{summary?.security?.logins?.failed ?? 0}</p>
                    </div>
                    <div>
                        <p className="text-sm text-dark-500">IPs con más fallos</p>
                        <div className="text-sm">
                            {summary?.security?.topFailIps?.map((ip: any) => <div key={ip.ip}>{ip.ip} ({ip.count})</div>)}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}


