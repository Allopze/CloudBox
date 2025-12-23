import { useTranslation } from 'react-i18next';
import { useFileStore } from '../../stores/fileStore';
import { Trash2, Star, FolderInput, Share2 } from 'lucide-react';
import Button from '../ui/Button';

interface FileToolbarProps {
  selectedCount: number;
  selectedFileIds?: string[];
  selectedFolderIds?: string[];
  onDeleteSelected?: () => void;
  onMoveSelected?: () => void;
  onFavoriteSelected?: () => void;
  onShareSelected?: () => void;
}

export default function FileToolbar({
  selectedCount,
  selectedFileIds = [],
  selectedFolderIds = [],
  onDeleteSelected,
  onMoveSelected,
  onFavoriteSelected,
  onShareSelected,
}: FileToolbarProps) {
  const { t } = useTranslation();
  const { clearSelection } = useFileStore();

  // Only show toolbar when items are selected
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 py-3 mb-4 px-4 bg-primary-50 dark:bg-primary-900/20 rounded-xl border border-primary-200 dark:border-primary-800">
      <span className="text-sm font-medium text-dark-700 dark:text-dark-300">
        {t('toolbar.selected', { count: selectedCount })}
      </span>

      <div className="flex-1" />

      {onMoveSelected && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onMoveSelected}
          icon={<FolderInput className="w-4 h-4" />}
        >
          {t('toolbar.move')}
        </Button>
      )}

      {onFavoriteSelected && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onFavoriteSelected}
          icon={<Star className="w-4 h-4" />}
        >
          {t('toolbar.favorite')}
        </Button>
      )}

      {onShareSelected && selectedFolderIds.length === 0 && selectedFileIds.length === 1 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onShareSelected}
          icon={<Share2 className="w-4 h-4" />}
        >
          {t('toolbar.share')}
        </Button>
      )}

      {onDeleteSelected && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onDeleteSelected}
          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
          icon={<Trash2 className="w-4 h-4" />}
        >
          {t('toolbar.delete')}
        </Button>
      )}

      <Button variant="ghost" size="sm" onClick={clearSelection}>
        {t('toolbar.clear')}
      </Button>
    </div>
  );
}
