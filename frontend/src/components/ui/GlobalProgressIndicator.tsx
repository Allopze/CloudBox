import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  Loader2,
  Upload,
  Download,
  FolderInput,
  Copy,
  Trash2,
  FileArchive,
  AlertCircle,
} from 'lucide-react';
import { useGlobalProgressStore, GlobalOperation } from '../../stores/globalProgressStore';
import { cn, formatDuration } from '../../lib/utils';
import Progress from '../ui/Progress';

const operationIcons: Record<GlobalOperation['type'], React.ElementType> = {
  upload: Upload,
  download: Download,
  move: FolderInput,
  copy: Copy,
  delete: Trash2,
  compress: FileArchive,
};

function OperationItem({ operation }: { operation: GlobalOperation }) {
  const { removeOperation, cancelOperation } = useGlobalProgressStore();
  const Icon = operationIcons[operation.type];
  const progress = operation.totalItems > 0
    ? Math.round((operation.completedItems / operation.totalItems) * 100)
    : 0;

  const elapsed = operation.endTime
    ? operation.endTime - operation.startTime
    : Date.now() - operation.startTime;

  return (
    <div className="p-3 border-b border-dark-200 dark:border-dark-700 last:border-b-0">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'p-2 rounded-lg flex-shrink-0',
            operation.status === 'completed'
              ? 'bg-green-100 dark:bg-green-900/30 text-green-600'
              : operation.status === 'error'
              ? 'bg-red-100 dark:bg-red-900/30 text-red-600'
              : 'bg-primary-100 dark:bg-primary-900/30 text-primary-600'
          )}
        >
          {operation.status === 'in-progress' || operation.status === 'pending' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : operation.status === 'completed' ? (
            <CheckCircle className="w-4 h-4" />
          ) : operation.status === 'error' ? (
            <XCircle className="w-4 h-4" />
          ) : (
            <Icon className="w-4 h-4" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-sm text-dark-900 dark:text-white truncate">
              {operation.title}
            </p>
            {(operation.status === 'in-progress' || operation.status === 'pending') && (
              <button
                onClick={() => cancelOperation(operation.id)}
                className="text-dark-400 hover:text-dark-600 dark:hover:text-dark-300"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            {(operation.status === 'completed' || operation.status === 'error' || operation.status === 'cancelled') && (
              <button
                onClick={() => removeOperation(operation.id)}
                className="text-dark-400 hover:text-dark-600 dark:hover:text-dark-300"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {operation.status === 'in-progress' && (
            <>
              <Progress value={progress} size="sm" className="mt-2" />
              <p className="text-xs text-dark-500 dark:text-dark-400 mt-1 truncate">
                {operation.currentItem || `${operation.completedItems} de ${operation.totalItems} elementos`}
              </p>
            </>
          )}

          {operation.status === 'completed' && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
              Completado en {formatDuration(elapsed / 1000)}
            </p>
          )}

          {operation.status === 'error' && (
            <div className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 mt-1">
              <AlertCircle className="w-3 h-3" />
              {operation.error || 'Error desconocido'}
            </div>
          )}

          {operation.status === 'cancelled' && (
            <p className="text-xs text-dark-500 dark:text-dark-400 mt-1">
              Cancelado
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function GlobalProgressIndicator() {
  const { t } = useTranslation();
  const { operations, isMinimized, toggleMinimize, clearCompleted } = useGlobalProgressStore();
  const [isExpanded, setIsExpanded] = useState(true);

  if (operations.length === 0) return null;

  const activeOperations = operations.filter(
    (op) => op.status === 'in-progress' || op.status === 'pending'
  );
  const completedOperations = operations.filter(
    (op) => op.status === 'completed' || op.status === 'error' || op.status === 'cancelled'
  );

  // Calculate overall progress
  const totalItems = activeOperations.reduce((sum, op) => sum + op.totalItems, 0);
  const completedItems = activeOperations.reduce((sum, op) => sum + op.completedItems, 0);
  const overallProgress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  if (isMinimized) {
    return (
      <button
        onClick={toggleMinimize}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2 bg-white dark:bg-dark-800 shadow-lg rounded-full border border-dark-200 dark:border-dark-700 hover:shadow-xl transition-shadow"
      >
        {activeOperations.length > 0 ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin text-primary-600" />
            <span className="text-sm font-medium text-dark-900 dark:text-white">
              {overallProgress}%
            </span>
          </>
        ) : (
          <>
            <CheckCircle className="w-4 h-4 text-green-600" />
            <span className="text-sm font-medium text-dark-900 dark:text-white">
              {t('progress.completed', { count: completedOperations.length })}
            </span>
          </>
        )}
        <ChevronUp className="w-4 h-4 text-dark-500" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 bg-white dark:bg-dark-800 rounded-xl shadow-2xl border border-dark-200 dark:border-dark-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-200 dark:border-dark-700 bg-dark-50 dark:bg-dark-900">
        <div className="flex items-center gap-2">
          {activeOperations.length > 0 ? (
            <Loader2 className="w-4 h-4 animate-spin text-primary-600" />
          ) : (
            <CheckCircle className="w-4 h-4 text-green-600" />
          )}
          <h4 className="font-medium text-sm text-dark-900 dark:text-white">
            {activeOperations.length > 0
              ? t('progress.inProgress', { count: activeOperations.length })
              : t('progress.allCompleted')}
          </h4>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 text-dark-500 hover:text-dark-700 dark:hover:text-dark-300 rounded"
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={toggleMinimize}
            className="p-1 text-dark-500 hover:text-dark-700 dark:hover:text-dark-300 rounded"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Overall progress for multiple active operations */}
      {activeOperations.length > 1 && (
        <div className="px-4 py-2 border-b border-dark-200 dark:border-dark-700">
          <Progress value={overallProgress} size="sm" />
          <p className="text-xs text-dark-500 dark:text-dark-400 mt-1 text-center">
            {t('progress.total', { completed: completedItems, total: totalItems })}
          </p>
        </div>
      )}

      {/* Operations list */}
      {isExpanded && (
        <div className="max-h-64 overflow-y-auto">
          {operations.map((operation) => (
            <OperationItem key={operation.id} operation={operation} />
          ))}
        </div>
      )}

      {/* Footer */}
      {completedOperations.length > 0 && (
        <div className="px-4 py-2 border-t border-dark-200 dark:border-dark-700 bg-dark-50 dark:bg-dark-900">
          <button
            onClick={clearCompleted}
            className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400"
          >
            {t('progress.clearCompleted')}
          </button>
        </div>
      )}
    </div>
  );
}
