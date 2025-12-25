import { Users, FileText, HardDrive, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatBytes } from '../../../lib/utils';

interface AdminStats {
    totalUsers: number;
    totalFiles: number;
    totalStorage: number;
    activeUsers: number;
}

interface OverviewSectionProps {
    stats: AdminStats | null;
}

export default function OverviewSection({ stats }: OverviewSectionProps) {
    const { t } = useTranslation();

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-dark-900 dark:text-white">
                    {t('admin.overview.title', 'Resumen General')}
                </h2>
                <p className="text-dark-500 dark:text-dark-400 mt-1">
                    {t('admin.overview.subtitle', 'Estado actual del sistema y métricas clave.')}
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="flex flex-col p-6 bg-dark-50/50 dark:bg-dark-900/40 rounded-[1.5rem] border border-dark-100 dark:border-dark-800 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110 duration-500">
                        <Users className="w-24 h-24" />
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mb-4 text-blue-600 dark:text-blue-400">
                        <Users className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-medium text-dark-500 dark:text-dark-400">{t('admin.overview.totalUsers')}</p>
                    <p className="text-3xl font-bold text-dark-900 dark:text-white mt-1">
                        {stats?.totalUsers || 0}
                    </p>
                </div>

                <div className="flex flex-col p-6 bg-dark-50/50 dark:bg-dark-900/40 rounded-[1.5rem] border border-dark-100 dark:border-dark-800 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110 duration-500">
                        <FileText className="w-24 h-24" />
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-green-50 dark:bg-green-900/20 flex items-center justify-center mb-4 text-green-600 dark:text-green-400">
                        <FileText className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-medium text-dark-500 dark:text-dark-400">{t('admin.overview.totalFiles')}</p>
                    <p className="text-3xl font-bold text-dark-900 dark:text-white mt-1">
                        {stats?.totalFiles || 0}
                    </p>
                </div>

                <div className="flex flex-col p-6 bg-dark-50/50 dark:bg-dark-900/40 rounded-[1.5rem] border border-dark-100 dark:border-dark-800 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110 duration-500">
                        <HardDrive className="w-24 h-24" />
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center mb-4 text-purple-600 dark:text-purple-400">
                        <HardDrive className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-medium text-dark-500 dark:text-dark-400">{t('admin.overview.storageUsed')}</p>
                    <p className="text-3xl font-bold text-dark-900 dark:text-white mt-1">
                        {formatBytes(stats?.totalStorage || 0)}
                    </p>
                </div>

                <div className="flex flex-col p-6 bg-dark-50/50 dark:bg-dark-900/40 rounded-[1.5rem] border border-dark-100 dark:border-dark-800 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110 duration-500">
                        <TrendingUp className="w-24 h-24" />
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center mb-4 text-orange-600 dark:text-orange-400">
                        <TrendingUp className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-medium text-dark-500 dark:text-dark-400">{t('admin.overview.activeUsers')}</p>
                    <p className="text-3xl font-bold text-dark-900 dark:text-white mt-1">
                        {stats?.activeUsers || 0}
                    </p>
                </div>
            </div>
        </div>
    );
}
