import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { api, API_URL } from '../../lib/api';
import { FileItem } from '../../types';
import { formatBytes, formatDate, cn, getFileIcon } from '../../lib/utils';
import {
  Download,
  FileText,
  Folder,
  Lock,
  Loader2,
  Grid,
  List,
} from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { toast } from '../../components/ui/Toast';

interface PublicShareData {
  share: {
    id: string;
    name: string;
    hasPassword: boolean;
    expiresAt: string | null;
    allowDownload: boolean;
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

  const getPublicFileUrl = useCallback((fileId: string, action: 'view' | 'thumbnail') => {
    const pwd = password ? `?password=${encodeURIComponent(password)}` : '';
    return `${API_URL}/shares/public/${token}/files/${fileId}/${action}${pwd}`;
  }, [password, token]);

  const loadShare = useCallback(async (pwd?: string) => {
    try {
      const response = await api.get(`/shares/public/${token}`, {
        params: pwd ? { password: pwd } : undefined,
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
  }, [token]);

  useEffect(() => {
    loadShare();
  }, [loadShare]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setVerifying(true);
    await loadShare(password);
    setVerifying(false);
  };

  const downloadFile = async (file: FileItem) => {
    try {
      const url = `${API_URL}/shares/public/${token}/files/${file.id}/download?password=${encodeURIComponent(password)}`;
      window.open(url, '_blank');
    } catch (error) {
      toast(t('publicShare.downloadError'), 'error');
    }
  };

  const downloadAll = async () => {
    try {
      const url = `${API_URL}/shares/public/${token}/download?password=${encodeURIComponent(password)}`;
      window.open(url, '_blank');
    } catch (error) {
      toast(t('publicShare.downloadError'), 'error');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-50 dark:bg-dark-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (needsPassword) {
    return (
      <div className="min-h-screen bg-dark-50 dark:bg-dark-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white dark:bg-dark-800 rounded-2xl p-8 shadow-lg">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-primary-600" />
            </div>
            <h1 className="text-2xl font-bold text-dark-900 dark:text-white">
              {t('publicShare.passwordProtected')}
            </h1>
            <p className="text-dark-500 dark:text-dark-400 mt-2">
              {t('publicShare.passwordDescription')}
            </p>
          </div>

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('publicShare.enterPassword')}
              autoFocus
            />
            <Button type="submit" className="w-full" loading={verifying}>
              {t('publicShare.access')}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-dark-50 dark:bg-dark-900 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-dark-900 dark:text-white">
            {t('publicShare.notFound')}
          </h1>
          <p className="text-dark-500 dark:text-dark-400 mt-2">
            {t('publicShare.notFoundDescription')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-50 dark:bg-dark-900">
      {/* Header */}
      <header className="bg-white dark:bg-dark-800 border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center">
              <Folder className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-dark-900 dark:text-white">
                {data.share.name || t('publicShare.sharedFiles')}
              </h1>
              <p className="text-sm text-dark-500">
                {data.files.length + data.folders.length} {t('publicShare.items')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                'p-2 rounded-lg',
                viewMode === 'grid' ? 'bg-primary-100 text-primary-600' : 'text-dark-500 hover:bg-dark-100'
              )}
              aria-label={t('publicShare.gridView')}
            >
              <Grid className="w-5 h-5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'p-2 rounded-lg',
                viewMode === 'list' ? 'bg-primary-100 text-primary-600' : 'text-dark-500 hover:bg-dark-100'
              )}
              aria-label={t('publicShare.listView')}
            >
              <List className="w-5 h-5" />
            </button>
            {data.share.allowDownload && (
              <Button onClick={downloadAll} icon={<Download className="w-4 h-4" />}>
                {t('publicShare.downloadAll')}
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {/* Folders */}
            {data.folders.map((folder) => (
              <button
                key={folder.id}
                onClick={() => setCurrentFolder(folder.id)}
                className="bg-white dark:bg-dark-800 rounded-xl p-4 text-left hover:shadow-lg transition-shadow"
              >
                <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center mb-3">
                  <Folder className="w-6 h-6 text-yellow-600" />
                </div>
                <p className="font-medium text-dark-900 dark:text-white truncate">
                  {folder.name}
                </p>
              </button>
            ))}

            {/* Files */}
            {data.files.map((file) => {
              const Icon = getFileIcon(file.mimeType);
              return (
                <div
                  key={file.id}
                  className="bg-white dark:bg-dark-800 rounded-xl p-4 hover:shadow-lg transition-shadow"
                >
                  {file.mimeType.startsWith('image/') ? (
                    <div className="aspect-square rounded-lg overflow-hidden mb-3 bg-dark-100">
                      <img
                        src={getPublicFileUrl(file.id, file.thumbnailPath ? 'thumbnail' : 'view')}
                        alt={file.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/30 rounded-xl flex items-center justify-center mb-3">
                      <Icon className="w-6 h-6 text-primary-600" />
                    </div>
                  )}
                  <p className="font-medium text-dark-900 dark:text-white truncate">
                    {file.name}
                  </p>
                  <p className="text-sm text-dark-500 truncate">
                    {formatBytes(file.size)}
                  </p>
                  {data.share.allowDownload && (
                    <button
                      onClick={() => downloadFile(file)}
                      className="mt-2 text-primary-600 hover:text-primary-700 text-sm font-medium flex items-center gap-1"
                      aria-label={`${t('publicShare.download')} ${file.name}`}
                    >
                      <Download className="w-4 h-4" /> {t('publicShare.download')}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white dark:bg-dark-800 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-dark-50 dark:bg-dark-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dark-500 uppercase">
                    {t('publicShare.name')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dark-500 uppercase">
                    {t('publicShare.size')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dark-500 uppercase">
                    {t('publicShare.modified')}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-dark-500 uppercase">
                    {t('publicShare.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-200 dark:divide-dark-700">
                {data.files.map((file) => {
                  const Icon = getFileIcon(file.mimeType);
                  return (
                    <tr key={file.id} className="hover:bg-dark-50 dark:hover:bg-dark-700/50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Icon className="w-5 h-5 text-dark-400" />
                          <span className="text-dark-900 dark:text-white">
                            {file.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-dark-500">
                        {formatBytes(file.size)}
                      </td>
                      <td className="px-6 py-4 text-dark-500">
                        {formatDate(file.updatedAt)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {data.share.allowDownload && (
                          <button
                            onClick={() => downloadFile(file)}
                            className="p-2 text-dark-500 hover:text-primary-600 rounded-lg hover:bg-dark-100 dark:hover:bg-dark-600"
                          >
                            <Download className="w-5 h-5" />
                          </button>
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
    </div>
  );
}
