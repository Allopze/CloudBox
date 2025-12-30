import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { api, API_URL } from '../../lib/api';
import { FileItem } from '../../types';
import { formatBytes, formatDate, cn, getFileColor } from '../../lib/utils';
import {
  Download,
  Lock,
  Loader2,
  Grid,
  List,
  Clock,
  Shield,
  HardDrive
} from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { toast } from '../../components/ui/Toast';
import { FileExtensionIcon, SolidFolderIcon } from '../../components/icons/SolidIcons';

interface PublicShareData {
  share: {
    id: string;
    name: string;
    hasPassword: boolean;
    expiresAt: string | null;
    allowDownload: boolean;
    downloadLimit: number | null;
    downloadCount: number;
    owner?: {
      name: string;
    };
  };
  files: FileItem[];
  folders: any[];
}

export default function PublicShare() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PublicShareData | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [, setCurrentFolder] = useState<string | null>(null);

  const getFileExtension = (fileName: string) => {
    return fileName.split('.').pop()?.toLowerCase() || '';
  };

  const getPublicFileUrl = useCallback((fileId: string, action: 'view' | 'thumbnail') => {
    return `${API_URL}/shares/public/${token}/files/${fileId}/${action}`;
  }, [token]);

  const loadShare = useCallback(async () => {
    try {
      const response = await api.get(`/shares/public/${token}`, {
        withCredentials: true,
      });
      setData(response.data);
      setNeedsPassword(false);
    } catch (error: any) {
      if (error.response?.status === 401) {
        setNeedsPassword(true);
      } else {
        toast(error.response?.data?.message || t('publicShare.notFoundDescription'), 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useEffect(() => {
    loadShare();
  }, [loadShare]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setVerifying(true);
    try {
      await api.post(`/shares/public/${token}/verify`, { password }, {
        withCredentials: true,
      });
      await loadShare();
    } catch (error: any) {
      if (error.response?.status === 401) {
        toast(t('publicShare.invalidPassword'), 'error');
      } else {
        toast(t('publicShare.verifyError'), 'error');
      }
    } finally {
      setVerifying(false);
    }
  };

  const downloadFile = async (file: FileItem) => {
    try {
      const url = `${API_URL}/shares/public/${token}/files/${file.id}/download`;
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (error) {
      toast(t('publicShare.downloadError'), 'error');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary-600 mb-4" />
        <p className="text-slate-500 font-medium">{t('common.loading')}</p>
      </div>
    );
  }

  if (needsPassword) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl overflow-hidden border border-slate-100 dark:border-slate-800">
          <div className="bg-primary-600 p-8 text-center text-white">
            <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-inner">
              <Lock className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold">
              {t('publicShare.passwordProtected')}
            </h1>
            <p className="text-primary-100 mt-2 text-sm opacity-90">
              {t('publicShare.passwordDescription')}
            </p>
          </div>

          <div className="p-8">
            <form onSubmit={handlePasswordSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 ml-1">
                  {t('publicShare.enterPassword')}
                </label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-11 bg-slate-50 border-slate-200 focus:border-primary-500 focus:ring-primary-500/20 transition-all font-medium"
                  autoFocus
                />
              </div>
              <Button
                type="submit"
                className="w-full h-11 text-base shadow-lg shadow-primary-500/20 hover:shadow-primary-500/30 transition-all"
                loading={verifying}
              >
                {t('publicShare.access')}
              </Button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="text-center max-w-md mx-auto">
          <div className="w-20 h-20 bg-red-50 dark:bg-red-900/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <Shield className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            {t('publicShare.notFound')}
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            {t('publicShare.notFoundDescription')}
          </p>
          <Button
            variant="outline"
            className="mt-8"
            onClick={() => window.location.reload()}
          >
            {t('common.retry')}
          </Button>
        </div>
      </div>
    );
  }

  const totalItems = data.files.length + data.folders.length;
  const hasItems = totalItems > 0;
  const downloadLimit = data.share.downloadLimit;
  const downloadCount = data.share.downloadCount ?? 0;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950">
      {/* Aesthetic Header */}
      <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex items-center justify-center shrink-0">
              <SolidFolderIcon size={32} />
            </div>

            <div className="min-w-0 flex flex-col justify-center">
              <h1 className="text-lg font-bold text-slate-900 dark:text-white truncate leading-tight">
                {data.share.name || t('publicShare.sharedFiles')}
              </h1>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {totalItems} {t('publicShare.items')}
                </span>

                {data.share.expiresAt && (
                  <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 border border-orange-100 dark:border-orange-900/30">
                    <Clock className="w-3 h-3" />
                    {formatDate(data.share.expiresAt)}
                  </span>
                )}

                {downloadLimit && (
                  <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30">
                    <HardDrive className="w-3 h-3" />
                    {downloadCount}/{downloadLimit}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full p-0.5">
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                "p-1.5 rounded-full transition-colors flex items-center justify-center",
                viewMode === 'grid'
                  ? "bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-500 dark:text-white/70 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/5"
              )}
              title={t('publicShare.gridView')}
              aria-pressed={viewMode === 'grid'}
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                "p-1.5 rounded-full transition-colors flex items-center justify-center",
                viewMode === 'list'
                  ? "bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-500 dark:text-white/70 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/5"
              )}
              title={t('publicShare.listView')}
              aria-pressed={viewMode === 'list'}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full">
        {!hasItems ? (
          <div className="h-full flex flex-col items-center justify-center min-h-[50vh]">
            <div className="relative mb-6 group">
              <div className="absolute inset-0 bg-primary-500/20 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
              <div className="relative w-32 h-32 flex items-center justify-center opacity-80 group-hover:scale-105 transition-transform duration-500">
                <SolidFolderIcon size={120} className="text-slate-300 dark:text-slate-700" />
              </div>
            </div>

            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              {t('publicShare.emptyTitle')}
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-center max-w-sm">
              {t('publicShare.emptyDescription')}
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
            {/* Folders */}
            {data.folders.map((folder) => (
              <button
                key={folder.id}
                onClick={() => setCurrentFolder(folder.id)}
                className="group relative flex flex-col items-center p-6 bg-white dark:bg-slate-900 rounded-2xl border border-transparent hover:border-primary-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
              >
                <div className="w-20 h-20 mb-4 transition-transform duration-300 group-hover:scale-110">
                  <SolidFolderIcon size={80} />
                </div>
                <p className="w-full text-center font-semibold text-slate-700 dark:text-slate-200 truncate px-2 text-sm group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                  {folder.name}
                </p>
                <span className="text-xs text-slate-400 mt-1 font-medium">
                  {t('common.folder')}
                </span>
              </button>
            ))}

            {/* Files */}
            {data.files.map((file) => {
              const fileExtension = getFileExtension(file.name);
              const fileColor = getFileColor(file.mimeType);
              const isImage = file.mimeType.startsWith('image/');

              return (
                <div
                  key={file.id}
                  className="group relative bg-white dark:bg-slate-900 rounded-2xl border border-transparent hover:border-slate-200 dark:hover:border-slate-700 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden"
                >
                  <div className="aspect-[4/3] bg-slate-50 dark:bg-slate-800/50 p-4 flex items-center justify-center overflow-hidden relative">
                    {isImage ? (
                      <img
                        src={getPublicFileUrl(file.id, file.thumbnailPath ? 'thumbnail' : 'view')}
                        alt={file.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        loading="lazy"
                      />
                    ) : (
                      <div className="transform transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
                        <FileExtensionIcon size={64} extension={fileExtension} className={fileColor} />
                      </div>
                    )}

                    {/* Overlay download button */}
                    {data.share.allowDownload && (
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center backdrop-blur-[2px]">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="rounded-full h-10 w-10 p-0 bg-white/90 hover:bg-white text-slate-900 shadow-lg transform scale-90 group-hover:scale-100 transition-all duration-300"
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadFile(file);
                          }}
                          title={t('publicShare.download')}
                        >
                          <Download className="w-5 h-5" />
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-700 dark:text-slate-200 truncate text-sm mb-1" title={file.name}>
                          {file.name}
                        </p>
                        <p className="text-xs text-slate-500 flex items-center gap-2">
                          <span>{formatBytes(file.size)}</span>
                          <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                          <span>{fileExtension.toUpperCase()}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {t('publicShare.name')}
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">
                    {t('publicShare.size')}
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">
                    {t('publicShare.modified')}
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {t('publicShare.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {data.folders.map((folder) => (
                  <tr key={folder.id} className="group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4 cursor-pointer" onClick={() => setCurrentFolder(folder.id)}>
                        <div className="p-2 bg-primary-50 dark:bg-primary-900/20 rounded-lg group-hover:scale-110 transition-transform">
                          <SolidFolderIcon size={24} />
                        </div>
                        <span className="font-medium text-slate-900 dark:text-white group-hover:text-primary-600 transition-colors">
                          {folder.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500 hidden sm:table-cell">
                      -
                    </td>
                    <td className="px-6 py-4 text-slate-500 hidden md:table-cell">
                      {folder.updatedAt ? formatDate(folder.updatedAt) : '—'}
                    </td>
                    <td className="px-6 py-4 text-right" />
                  </tr>
                ))}
                {data.files.map((file) => {
                  const fileExtension = getFileExtension(file.name);
                  const fileColor = getFileColor(file.mimeType);

                  return (
                    <tr key={file.id} className="group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <div className="transition-transform group-hover:scale-110 group-hover:-rotate-3">
                            <FileExtensionIcon size={32} extension={fileExtension} className={fileColor} />
                          </div>
                          <span className="font-medium text-slate-900 dark:text-white group-hover:text-primary-600 transition-colors">
                            {file.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-500 font-mono text-xs hidden sm:table-cell">
                        {formatBytes(file.size)}
                      </td>
                      <td className="px-6 py-4 text-slate-500 hidden md:table-cell">
                        {formatDate(file.updatedAt)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {data.share.allowDownload && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-slate-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors rounded-full w-9 h-9 p-0"
                            onClick={() => downloadFile(file)}
                          >
                            <Download className="w-5 h-5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-8 text-center text-slate-400 text-xs">
        <p>© {new Date().getFullYear()} CloudBox. All rights reserved.</p>
      </footer>
    </div>
  );
}
