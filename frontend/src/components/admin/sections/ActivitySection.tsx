import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../../lib/api';
import { Activity, User } from '../../../types';
import Button from '../../ui/Button';
import { Activity as ActivityIcon, ChevronLeft, ChevronRight, Search, User as UserIcon, Settings, Trash2, LogIn, LogOut, Upload, Download } from 'lucide-react';
import { formatDate } from '../../../lib/utils';
import { toast } from '../../ui/Toast';
import ServerMetricsPanel from './ServerMetricsPanel';

interface ActivityWithUser extends Activity {
    user?: User;
    action: string; // The API seems to return 'action' or 'type', frontend uses 'action' in some places and 'type' in others. Logic uses 'type' for icon but 'action' for display? The map uses log.action?
}

export default function ActivitySection() {
    const { t } = useTranslation();

    const [activities, setActivities] = useState<ActivityWithUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalLogs, setTotalLogs] = useState(0);

    // Filters
    const [activitySearch, setActivitySearch] = useState('');
    const [activityTypeFilter, setActivityTypeFilter] = useState('');

    const loadLogs = useCallback(async () => {
        setLoading(true);
        try {
            const response = await api.get('/activity/admin', {
                params: {
                    page: currentPage,
                    limit: 20,
                    search: activitySearch,
                    type: activityTypeFilter,
                },
            });
            setActivities(response.data.activities || []);
            setTotalPages(response.data.pagination?.totalPages ?? 1);
            setTotalLogs(response.data.pagination?.total ?? 0);
        } catch (error: any) {
            // Silently handle 404 - endpoint not implemented yet
            if (error.response?.status === 404) {
                setActivities([]);
                setTotalPages(1);
                setTotalLogs(0);
            } else {
                console.error('Failed to load activity logs', error);
                toast(t('admin.loadError'), 'error');
            }
        } finally {
            setLoading(false);
        }
    }, [currentPage, activitySearch, activityTypeFilter, t]);

    useEffect(() => {
        loadLogs();
    }, [currentPage, activityTypeFilter, loadLogs]);

    const getActivityIcon = (type: string) => {
        switch (type) {
            case 'LOGIN': return <LogIn className="w-4 h-4 text-green-500" />;
            case 'LOGOUT': return <LogOut className="w-4 h-4 text-orange-500" />;
            case 'UPLOAD': return <Upload className="w-4 h-4 text-blue-500" />;
            case 'DOWNLOAD': return <Download className="w-4 h-4 text-purple-500" />;
            case 'DELETE': return <Trash2 className="w-4 h-4 text-red-500" />;
            case 'CREATE_USER': return <UserIcon className="w-4 h-4 text-teal-500" />;
            case 'UPDATE_USER': return <UserIcon className="w-4 h-4 text-yellow-500" />;
            case 'DELETE_USER': return <UserIcon className="w-4 h-4 text-red-500" />;
            case 'UPDATE_SETTINGS': return <Settings className="w-4 h-4 text-gray-500" />;
            default: return <ActivityIcon className="w-4 h-4 text-gray-400" />;
        }
    };

    return (
        <div className="space-y-6">
            {/* Server Metrics Panel */}
            <ServerMetricsPanel />

            {/* Activity Logs Section */}
            <div>
                <h2 className="text-2xl font-bold text-dark-900 dark:text-white">{t('admin.activity.title')}</h2>
                <p className="text-dark-500 dark:text-dark-400 mt-1">{t('admin.activity.description')}</p>
            </div>

            <div className="border border-dark-100 dark:border-dark-700 rounded-2xl overflow-hidden shadow-sm">
                {/* Filters */}
                <div className="p-4 border-b border-dark-100 dark:border-dark-700 flex flex-col sm:flex-row gap-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
                        <input
                            type="text"
                            placeholder={t('admin.activity.searchPlaceholder')}
                            value={activitySearch}
                            onChange={(e) => setActivitySearch(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && loadLogs()} // Search on Enter
                            className="w-full pl-9 pr-4 py-2 bg-dark-50 dark:bg-dark-900 border border-dark-200 dark:border-dark-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                    </div>
                    <select
                        value={activityTypeFilter}
                        onChange={(e) => { setActivityTypeFilter(e.target.value); setCurrentPage(1); }}
                        className="px-4 py-2 bg-dark-50 dark:bg-dark-900 border border-dark-200 dark:border-dark-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                        <option value="">{t('admin.activity.allTypes')}</option>
                        <option value="LOGIN">{t('admin.activity.types.login')}</option>
                        <option value="LOGOUT">{t('admin.activity.types.logout')}</option>
                        <option value="UPLOAD">{t('admin.activity.types.upload')}</option>
                        <option value="DOWNLOAD">{t('admin.activity.types.download')}</option>
                        <option value="DELETE">{t('admin.activity.types.delete')}</option>
                        <option value="CREATE_USER">{t('admin.activity.types.createUser')}</option>
                        <option value="UPDATE_USER">{t('admin.activity.types.updateUser')}</option>
                        <option value="UPDATE_SETTINGS">{t('admin.activity.types.updateSettings')}</option>
                    </select>
                    <Button variant="secondary" onClick={loadLogs}>
                        {t('common.search')}
                    </Button>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-dark-50 dark:bg-dark-900/50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">
                                    {t('admin.activity.user')}
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">
                                    {t('admin.activity.action')}
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">
                                    {t('admin.activity.descriptionColumn')}
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">
                                    {t('admin.activity.ipAddress')}
                                </th>
                                <th className="px-6 py-3 text-right text-xs font-semibold text-dark-500 uppercase tracking-wider">
                                    {t('admin.activity.date')}
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-dark-100 dark:divide-dark-700">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center">
                                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mb-2"></div>
                                        <p className="text-dark-500">{t('admin.activity.loading')}</p>
                                    </td>
                                </tr>
                            ) : activities.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-dark-500">
                                        {t('admin.activity.noLogs')}
                                    </td>
                                </tr>
                            ) : (
                                activities.map((log) => (
                                    <tr key={log.id} className="hover:bg-dark-50 dark:hover:bg-dark-700/30 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 text-xs font-bold">
                                                    {log.user?.name?.charAt(0) || '?'}
                                                </div>
                                                <span className="text-sm font-medium text-dark-900 dark:text-white">
                                                    {log.user?.name || t('common.unknown')}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center gap-2">
                                                {getActivityIcon(log.type)}
                                                <span className="text-sm text-dark-700 dark:text-dark-300">{log.type}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-dark-600 dark:text-dark-400 max-w-xs truncate">
                                            {log.details || '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-dark-500">
                                            {/* IP Address not in key type but might be in fetch result. Assuming not in type so conditionally rendering */}
                                            {/* The type definition seems to NOT have ipAddress, but if the backend sends it we can use it if we typed it. I will omit or check type */}
                                            -
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-dark-500">
                                            {formatDate(log.createdAt)}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="px-6 py-4 border-t border-dark-100 dark:border-dark-700 flex items-center justify-between">
                    <p className="text-sm text-dark-500">
                        Mostrando {activities.length} de {totalLogs} registros
                    </p>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={currentPage === 1 || loading}
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <div className="px-4 py-1 text-sm bg-dark-100 dark:bg-dark-700 rounded-lg">
                            {currentPage} / {totalPages || 1}
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={currentPage >= totalPages || loading}
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        >
                            <ChevronRight className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

