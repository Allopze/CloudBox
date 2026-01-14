import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../../lib/api';
import { formatBytes } from '../../../lib/utils';
import {
    Cpu,
    HardDrive,
    MemoryStick,
    Thermometer,
    ArrowDown,
    ArrowUp,
    Clock,
    Server,
    RefreshCw,
    Activity
} from 'lucide-react';
import Button from '../../ui/Button';

interface DiskInfo {
    mount: string;
    fs: string;
    type: string;
    size: number;
    used: number;
    available: number;
    percentage: number;
}

interface NetworkInfo {
    iface: string;
    rx_sec: number;
    tx_sec: number;
    rx_total: number;
    tx_total: number;
}

interface SystemMetrics {
    cpu: {
        usage: number;
        cores: number;
        perCore: number[];
    };
    memory: {
        total: number;
        used: number;
        free: number;
        available: number;
        percentage: number;
        swap: {
            total: number;
            used: number;
            percentage: number;
        };
    };
    disk: DiskInfo[];
    temperature: {
        main: number | null;
        max: number | null;
        cores: number[];
        chipset: number | null;
    };
    network: NetworkInfo[];
    os: {
        platform: string;
        distro: string;
        release: string;
        arch: string;
        hostname: string;
        kernel: string;
    };
    uptime: number;
    timestamp: number;
}

// Circular gauge component for CPU usage
function CircularGauge({ value, label, color = 'primary' }: { value: number; label: string; color?: string }) {
    const circumference = 2 * Math.PI * 36; // radius = 36
    const offset = circumference - (value / 100) * circumference;

    const colorClasses: Record<string, string> = {
        primary: 'text-primary-500',
        green: 'text-green-500',
        yellow: 'text-yellow-500',
        red: 'text-red-500',
    };

    // Determine color based on value threshold
    let dynamicColor = 'primary';
    if (value > 90) dynamicColor = 'red';
    else if (value > 70) dynamicColor = 'yellow';
    else if (value > 50) dynamicColor = 'green';

    return (
        <div className="flex flex-col items-center">
            <div className="relative w-20 h-20">
                <svg className="w-20 h-20 transform -rotate-90">
                    <circle
                        cx="40"
                        cy="40"
                        r="36"
                        stroke="currentColor"
                        strokeWidth="6"
                        fill="none"
                        className="text-dark-200 dark:text-dark-700"
                    />
                    <circle
                        cx="40"
                        cy="40"
                        r="36"
                        stroke="currentColor"
                        strokeWidth="6"
                        fill="none"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        strokeLinecap="round"
                        className={`${colorClasses[color] || colorClasses[dynamicColor]} transition-all duration-500`}
                    />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-bold text-dark-900 dark:text-white">{Math.round(value)}%</span>
                </div>
            </div>
            <span className="mt-2 text-sm font-medium text-dark-600 dark:text-dark-400">{label}</span>
        </div>
    );
}

// Progress bar component for memory/disk
function ProgressBar({
    value,
    label,
    used,
    total,
    available,
}: {
    value: number;
    label: string;
    used: number;
    total: number;
    available?: number;
}) {
    const { t } = useTranslation();
    const usedPercent = Number.isFinite(value) ? Math.min(Math.max(value, 0), 100) : 0;
    const freePercent = Math.min(Math.max(100 - usedPercent, 0), 100);
    const freeBytes = Math.max(available ?? (total - used), 0);

    let tone: 'green' | 'yellow' | 'red' = 'green';
    if (freePercent <= 10) tone = 'red';
    else if (freePercent <= 25) tone = 'yellow';

    const toneClasses = {
        green: 'bg-green-500',
        yellow: 'bg-yellow-500',
        red: 'bg-red-500',
    } as const;

    const toneTextClasses = {
        green: 'text-green-600 dark:text-green-400',
        yellow: 'text-yellow-600 dark:text-yellow-400',
        red: 'text-red-600 dark:text-red-400',
    } as const;

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-dark-700 dark:text-dark-300">{label}</span>
                <span className="text-dark-500 dark:text-dark-400">
                    {t('admin.metrics.used')}: {formatBytes(used)} / {formatBytes(total)}
                </span>
            </div>
            <div className="h-3 bg-dark-200 dark:bg-dark-700 rounded-full overflow-hidden">
                <div
                    className={`h-full ${toneClasses[tone]} transition-all duration-500 rounded-full`}
                    style={{ width: `${usedPercent}%` }}
                />
            </div>
            <div className="flex items-center justify-between text-xs">
                <span className={`flex items-center gap-2 ${toneTextClasses[tone]}`}>
                    <span className={`inline-block h-2 w-2 rounded-full ${toneClasses[tone]}`} />
                    {t('admin.metrics.free')}: {formatBytes(freeBytes)} ({Math.round(freePercent)}%)
                </span>
                <span className="text-dark-500 dark:text-dark-400">
                    {t('admin.metrics.used')}: {Math.round(usedPercent)}%
                </span>
            </div>
        </div>
    );
}

