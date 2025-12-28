import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Play, Trash2, Clock, CheckCircle, XCircle, AlertCircle, Pause, Database, Ban } from 'lucide-react';
import Button from '../../ui/Button';
import { api } from '../../../lib/api';
import { toast } from '../../ui/Toast';

interface QueueStats {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
    isRedisAvailable: boolean;
    dbStats: {
        pending: number;
        processing: number;
        completed: number;
        failed: number;
        cancelled: number;
    };
}

export default function QueuesSection() {
    const { t } = useTranslation();
    const [stats, setStats] = useState<QueueStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [retrying, setRetrying] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [cleaning, setCleaning] = useState(false);
    const [cancelling, setCancelling] = useState(false);

    const fetchStats = async (showLoading = true) => {
        try {
            if (showLoading) setLoading(true);
            const res = await api.get('/admin/queues/stats');
            setStats(res.data);
        } catch (err) {
            console.error('Failed to fetch queue stats', err);
            toast(t('admin.queues.fetchError', 'Error al obtener estadísticas'), 'error');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchStats();
        // Auto-refresh every 30 seconds
        const interval = setInterval(() => fetchStats(false), 30000);
        return () => clearInterval(interval);
    }, []);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchStats(false);
    };

    const handleRetryFailed = async () => {
        try {
            setRetrying(true);
            const res = await api.post('/admin/queues/retry-failed');
            toast(t('admin.queues.retrySuccess', 'Se reintentaron {{count}} jobs', { count: res.data.count }), 'success');
            fetchStats(false);
        } catch (err) {
            console.error('Retry failed', err);
            toast(t('admin.queues.retryError', 'Error al reintentar jobs'), 'error');
        } finally {
            setRetrying(false);
        }
    };

    const handleClearStalled = async () => {
        try {
            setClearing(true);
            const res = await api.post('/admin/queues/clear-stalled');
            toast(t('admin.queues.clearSuccess', 'Se limpiaron {{count}} jobs atascados', { count: res.data.count }), 'success');
            fetchStats(false);
        } catch (err) {
            console.error('Clear failed', err);
            toast(t('admin.queues.clearError', 'Error al limpiar jobs'), 'error');
        } finally {
            setClearing(false);
        }
    };

    const handleCleanup = async () => {
        try {
            setCleaning(true);
            const res = await api.post('/admin/queues/cleanup');
            toast(t('admin.queues.cleanupSuccess', 'Limpieza completada: {{failed}} fallidos, {{old}} antiguos', {
                failed: res.data.failedCount,
                old: res.data.oldCount,
            }), 'success');
            fetchStats(false);
        } catch (err) {
            console.error('Cleanup failed', err);
            toast(t('admin.queues.cleanupError', 'Error en limpieza'), 'error');
        } finally {
            setCleaning(false);
        }
    };

    const handleCancelPending = async () => {
        try {
            setCancelling(true);
            const res = await api.post('/admin/queues/cancel-pending');
            toast(t('admin.queues.cancelSuccess', 'Se cancelaron {{count}} jobs pendientes', { count: res.data.count }), 'success');
            fetchStats(false);
        } catch (err) {
            console.error('Cancel pending failed', err);
            toast(t('admin.queues.cancelError', 'Error al cancelar jobs pendientes'), 'error');
        } finally {
            setCancelling(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <RefreshCw className="w-8 h-8 animate-spin text-primary-500" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-dark-900 dark:text-white">
                        {t('admin.queues.title', 'Colas de Procesamiento')}
                    </h2>
                    <p className="text-dark-500 dark:text-dark-400 mt-1">
                        {t('admin.queues.subtitle', 'Gestiona las colas de transcodificación y thumbnails')}
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={handleRefresh} loading={refreshing}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    {t('admin.queues.refresh', 'Actualizar')}
                </Button>
            </div>

            {/* Redis Status */}
            <div className={`p-4 rounded-xl border ${stats?.isRedisAvailable
                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                }`}>
                <div className="flex items-center gap-3">
                    <Database className={`w-5 h-5 ${stats?.isRedisAvailable ? 'text-green-600' : 'text-yellow-600'}`} />
                    <div>
                        <p className={`font-medium ${stats?.isRedisAvailable ? 'text-green-700 dark:text-green-400' : 'text-yellow-700 dark:text-yellow-400'}`}>
                            {stats?.isRedisAvailable
                                ? t('admin.queues.redisConnected', 'Redis conectado')
                                : t('admin.queues.redisDisconnected', 'Redis no disponible - modo fallback')
                            }
                        </p>
                        <p className="text-sm text-dark-500">
                            {stats?.isRedisAvailable
                                ? t('admin.queues.redisConnectedDesc', 'Las colas Bull están funcionando normalmente')
                                : t('admin.queues.redisDisconnectedDesc', 'Los jobs se procesan localmente sin persistencia')
                            }
                        </p>
                    </div>
                </div>
            </div>

            {/* Bull Queue Stats */}
            {stats?.isRedisAvailable && (
                <div className="p-6 bg-dark-50/50 dark:bg-dark-900/40 rounded-[1.5rem] border border-dark-100 dark:border-dark-800">
                    <h3 className="text-lg font-semibold mb-4">{t('admin.queues.bullStats', 'Cola Bull (Redis)')}</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                        <StatCard
                            icon={Clock}
                            label={t('admin.queues.waiting', 'En espera')}
                            value={stats.waiting}
                            color="blue"
                        />
                        <StatCard
                            icon={Play}
                            label={t('admin.queues.active', 'Activos')}
                            value={stats.active}
                            color="green"
                        />
                        <StatCard
                            icon={CheckCircle}
                            label={t('admin.queues.completed', 'Completados')}
                            value={stats.completed}
                            color="emerald"
                        />
                        <StatCard
                            icon={XCircle}
                            label={t('admin.queues.failed', 'Fallidos')}
                            value={stats.failed}
                            color="red"
                        />
                        <StatCard
                            icon={Pause}
                            label={t('admin.queues.delayed', 'Retrasados')}
                            value={stats.delayed}
                            color="yellow"
                        />
                        <StatCard
                            icon={AlertCircle}
                            label={t('admin.queues.paused', 'Pausados')}
                            value={stats.paused}
                            color="gray"
                        />
                    </div>
                </div>
            )}

            {/* Database Stats */}
            <div className="p-6 bg-dark-50/50 dark:bg-dark-900/40 rounded-[1.5rem] border border-dark-100 dark:border-dark-800">
                <h3 className="text-lg font-semibold mb-4">{t('admin.queues.dbStats', 'Jobs en Base de Datos')}</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    <StatCard
                        icon={Clock}
                        label={t('admin.queues.pending', 'Pendientes')}
                        value={stats?.dbStats.pending || 0}
                        color="blue"
                    />
                    <StatCard
                        icon={Play}
                        label={t('admin.queues.processing', 'Procesando')}
                        value={stats?.dbStats.processing || 0}
                        color="green"
                    />
                    <StatCard
                        icon={CheckCircle}
                        label={t('admin.queues.completed', 'Completados')}
                        value={stats?.dbStats.completed || 0}
                        color="emerald"
                    />
                    <StatCard
                        icon={XCircle}
                        label={t('admin.queues.failed', 'Fallidos')}
                        value={stats?.dbStats.failed || 0}
                        color="red"
                    />
                    <StatCard
                        icon={Trash2}
                        label={t('admin.queues.cancelled', 'Cancelados')}
                        value={stats?.dbStats.cancelled || 0}
                        color="gray"
                    />
                </div>
            </div>

            {/* Actions */}
            <div className="p-6 bg-dark-50/50 dark:bg-dark-900/40 rounded-[1.5rem] border border-dark-100 dark:border-dark-800">
                <h3 className="text-lg font-semibold mb-4">{t('admin.queues.actions', 'Acciones')}</h3>
                <div className="flex flex-wrap gap-3">
                    <Button
                        variant="outline"
                        onClick={handleRetryFailed}
                        loading={retrying}
                        disabled={(stats?.failed || 0) + (stats?.dbStats.failed || 0) === 0}
                    >
                        <Play className="w-4 h-4 mr-2" />
                        {t('admin.queues.retryFailed', 'Reintentar fallidos')}
                        {((stats?.failed || 0) + (stats?.dbStats.failed || 0)) > 0 && (
                            <span className="ml-2 px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full text-xs">
                                {(stats?.failed || 0) + (stats?.dbStats.failed || 0)}
                            </span>
                        )}
                    </Button>

                    <Button
                        variant="outline"
                        onClick={handleClearStalled}
                        loading={clearing}
                    >
                        <AlertCircle className="w-4 h-4 mr-2" />
                        {t('admin.queues.clearStalled', 'Limpiar atascados')}
                    </Button>

                    <Button
                        variant="ghost"
                        onClick={handleCleanup}
                        loading={cleaning}
                    >
                        <Trash2 className="w-4 h-4 mr-2" />
                        {t('admin.queues.cleanup', 'Limpiar antiguos')}
                    </Button>

                    <Button
                        variant="danger"
                        onClick={handleCancelPending}
                        loading={cancelling}
                        disabled={(stats?.dbStats.pending || 0) === 0}
                    >
                        <Ban className="w-4 h-4 mr-2" />
                        {t('admin.queues.cancelPending', 'Cancelar pendientes')}
                        {(stats?.dbStats.pending || 0) > 0 && (
                            <span className="ml-2 px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full text-xs">
                                {stats?.dbStats.pending}
                            </span>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}

interface StatCardProps {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: number;
    color: 'blue' | 'green' | 'emerald' | 'red' | 'yellow' | 'gray';
}

function StatCard({ icon: Icon, label, value, color }: StatCardProps) {
    const colorClasses = {
        blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
        green: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
        emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',
        red: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
        yellow: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400',
        gray: 'bg-dark-100 dark:bg-dark-700 text-dark-600 dark:text-dark-400',
    };

    return (
        <div className="flex flex-col items-center p-4 rounded-xl bg-white dark:bg-dark-800 border border-dark-100 dark:border-dark-700">
            <div className={`w-10 h-10 rounded-lg ${colorClasses[color]} flex items-center justify-center mb-2`}>
                <Icon className="w-5 h-5" />
            </div>
            <p className="text-2xl font-bold text-dark-900 dark:text-white">{value}</p>
            <p className="text-xs text-dark-500 text-center">{label}</p>
        </div>
    );
}
