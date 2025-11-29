import { useFileStore } from '../../stores/fileStore';
import { Trash2 } from 'lucide-react';
import Button from '../ui/Button';

interface FileToolbarProps {
  selectedCount: number;
  onDeleteSelected?: () => void;
}

export default function FileToolbar({
  selectedCount,
  onDeleteSelected,
}: FileToolbarProps) {
  const { clearSelection } = useFileStore();

  // Only show toolbar when items are selected
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 py-3 mb-4">
      <span className="text-sm text-dark-600 dark:text-dark-400">
        {selectedCount} seleccionados
      </span>
      <Button variant="ghost" size="sm" onClick={clearSelection}>
        Limpiar
      </Button>
      {onDeleteSelected && (
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={onDeleteSelected}
          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
          icon={<Trash2 className="w-4 h-4" />}
        >
          Eliminar
        </Button>
      )}
    </div>
  );
}
