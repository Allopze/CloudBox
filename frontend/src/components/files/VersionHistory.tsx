import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { formatBytes, formatDateTime } from '../../lib/utils';
import { History, Download, RotateCcw, Trash2, Loader2, Clock } from 'lucide-react';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { toast } from '../ui/Toast';

interface FileVersion {
    id: string;
    version: number;
    size: string;
    mimeType: string;
    createdAt: string;
}

interface VersionHistoryProps {
    fileId: string;
    fileName: string;
    isOpen: boolean;
    onClose: () => void;
    onVersionRestored?: () => void;
}

export default function VersionHistory({
    fileId,
    fileName,
    isOpen,
    onClose,
    onVersionRestored,
}: VersionHistoryProps) {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [versions, setVersions] = useState<FileVersion[]>([]);
    const [currentFile, setCurrentFile] = useState<{
        id: string;
        name: string;
        size: string;
        mimeType: string;
        updatedAt: string;
    } | null>(null);
    const [restoring, setRestoring] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);

    const loadVersions = useCallback(async () => {
        try {
            setLoading(true);
            const response = await api.get(`/files/${fileId}/versions`);
            setCurrentFile(response.data.current);
            setVersions(response.data.versions);
        } catch (error) {
            toast(t('versions.loadError', 'Error loading versions'), 'error');
        } finally {
            setLoading(false);
        }
    }, [fileId, t]);

    useEffect(() => {
        if (isOpen) {
            loadVersions();
        }
    }, [isOpen, loadVersions]);

    const handleDownload = async (version: FileVersion) => {
        try {
            const response = await api.get(`/files/${fileId}/versions/${version.id}/download`, {
                responseType: 'blob',
            });
            const blob = response.data as Blob;
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            const ext = fileName.includes('.') ? fileName.substring(fileName.lastIndexOf('.')) : '';
            const baseName = fileName.includes('.') ? fileName.substring(0, fileName.lastIndexOf('.')) : fileName;
            a.download = `${baseName}_v${version.version}${ext}`;
            a.click();
            URL.revokeObjectURL(a.href);
        } catch (error) {
            toast(t('versions.downloadError', 'Error downloading version'), 'error');
        }
    };

    const handleRestore = async (version: FileVersion) => {
        try {
            setRestoring(version.id);
            await api.post(`/files/${fileId}/versions/${version.id}/restore`);
            toast(t('versions.restored', 'Version restored successfully'), 'success');
            await loadVersions();
            onVersionRestored?.();
        } catch (error) {
            toast(t('versions.restoreError', 'Error restoring version'), 'error');
        } finally {
            setRestoring(null);
        }
    };

    const handleDelete = async (version: FileVersion) => {
        try {
            setDeleting(version.id);
            await api.delete(`/files/${fileId}/versions/${version.id}`);
            toast(t('versions.deleted', 'Version deleted'), 'success');
            setVersions(prev => prev.filter(v => v.id !== version.id));
        } catch (error) {
            toast(t('versions.deleteError', 'Error deleting version'), 'error');
        } finally {
            setDeleting(null);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('versions.title', 'Version History')}>
            <div className="space-y-4">
                {/* Header info */}
                <div className="flex items-center gap-3 p-3 bg-dark-50 dark:bg-dark-800 rounded-lg">
                    <History className="w-5 h-5 text-primary-600" />
                    <div className="flex-1 min-w-0">
                        <p className="font-medium text-dark-900 dark:text-white truncate">{fileName}</p>
                        <p className="text-sm text-dark-500">
                            {versions.length} {t('versions.previousVersions', 'previous versions')}
                        </p>
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
                    </div>
                ) : (
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                        {/* Current version */}
                        {currentFile && (
                            <div className="flex items-center gap-3 p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-200 dark:border-primary-800">
                                <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center">
                                    <Clock className="w-4 h-4 text-white" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium text-dark-900 dark:text-white">
                                            {t('versions.current', 'Current version')}
                                        </span>
                                        <span className="px-2 py-0.5 text-xs bg-primary-600 text-white rounded-full">
                                            {t('versions.latest', 'Latest')}
                                        </span>
                                    </div>
                                    <p className="text-sm text-dark-500">
                                        {formatDateTime(currentFile.updatedAt)} • {formatBytes(currentFile.size)}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Previous versions */}
                        {versions.length === 0 ? (
                            <div className="text-center py-8 text-dark-500">
                                <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                <p>{t('versions.noVersions', 'No previous versions available')}</p>
                                <p className="text-sm mt-1">
                                    {t('versions.noVersionsHint', 'Versions are created when you upload a file with the same name')}
                                </p>
                            </div>
                        ) : (
                            versions.map((version) => (
                                <div
                                    key={version.id}
                                    className="flex items-center gap-3 p-3 bg-white dark:bg-dark-800 rounded-lg border border-dark-200 dark:border-dark-700 hover:border-primary-300 dark:hover:border-primary-700 transition-colors"
                                >
                                    <div className="w-8 h-8 rounded-full bg-dark-100 dark:bg-dark-700 flex items-center justify-center">
                                        <span className="text-sm font-medium text-dark-600 dark:text-dark-400">
                                            v{version.version}
                                        </span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-dark-900 dark:text-white">
                                            {t('versions.version', 'Version')} {version.version}
                                        </p>
                                        <p className="text-sm text-dark-500">
                                            {formatDateTime(version.createdAt)} • {formatBytes(version.size)}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => handleDownload(version)}
                                            className="p-2 text-dark-500 hover:text-primary-600 hover:bg-dark-100 dark:hover:bg-dark-700 rounded-lg transition-colors"
                                            title={t('versions.download', 'Download')}
                                        >
                                            <Download className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleRestore(version)}
                                            disabled={restoring === version.id}
                                            className="p-2 text-dark-500 hover:text-green-600 hover:bg-dark-100 dark:hover:bg-dark-700 rounded-lg transition-colors disabled:opacity-50"
                                            title={t('versions.restore', 'Restore this version')}
                                        >
                                            {restoring === version.id ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <RotateCcw className="w-4 h-4" />
                                            )}
                                        </button>
                                        <button
                                            onClick={() => handleDelete(version)}
                                            disabled={deleting === version.id}
                                            className="p-2 text-dark-500 hover:text-red-600 hover:bg-dark-100 dark:hover:bg-dark-700 rounded-lg transition-colors disabled:opacity-50"
                                            title={t('versions.delete', 'Delete version')}
                                        >
                                            {deleting === version.id ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <Trash2 className="w-4 h-4" />
                                            )}
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {/* Footer */}
                <div className="flex justify-end pt-2 border-t border-dark-200 dark:border-dark-700">
                    <Button variant="ghost" onClick={onClose}>
                        {t('common.close', 'Close')}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
