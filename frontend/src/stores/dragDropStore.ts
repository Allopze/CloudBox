import { create } from 'zustand';
import type { FileItem, Folder } from '../types';

export type DragItem = {
  type: 'file' | 'folder';
  item: FileItem | Folder;
};

interface DragDropState {
  isDragging: boolean;
  draggedItems: DragItem[];
  dragPosition: { x: number; y: number };
  
  startDrag: (items: DragItem[]) => void;
  updatePosition: (x: number, y: number) => void;
  endDrag: () => void;
}

export const useDragDropStore = create<DragDropState>((set) => ({
  isDragging: false,
  draggedItems: [],
  dragPosition: { x: 0, y: 0 },
  
  startDrag: (items) => {
    set({ isDragging: true, draggedItems: items });
  },
  
  updatePosition: (x, y) => {
    set({ dragPosition: { x, y } });
  },
  
  endDrag: () => {
    set({ isDragging: false, draggedItems: [], dragPosition: { x: 0, y: 0 } });
  },
}));

// Helper to check if a file matches a category
export function fileMatchesCategory(file: FileItem, category: string): boolean {
  const mimeType = file.mimeType.toLowerCase();
  
  switch (category) {
    case 'photos':
    case 'image':
      return mimeType.startsWith('image/');
    case 'music':
    case 'audio':
      return mimeType.startsWith('audio/');
    case 'documents':
    case 'document':
      return (
        mimeType.startsWith('text/') ||
        mimeType.includes('pdf') ||
        mimeType.includes('document') ||
        mimeType.includes('spreadsheet') ||
        mimeType.includes('presentation') ||
        mimeType.includes('word') ||
        mimeType.includes('excel') ||
        mimeType.includes('powerpoint')
      );
    case 'files':
      return true; // All files can go to Files
    default:
      return false;
  }
}

// Get the category path from sidebar path
export function getCategoryFromPath(path: string): string | null {
  switch (path) {
    case '/photos':
      return 'photos';
    case '/music':
      return 'music';
    case '/documents':
      return 'documents';
    case '/files':
      return 'files';
    default:
      return null;
  }
}
