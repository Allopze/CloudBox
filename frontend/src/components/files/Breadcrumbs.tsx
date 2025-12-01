import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { useDragDropStore } from '../../stores/dragDropStore';
import { useFileStore } from '../../stores/fileStore';
import { api } from '../../lib/api';
import { toast } from '../ui/Toast';
import { cn } from '../../lib/utils';
import { FileItem, Folder } from '../../types';

interface BreadcrumbItem {
  id: string;
  name: string;
}

interface BreadcrumbsProps {
  items?: BreadcrumbItem[];
  basePath?: string;
  onRefresh?: () => void;
}

export default function Breadcrumbs({ items = [], basePath = '/files', onRefresh }: BreadcrumbsProps) {
  const { isDragging, draggedItems, endDrag } = useDragDropStore();
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleDragOver = (e: React.DragEvent, id: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) return;
    e.dataTransfer.dropEffect = 'move';
    setDragOverId(id);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverId(null);
    
    const itemsToMove = draggedItems;
    endDrag();
    
    if (itemsToMove.length === 0) return;
    
    const clearSelectionFn = useFileStore.getState().clearSelection;
    
    try {
      for (const dragItem of itemsToMove) {
        // Skip if trying to move to same location
        if (dragItem.type === 'file' && (dragItem.item as FileItem).folderId === targetFolderId) continue;
        if (dragItem.type === 'folder') {
          const folder = dragItem.item as Folder;
          if (folder.parentId === targetFolderId) continue;
          // Can't move folder into itself
          if (folder.id === targetFolderId) continue;
        }
        
        if (dragItem.type === 'file') {
          await api.patch(`/files/${dragItem.item.id}/move`, { folderId: targetFolderId });
        } else {
          await api.patch(`/folders/${dragItem.item.id}/move`, { parentId: targetFolderId });
        }
      }
      
      const targetName = targetFolderId 
        ? items.find(i => i.id === targetFolderId)?.name || 'carpeta'
        : 'Home';
      toast(`${itemsToMove.length} elemento(s) movido(s) a "${targetName}"`, 'success');
      clearSelectionFn();
      window.dispatchEvent(new CustomEvent('workzone-refresh'));
      onRefresh?.();
    } catch (error: any) {
      toast(error.response?.data?.error || 'Error al mover elementos', 'error');
    }
  };

  return (
    <nav className="flex items-center gap-1 text-sm">
      <Link
        to={basePath}
        onDragOver={(e) => handleDragOver(e, null)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, null)}
        className={cn(
          'flex items-center gap-1 text-dark-500 hover:text-dark-900 dark:hover:text-white transition-colors px-2 py-1 rounded-lg',
          isDragging && 'hover:bg-primary-100 dark:hover:bg-primary-900/30',
          dragOverId === null && isDragging && 'bg-primary-100 dark:bg-primary-900/30 ring-2 ring-primary-500'
        )}
      >
        <Home className="w-4 h-4" />
        <span>Home</span>
      </Link>

      {items.map((item, index) => (
        <div key={item.id} className="flex items-center gap-1">
          <ChevronRight className="w-4 h-4 text-dark-400" />
          {index === items.length - 1 ? (
            <span className="font-medium text-dark-900 dark:text-white px-2 py-1">
              {item.name}
            </span>
          ) : (
            <Link
              to={`${basePath}?folder=${item.id}`}
              onDragOver={(e) => handleDragOver(e, item.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, item.id)}
              className={cn(
                'text-dark-500 hover:text-dark-900 dark:hover:text-white transition-colors px-2 py-1 rounded-lg',
                isDragging && 'hover:bg-primary-100 dark:hover:bg-primary-900/30',
                dragOverId === item.id && 'bg-primary-100 dark:bg-primary-900/30 ring-2 ring-primary-500'
              )}
            >
              {item.name}
            </Link>
          )}
        </div>
      ))}
    </nav>
  );
}
