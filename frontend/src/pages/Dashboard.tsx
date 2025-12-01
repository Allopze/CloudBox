import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { api } from '../lib/api';
import { formatBytes } from '../lib/utils';
import { Activity, ActivityType } from '../types';
import {
  FolderOpen,
  FileText,
  Star,
  Clock,
  HardDrive,
  Activity as ActivityIcon,
  Upload,
  Download,
  Trash2,
  RotateCcw,
  Share2,
  FolderPlus,
  Edit,
  Archive,
  FileArchive,
} from 'lucide-react';

const activityIcons: Record<ActivityType, typeof ActivityIcon> = {
  UPLOAD: Upload,
  DOWNLOAD: Download,
  DELETE: Trash2,
  RESTORE: RotateCcw,
  SHARE: Share2,
  UNSHARE: Share2,
  MOVE: Edit,
  RENAME: Edit,
  CREATE_FOLDER: FolderPlus,
  COMPRESS: Archive,
  DECOMPRESS: FileArchive,
};

const activityLabels: Record<ActivityType, string> = {
  UPLOAD: 'Archivo subido',
  DOWNLOAD: 'Archivo descargado',
  DELETE: 'Elemento eliminado',
  RESTORE: 'Elemento restaurado',
  SHARE: 'Elemento compartido',
  UNSHARE: 'Compartido eliminado',
  MOVE: 'Elemento movido',
  RENAME: 'Elemento renombrado',
  CREATE_FOLDER: 'Carpeta creada',
  COMPRESS: 'Archivo comprimido',
  DECOMPRESS: 'Archivo descomprimido',
};

const activityColors: Record<ActivityType, string> = {
  UPLOAD: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
  DOWNLOAD: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  DELETE: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  RESTORE: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400',
  SHARE: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
  UNSHARE: 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400',
  MOVE: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
  RENAME: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400',
  CREATE_FOLDER: 'bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400',
  COMPRESS: 'bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400',
  DECOMPRESS: 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400',
};

import { cn } from '../lib/utils';

interface DashboardStats {
  totalFiles: number;
  totalFolders: number;
  totalSize: number;
  recentFiles: any[];
  favoriteFiles: any[];
  filesByType: Record<string, number>;
}

