import { createPortal } from 'react-dom';
import { useDragDropStore } from '../../stores/dragDropStore';
import { File, Folder as FolderIcon, Image, Video, Music, FileText, Archive } from 'lucide-react';
import { FileItem } from '../../types';

const fileIcons: Record<string, typeof File> = {
  image: Image,
  video: Video,
  audio: Music,
  document: FileText,
  archive: Archive,
  default: File,
};

function getFileIcon(mimeType: string) {
  const mimeCategory = mimeType.split('/')[0];
  return fileIcons[mimeCategory] || fileIcons.default;
}

export default function DragPreview() {
  const { isDragging, draggedItems, dragPosition } = useDragDropStore();

  if (!isDragging || draggedItems.length === 0) return null;

  const firstItem = draggedItems[0];
  const isFile = firstItem.type === 'file';
  const Icon = isFile ? getFileIcon((firstItem.item as FileItem).mimeType) : FolderIcon;
  const name = firstItem.item.name;
  const count = draggedItems.length;

  return createPortal(
    <div
      className="fixed pointer-events-none z-[9999] transition-none"
      style={{
        left: dragPosition.x + 12,
        top: dragPosition.y + 12,
      }}
    >
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white dark:bg-dark-800 shadow-xl border border-dark-200 dark:border-dark-700 min-w-40 max-w-64">
        <div className="flex-shrink-0">
          {isFile ? (
            <Icon className="w-5 h-5 text-dark-400" />
          ) : (
            <FolderIcon className="w-5 h-5 text-primary-500" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-dark-900 dark:text-white truncate">
            {count > 1 ? `${count} elementos` : name}
          </p>
          {count > 1 && (
            <p className="text-xs text-dark-500 truncate">
              {name} y {count - 1} más
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