// Format uptime in human readable format
function formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);

    return parts.join(' ');
}

export default function ServerMetricsPanel() {
    const { t } = useTranslation();
    const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
    const [autoRefresh, setAutoRefresh] = useState(true);

    const fetchMetrics = useCallback(async () => {
        try {
            const response = await api.get('/admin/metrics');
            setMetrics(response.data);
            setLastUpdate(new Date());
            setError(null);
        } catch (err: any) {
            console.error('Failed to fetch metrics:', err);
            setError(err.response?.data?.error || 'Failed to fetch metrics');
        } finally {
            setLoading(false);
        }
    }, []);

    // Initial fetch and auto-refresh
    useEffect(() => {
        fetchMetrics();

        if (!autoRefresh) return;

        const interval = setInterval(() => {
            fetchMetrics();
        }, 3000); // Refresh every 3 seconds

        return () => clearInterval(interval);
    }, [fetchMetrics, autoRefresh]);

    if (loading && !metrics) {
        return (
            <div className="bg-white dark:bg-dark-800 rounded-2xl border border-dark-100 dark:border-dark-700 p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                    <Activity className="w-5 h-5 text-primary-600 animate-pulse" />
                    <h3 className="text-lg font-semibold text-dark-900 dark:text-white">
                        {t('admin.metrics.title')}
                    </h3>
                </div>
                <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                    <span className="ml-3 text-dark-500">{t('admin.metrics.refreshing')}</span>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-white dark:bg-dark-800 rounded-2xl border border-dark-100 dark:border-dark-700 p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                    <Activity className="w-5 h-5 text-red-500" />
                    <h3 className="text-lg font-semibold text-dark-900 dark:text-white">
                        {t('admin.metrics.title')}
                    </h3>
                </div>
                <div className="text-center py-8">
                    <p className="text-red-500 mb-4">{error}</p>
                    <Button variant="secondary" onClick={fetchMetrics}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        {t('common.retry')}
                    </Button>
                </div>
            </div>
        );
    }

    if (!metrics) return null;

    return (
        <div className="bg-white dark:bg-dark-800 rounded-2xl border border-dark-100 dark:border-dark-700 p-6 shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-primary-600" />
                    <h3 className="text-lg font-semibold text-dark-900 dark:text-white">
                        {t('admin.metrics.title')}
                    </h3>
                </div>
                <div className="flex items-center gap-3">
                    {lastUpdate && (
                        <span className="text-xs text-dark-500">
                            {t('admin.metrics.lastUpdate')}: {lastUpdate.toLocaleTimeString()}
                        </span>
                    )}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        className={autoRefresh ? 'text-primary-600' : 'text-dark-400'}
                    >
                        <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} style={{ animationDuration: '3s' }} />
                    </Button>
                </div>
            </div>

            {/* Main metrics grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* CPU Gauge */}
                <div className="flex flex-col items-center p-4 bg-dark-50 dark:bg-dark-900/50 rounded-xl">
                    <div className="flex items-center gap-2 mb-3">
                        <Cpu className="w-4 h-4 text-primary-600" />
                        <span className="font-medium text-dark-700 dark:text-dark-300">
                            {t('admin.metrics.cpu')}
                        </span>
                    </div>
                    <CircularGauge value={metrics.cpu.usage} label={`${metrics.cpu.cores} cores`} />
                </div>

                {/* Memory */}
                <div className="p-4 bg-dark-50 dark:bg-dark-900/50 rounded-xl">
                    <div className="flex items-center gap-2 mb-3">
                        <MemoryStick className="w-4 h-4 text-blue-500" />
                        <span className="font-medium text-dark-700 dark:text-dark-300">
                            {t('admin.metrics.memory')}
                        </span>
                    </div>
                    <ProgressBar
                        value={metrics.memory.percentage}
                        label={t('admin.metrics.ram')}
                        used={metrics.memory.used}
                        total={metrics.memory.total}
                        available={metrics.memory.available}
                    />
                    {metrics.memory.swap.total > 0 && (
                        <div className="mt-3">
                            <ProgressBar
                                value={metrics.memory.swap.percentage}
                                label={t('admin.metrics.swap')}
                                used={metrics.memory.swap.used}
                                total={metrics.memory.swap.total}
                            />
                        </div>
                    )}
                </div>

                {/* Temperature */}
                <div className="p-4 bg-dark-50 dark:bg-dark-900/50 rounded-xl">
                    <div className="flex items-center gap-2 mb-3">
                        <Thermometer className="w-4 h-4 text-orange-500" />
                        <span className="font-medium text-dark-700 dark:text-dark-300">
                            {t('admin.metrics.temperature')}
                        </span>
                    </div>
                    {metrics.temperature.main !== null ? (
                        <div className="text-center">
                            <div className="text-3xl font-bold text-dark-900 dark:text-white">
                                {metrics.temperature.main}°C
                            </div>
                            {metrics.temperature.max !== null && (
                                <div className="text-sm text-dark-500 mt-1">
                                    Max: {metrics.temperature.max}°C
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-center text-dark-400 py-4">
                            {t('admin.metrics.noData')}
                        </div>
                    )}
                </div>

                {/* Uptime & OS */}
                <div className="p-4 bg-dark-50 dark:bg-dark-900/50 rounded-xl">
                    <div className="flex items-center gap-2 mb-3">
                        <Clock className="w-4 h-4 text-green-500" />
                        <span className="font-medium text-dark-700 dark:text-dark-300">
                            {t('admin.metrics.uptime')}
                        </span>
                    </div>
                    <div className="text-center">
                        <div className="text-2xl font-bold text-dark-900 dark:text-white">
                            {formatUptime(metrics.uptime)}
                        </div>
                        <div className="flex items-center justify-center gap-1 mt-2 text-sm text-dark-500">
                            <Server className="w-3 h-3" />
                            <span>{metrics.os.hostname}</span>
                        </div>
                        <div className="text-xs text-dark-400 mt-1">
                            {metrics.os.distro || metrics.os.platform} ({metrics.os.arch})
                        </div>
                    </div>
                </div>
            </div>

            {/* Disk and Network */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                {/* Disk Usage */}
                <div className="p-4 bg-dark-50 dark:bg-dark-900/50 rounded-xl">
                    <div className="flex items-center gap-2 mb-4">
                        <HardDrive className="w-4 h-4 text-purple-500" />
                        <span className="font-medium text-dark-700 dark:text-dark-300">
                            {t('admin.metrics.disk')}
                        </span>
                    </div>
                    <div className="space-y-4">
                        {metrics.disk.slice(0, 4).map((disk, index) => (
                            <ProgressBar
                                key={index}
                                value={disk.percentage}
                                label={disk.mount}
                                used={disk.used}
                                total={disk.size}
                                available={disk.available}
                            />
                        ))}
                    </div>
                </div>

                {/* Network I/O */}
                <div className="p-4 bg-dark-50 dark:bg-dark-900/50 rounded-xl">
                    <div className="flex items-center gap-2 mb-4">
                        <Activity className="w-4 h-4 text-cyan-500" />
                        <span className="font-medium text-dark-700 dark:text-dark-300">
                            {t('admin.metrics.network')}
                        </span>
                    </div>
                    {metrics.network.length > 0 ? (
                        <div className="space-y-3">
                            {metrics.network.slice(0, 3).map((net, index) => (
                                <div key={index} className="flex items-center justify-between p-2 bg-white dark:bg-dark-800 rounded-lg">
                                    <span className="text-sm font-mono text-dark-600 dark:text-dark-400">{net.iface}</span>
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-1 text-green-500">
                                            <ArrowDown className="w-3 h-3" />
                                            <span className="text-xs">{formatBytes(net.rx_sec)}/s</span>
                                        </div>
                                        <div className="flex items-center gap-1 text-blue-500">
                                            <ArrowUp className="w-3 h-3" />
                                            <span className="text-xs">{formatBytes(net.tx_sec)}/s</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center text-dark-400 py-4">
                            {t('admin.metrics.noData')}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