export default function Dashboard() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    try {
      const [filesRes, foldersRes, recentRes, favoritesRes, activityRes] = await Promise.all([
        api.get('/files?limit=1'),
        api.get('/folders?limit=1'),
        api.get('/files?limit=5&sortBy=createdAt&sortOrder=desc'),
        api.get('/files?favorite=true&limit=5'),
        api.get('/activity?limit=10'),
      ]);

      setStats({
        totalFiles: filesRes.data.pagination?.total || 0,
        totalFolders: foldersRes.data.length || 0,
        totalSize: parseInt(user?.storageUsed || '0'),
        recentFiles: recentRes.data.files || [],
        favoriteFiles: favoritesRes.data.files || [],
        filesByType: {},
      });
      setActivities(activityRes.data.activities || []);
    } catch (error) {
      console.error('Failed to load dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.storageUsed]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const storageUsedPercent = user && parseInt(user.storageQuota) > 0
    ? Math.round((parseInt(user.storageUsed) / parseInt(user.storageQuota)) * 100)
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-dark-800 rounded-xl p-4 border border-dark-100 dark:border-dark-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-dark-100 dark:bg-dark-700 flex items-center justify-center">
                <FileText className="w-5 h-5 text-dark-500" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-dark-500 dark:text-dark-400">
                  Total archivos
                </p>
                <p className="text-xl font-semibold text-dark-900 dark:text-white">
                  {stats?.totalFiles || 0}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-dark-800 rounded-xl p-4 border border-dark-100 dark:border-dark-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-dark-100 dark:bg-dark-700 flex items-center justify-center">
                <FolderOpen className="w-5 h-5 text-dark-500" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-dark-500 dark:text-dark-400">
                  Total carpetas
                </p>
                <p className="text-xl font-semibold text-dark-900 dark:text-white">
                  {stats?.totalFolders || 0}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-dark-800 rounded-xl p-4 border border-dark-100 dark:border-dark-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-dark-100 dark:bg-dark-700 flex items-center justify-center">
                <HardDrive className="w-5 h-5 text-dark-500" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-dark-500 dark:text-dark-400">
                  Espacio usado
                </p>
                <p className="text-xl font-semibold text-dark-900 dark:text-white">
                  {formatBytes(stats?.totalSize || 0)}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-dark-800 rounded-xl p-4 border border-dark-100 dark:border-dark-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-dark-100 dark:bg-dark-700 flex items-center justify-center">
                <HardDrive className="w-5 h-5 text-dark-500" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-dark-500 dark:text-dark-400">
                  Cuota usada
                </p>
                <p className="text-xl font-semibold text-dark-900 dark:text-white">
                  {storageUsedPercent}% usado
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Storage bar */}
      <div className="bg-white dark:bg-dark-800 rounded-xl p-4 border border-dark-100 dark:border-dark-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-dark-900 dark:text-white">Almacenamiento</h2>
          <span className="text-sm text-dark-500 dark:text-dark-400">
            {formatBytes(user?.storageUsed || 0)} de {formatBytes(user?.storageQuota || 0)}
          </span>
        </div>
        <div className="w-full h-2.5 bg-dark-100 dark:bg-dark-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary-500 to-primary-600 rounded-full transition-all"
            style={{ width: `${Math.min(storageUsedPercent, 100)}%` }}
          />
        </div>
      </div>

      {/* Recent files */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-dark-800 rounded-xl p-4 border border-dark-100 dark:border-dark-700">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-dark-900 dark:text-white flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Archivos recientes
            </h2>
            <Link to="/files" className="text-sm text-primary-600 hover:text-primary-700">
              Ver todos
            </Link>
          </div>
          {stats?.recentFiles && stats.recentFiles.length > 0 ? (
            <div className="space-y-2.5">
              {stats.recentFiles.map((file: any) => (
                <div
                  key={file.id}
                  className="flex items-center gap-3 p-3 rounded-md hover:bg-dark-50 dark:hover:bg-dark-700 transition-colors"
                >
                  <FileText className="w-8 h-8 text-dark-400" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-dark-900 dark:text-white truncate">
                      {file.name}
                    </p>
                    <p className="text-sm text-dark-500">{formatBytes(file.size)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-dark-500 dark:text-dark-400 text-center py-8">
              Sin archivos recientes
            </p>
          )}
        </div>

        <div className="bg-white dark:bg-dark-800 rounded-xl p-4 border border-dark-100 dark:border-dark-700">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-dark-900 dark:text-white flex items-center gap-2">
              <Star className="w-5 h-5" />
              Favoritos
            </h2>
            <Link to="/favorites" className="text-sm text-primary-600 hover:text-primary-700">
              Ver todos
            </Link>
          </div>
          {stats?.favoriteFiles && stats.favoriteFiles.length > 0 ? (
            <div className="space-y-2.5">
              {stats.favoriteFiles.map((file: any) => (
                <div
                  key={file.id}
                  className="flex items-center gap-3 p-3 rounded-md hover:bg-dark-50 dark:hover:bg-dark-700 transition-colors"
                >
                  <FileText className="w-8 h-8 text-dark-400" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-dark-900 dark:text-white truncate">
                      {file.name}
                    </p>
                    <p className="text-sm text-dark-500">{formatBytes(file.size)}</p>
                  </div>
                  <Star className="w-5 h-5 text-primary-500 fill-primary-500" />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-dark-500 dark:text-dark-400 text-center py-8">
              Sin archivos favoritos
            </p>
          )}
        </div>
      </div>

      {/* Activity Section */}
      <div className="bg-white dark:bg-dark-800 rounded-xl p-4 border border-dark-100 dark:border-dark-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-dark-900 dark:text-white flex items-center gap-2">
            <ActivityIcon className="w-5 h-5" />
            Actividad reciente
          </h2>
        </div>
        {activities.length > 0 ? (
          <div className="space-y-2">
            {activities.map((activity) => {
              const Icon = activityIcons[activity.type] || ActivityIcon;
              const label = activityLabels[activity.type] || activity.type;
              const colorClass = activityColors[activity.type] || 'bg-dark-100 text-dark-600';

              return (
                <div
                  key={activity.id}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-dark-50 dark:hover:bg-dark-700/50 transition-colors"
                >
                  <div 
                    className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', colorClass)}
                    aria-hidden="true"
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-dark-900 dark:text-white">
                      {label}
                    </p>
                    {activity.details && (
                      <p className="text-xs text-dark-500 dark:text-dark-400 truncate">
                        {activity.details}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-dark-400 dark:text-dark-500 flex-shrink-0">
                    {new Date(activity.createdAt).toLocaleTimeString('es-ES', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-dark-500 dark:text-dark-400 text-center py-8">
            Sin actividad reciente
          </p>
        )}
      </div>
    </div>
  );
}
