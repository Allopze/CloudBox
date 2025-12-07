import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Archive, Loader2, Check, AlertCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { toast } from '../ui/Toast';

interface CompressItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
}

interface CompressModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: CompressItem[];
  onSuccess?: () => void;
}

type CompressionFormat = 'zip' | '7z' | 'tar';

interface ProgressState {
  jobId: string | null;
  progress: number;
  currentFile: string;
  status: 'idle' | 'compressing' | 'completed' | 'error';
  error?: string;
}

export default function CompressModal({ isOpen, onClose, items, onSuccess }: CompressModalProps) {
  const { t } = useTranslation();
  const [format, setFormat] = useState<CompressionFormat>('zip');
  const [outputName, setOutputName] = useState('');
  const [progressState, setProgressState] = useState<ProgressState>({
    jobId: null,
    progress: 0,
    currentFile: '',
    status: 'idle',
  });

  // Generate default output name based on items
  useEffect(() => {
    if (isOpen && items.length > 0) {
      if (items.length === 1) {
        // Remove extension if it's a file
        const name = items[0].name.replace(/\.[^/.]+$/, '');
        setOutputName(name);
      } else {
        setOutputName('archive');
      }
    }
  }, [isOpen, items]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setProgressState({
        jobId: null,
        progress: 0,
        currentFile: '',
        status: 'idle',
      });
    }
  }, [isOpen]);

  const handleCompress = async () => {
    if (!outputName.trim()) {
      toast(t('modals.compress.nameRequired'), 'error');
      return;
    }

    setProgressState(prev => ({ ...prev, status: 'compressing', progress: 0 }));

    try {
      // Get IDs from items
      const paths = items.map(item => item.id);
      
      // Start compression job
      const response = await api.post('/compression/compress', {
        paths,
        format,
        outputName: outputName.trim(),
      });

      const { jobId } = response.data;
      setProgressState(prev => ({ ...prev, jobId }));

      // Poll for progress updates
      const pollProgress = async () => {
        try {
          const statusResponse = await api.get(`/compression/status/${jobId}`);
          const { progress, status, error } = statusResponse.data;
          
          if (status === 'COMPLETED') {
            setProgressState(prev => ({ ...prev, status: 'completed', progress: 100 }));
            toast(t('modals.compress.success'), 'success');
            onSuccess?.();
            setTimeout(() => {
              onClose();
            }, 1500);
            return;
          }
          
          if (status === 'FAILED') {
            setProgressState(prev => ({
              ...prev,
              status: 'error',
              error: error || t('modals.compress.error'),
            }));
            return;
          }
          
          // Update progress and continue polling
          setProgressState(prev => ({
            ...prev,
            progress: progress || prev.progress,
          }));
          
          // Continue polling if still processing
          if (status === 'PROCESSING' || status === 'PENDING') {
            setTimeout(pollProgress, 500);
          }
        } catch (err) {
          setProgressState(prev => ({
            ...prev,
            status: 'error',
            error: t('modals.compress.connectionError'),
          }));
        }
      };

      // Start polling
      pollProgress();

    } catch (error: any) {
      setProgressState(prev => ({
        ...prev,
        status: 'error',
        error: error.response?.data?.error || t('modals.compress.error'),
      }));
    }
  };

  const handleCancel = async () => {
    if (progressState.jobId && progressState.status === 'compressing') {
      try {
        await api.delete(`/compression/job/${progressState.jobId}`);
      } catch {
        // Ignore cancel errors
      }
    }
    onClose();
  };

  const formatOptions: { value: CompressionFormat; label: string; desc: string }[] = [
    { value: 'zip', label: 'ZIP', desc: t('modals.compress.formatZipDesc') },
    { value: '7z', label: '7Z', desc: t('modals.compress.format7zDesc') },
    { value: 'tar', label: 'TAR.GZ', desc: t('modals.compress.formatTarDesc') },
  ];

  const isProcessing = progressState.status === 'compressing';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={handleCancel}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white dark:bg-dark-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-dark-200 dark:border-dark-700">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/30">
                  <Archive className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                </div>
                <h2 className="text-lg font-semibold text-dark-900 dark:text-white">
                  {t('modals.compress.title')}
                </h2>
              </div>
              <button
                onClick={handleCancel}
                className="p-2 rounded-lg hover:bg-dark-100 dark:hover:bg-dark-700 transition-colors"
              >
                <X className="w-5 h-5 text-dark-500" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-5">
              {/* Items to compress */}
              <div>
                <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-2">
                  {t('modals.compress.itemsToCompress')}
                </label>
                <div className="text-sm text-dark-600 dark:text-dark-400 bg-dark-50 dark:bg-dark-700/50 rounded-lg p-3 max-h-24 overflow-y-auto">
                  {items.length === 1 ? (
                    <span>{items[0].name}</span>
                  ) : (
                    <span>{t('modals.compress.itemCount', { count: items.length })}</span>
                  )}
                </div>
              </div>

              {/* Output name */}
              <div>
                <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-2">
                  {t('modals.compress.outputName')}
                </label>
                <div className="flex">
                  <input
                    type="text"
                    value={outputName}
                    onChange={(e) => setOutputName(e.target.value)}
                    disabled={isProcessing}
                    className="flex-1 px-4 py-2.5 rounded-l-lg border border-dark-200 dark:border-dark-600 bg-white dark:bg-dark-700 text-dark-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:opacity-50"
                    placeholder={t('modals.compress.namePlaceholder')}
                  />
                  <span className="px-3 py-2.5 bg-dark-100 dark:bg-dark-600 border border-l-0 border-dark-200 dark:border-dark-600 rounded-r-lg text-dark-500 dark:text-dark-400">
                    .{format === 'tar' ? 'tar.gz' : format}
                  </span>
                </div>
              </div>

              {/* Format selection */}
              <div>
                <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-2">
                  {t('modals.compress.format')}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {formatOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setFormat(opt.value)}
                      disabled={isProcessing}
                      className={`p-3 rounded-lg border-2 transition-all ${
                        format === opt.value
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                          : 'border-dark-200 dark:border-dark-600 hover:border-dark-300 dark:hover:border-dark-500'
                      } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className="font-semibold text-dark-900 dark:text-white">
                        {opt.label}
                      </div>
                      <div className="text-xs text-dark-500 dark:text-dark-400 mt-1">
                        {opt.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Progress */}
              {progressState.status !== 'idle' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-dark-600 dark:text-dark-400">
                      {progressState.status === 'completed' ? (
                        <span className="flex items-center gap-2 text-green-600 dark:text-green-400">
                          <Check className="w-4 h-4" />
                          {t('modals.compress.completed')}
                        </span>
                      ) : progressState.status === 'error' ? (
                        <span className="flex items-center gap-2 text-red-600 dark:text-red-400">
                          <AlertCircle className="w-4 h-4" />
                          {progressState.error}
                        </span>
                      ) : (
                        progressState.currentFile || t('modals.compress.preparing')
                      )}
                    </span>
                    <span className="text-dark-900 dark:text-white font-medium">
                      {Math.round(progressState.progress)}%
                    </span>
                  </div>
                  <div className="h-2 bg-dark-100 dark:bg-dark-700 rounded-full overflow-hidden">
                    <motion.div
                      className={`h-full rounded-full ${
                        progressState.status === 'error'
                          ? 'bg-red-500'
                          : progressState.status === 'completed'
                          ? 'bg-green-500'
                          : 'bg-primary-500'
                      }`}
                      initial={{ width: 0 }}
                      animate={{ width: `${progressState.progress}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-dark-200 dark:border-dark-700 bg-dark-50 dark:bg-dark-900/50">
              <button
                onClick={handleCancel}
                disabled={isProcessing}
                className="px-4 py-2 text-dark-700 dark:text-dark-300 hover:bg-dark-100 dark:hover:bg-dark-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleCompress}
                disabled={isProcessing || progressState.status === 'completed' || !outputName.trim()}
                className="flex items-center gap-2 px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('modals.compress.compressing')}
                  </>
                ) : (
                  <>
                    <Archive className="w-4 h-4" />
                    {t('modals.compress.compress')}
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
