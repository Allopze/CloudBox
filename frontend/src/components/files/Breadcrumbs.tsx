import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDroppable } from '@dnd-kit/core';
import { ChevronRight, Home } from 'lucide-react';
import { useDragDropStore } from '../../stores/dragDropStore';
import { cn } from '../../lib/utils';

interface BreadcrumbItem {
  id: string;
  name: string;
}

interface BreadcrumbsProps {
  items?: BreadcrumbItem[];
  basePath?: string;
  onRefresh?: () => void;
}

// Droppable breadcrumb item for intermediate folders
function DroppableBreadcrumbItem({ item, basePath }: { item: BreadcrumbItem; basePath: string }) {
  const { isDragging } = useDragDropStore();
  
  const { setNodeRef, isOver } = useDroppable({
    id: `breadcrumb-${item.id}`,
    data: { type: 'breadcrumb', folderId: item.id, name: item.name },
  });

  return (
    <Link
      ref={setNodeRef}
      to={`${basePath}?folder=${item.id}`}
      className={cn(
        'text-dark-500 hover:text-dark-900 dark:hover:text-white transition-colors px-2 py-1 rounded-lg',
        isDragging && 'hover:bg-primary-100 dark:hover:bg-primary-900/30',
        isOver && 'bg-primary-100 dark:bg-primary-900/30 ring-2 ring-primary-500'
      )}
    >
      {item.name}
    </Link>
  );
}

// Droppable home breadcrumb
function DroppableHomeBreadcrumb({ basePath }: { basePath: string }) {
  const { t } = useTranslation();
  const { isDragging } = useDragDropStore();
  
  const { setNodeRef, isOver } = useDroppable({
    id: 'breadcrumb-root',
    data: { type: 'breadcrumb', folderId: null, name: 'Home' },
  });

  return (
    <Link
      ref={setNodeRef}
      to={basePath}
      className={cn(
        'flex items-center gap-1 text-dark-500 hover:text-dark-900 dark:hover:text-white transition-colors px-2 py-1 rounded-lg',
        isDragging && 'hover:bg-primary-100 dark:hover:bg-primary-900/30',
        isOver && 'bg-primary-100 dark:bg-primary-900/30 ring-2 ring-primary-500'
      )}
    >
      <Home className="w-4 h-4" />
      <span>{t('breadcrumbs.home')}</span>
    </Link>
  );
}

export default function Breadcrumbs({ items = [], basePath = '/files' }: BreadcrumbsProps) {
  return (
    <nav className="flex items-center gap-1 text-sm">
      <DroppableHomeBreadcrumb basePath={basePath} />

      {items.map((item, index) => (
        <div key={item.id} className="flex items-center gap-1">
          <ChevronRight className="w-4 h-4 text-dark-400" />
          {index === items.length - 1 ? (
            <span className="font-medium text-dark-900 dark:text-white px-2 py-1">
              {item.name}
            </span>
          ) : (
            <DroppableBreadcrumbItem item={item} basePath={basePath} />
          )}
        </div>
      ))}
    </nav>
  );
}
