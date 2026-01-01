import { useUploadStore } from '../stores/uploadStore';
import { CheckCircle, XCircle, Loader2, Minimize2, Maximize2, X } from 'lucide-react';
import { formatBytes } from '../lib/utils';
import Progress from './ui/Progress';
import { useState, useMemo } from 'react';

export default function UploadProgress() {
  const { uploads, clearCompleted } = useUploadStore();
  const [minimized, setMinimized] = useState(false);

  // Convert Map to array
  const uploadsArray = useMemo(() => Array.from(uploads.values()), [uploads]);

  const activeUploads = uploadsArray.filter(
    (u) => u.status === 'uploading' || u.status === 'pending'
  );
  const completedUploads = uploadsArray.filter(
    (u) => u.status === 'completed' || u.status === 'error'
  );

  if (uploadsArray.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 w-80 bg-white dark:bg-dark-800 rounded-xl shadow-2xl border z-50 overflow-hidden safe-area-bottom">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-dark-50 dark:bg-dark-700">
        <div className="flex items-center gap-2">
          {activeUploads.length > 0 && (
            <Loader2 className="w-4 h-4 animate-spin text-primary-600" />
          )}
          <span className="text-sm font-medium text-dark-900 dark:text-white">
            {activeUploads.length > 0
              ? `Uploading ${activeUploads.length} file(s)`
              : `${completedUploads.length} completed`}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMinimized(!minimized)}
            className="p-1 text-dark-500 hover:text-dark-900 dark:hover:text-white rounded"
          >
            {minimized ? (
              <Maximize2 className="w-4 h-4" />
            ) : (
              <Minimize2 className="w-4 h-4" />
            )}
          </button>
          {completedUploads.length > 0 && activeUploads.length === 0 && (
            <button
              onClick={clearCompleted}
              className="p-1 text-dark-500 hover:text-dark-900 dark:hover:text-white rounded"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {!minimized && (
        <div className="max-h-64 overflow-y-auto">
          {uploadsArray.map((upload) => (
            <div
              key={upload.id}
              className="flex items-center gap-3 px-4 py-3 border-t"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-dark-900 dark:text-white truncate">
                  {upload.name}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-dark-500">
                    {formatBytes(upload.size)}
                  </span>
                  {upload.status === 'uploading' && (
                    <span className="text-xs text-primary-600">
                      {upload.progress}%
                    </span>
                  )}
                </div>
                {upload.status === 'uploading' && (
                  <Progress value={upload.progress} size="sm" className="mt-2" />
                )}
                {upload.status === 'error' && upload.error && (
                  <p className="text-xs text-red-600 mt-1">{upload.error}</p>
                )}
              </div>
              {upload.status === 'completed' ? (
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
              ) : upload.status === 'error' ? (
                <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              ) : upload.status === 'uploading' ? (
                <Loader2 className="w-5 h-5 animate-spin text-primary-600 flex-shrink-0" />
              ) : (
                <div className="w-5 h-5 rounded-full border-2 border-dark-300 dark:border-dark-600 flex-shrink-0" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
