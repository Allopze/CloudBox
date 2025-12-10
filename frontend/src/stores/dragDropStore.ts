import { create } from 'zustand';
import type { FileItem, Folder } from '../types';

export type DragItem = {
  type: 'file' | 'folder';
  item: FileItem | Folder;
};

interface DragDropState {
  isDragging: boolean;
  draggedItems: DragItem[];

  startDrag: (items: DragItem[]) => void;
  endDrag: () => void;
}

// Store position outside of React state to avoid re-renders
// This is accessed directly by the DragPreview component via ref
let dragPositionRef = { x: 0, y: 0 };
let dragPreviewElement: HTMLElement | null = null;

export function setDragPreviewRef(element: HTMLElement | null) {
  dragPreviewElement = element;
}

export function updateDragPosition(x: number, y: number) {
  dragPositionRef.x = x;
  dragPositionRef.y = y;

  // Directly update DOM transform - no React re-render needed
  if (dragPreviewElement) {
    dragPreviewElement.style.transform = `translate(${x + 12}px, ${y + 12}px)`;
  }
}

export function getDragPosition() {
  return dragPositionRef;
}

export const useDragDropStore = create<DragDropState>((set) => ({
  isDragging: false,
  draggedItems: [],

  startDrag: (items) => {
    set({ isDragging: true, draggedItems: items });
  },

  endDrag: () => {
    dragPositionRef = { x: 0, y: 0 };
    set({ isDragging: false, draggedItems: [] });
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
