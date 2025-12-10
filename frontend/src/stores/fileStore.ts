import { create } from 'zustand';
import type { FileItem, Folder } from '../types';

interface FileState {
  selectedItems: Set<string>;
  lastSelectedId: string | null;
  viewMode: 'grid' | 'list';
  sortBy: 'name' | 'date' | 'size' | 'type' | 'createdAt' | 'updatedAt';
  sortOrder: 'asc' | 'desc';
  clipboard: {
    items: (FileItem | Folder)[];
    operation: 'copy' | 'cut' | null;
  };

  breadcrumbs: { id: string; name: string }[];
  activeTab: 'all' | 'favorites' | 'videos' | 'screenshots' | 'albums';

  toggleSelection: (id: string) => void;
  addToSelection: (id: string) => void;
  removeFromSelection: (id: string) => void;
  selectRange: (ids: string[], targetId: string) => void;
  selectSingle: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;
  setViewMode: (mode: 'grid' | 'list') => void;
  setSortBy: (sort: 'name' | 'date' | 'size' | 'type' | 'createdAt' | 'updatedAt') => void;
  setSortOrder: (order: 'asc' | 'desc') => void;
  setBreadcrumbs: (crumbs: { id: string; name: string }[]) => void;
  setActiveTab: (tab: 'all' | 'favorites' | 'videos' | 'screenshots' | 'albums') => void;
  copyToClipboard: (items: (FileItem | Folder)[]) => void;
  cutToClipboard: (items: (FileItem | Folder)[]) => void;
  clearClipboard: () => void;
}

export const useFileStore = create<FileState>((set) => ({
  selectedItems: new Set(),
  lastSelectedId: null,
  viewMode: 'grid',
  sortBy: 'name',
  sortOrder: 'asc',
  breadcrumbs: [],
  activeTab: 'all',
  clipboard: {
    items: [],
    operation: null,
  },

  toggleSelection: (id) => {
    set((state) => {
      const newSelection = new Set(state.selectedItems);
      if (newSelection.has(id)) {
        newSelection.delete(id);
      } else {
        newSelection.add(id);
      }
      return { selectedItems: newSelection, lastSelectedId: id };
    });
  },

  addToSelection: (id) => {
    set((state) => {
      const newSelection = new Set(state.selectedItems);
      newSelection.add(id);
      return { selectedItems: newSelection, lastSelectedId: id };
    });
  },

  removeFromSelection: (id) => {
    set((state) => {
      const newSelection = new Set(state.selectedItems);
      newSelection.delete(id);
      return { selectedItems: newSelection };
    });
  },

  selectRange: (ids, targetId) => {
    set((state) => {
      const lastId = state.lastSelectedId;
      if (!lastId) {
        return { selectedItems: new Set([targetId]), lastSelectedId: targetId };
      }

      const lastIndex = ids.indexOf(lastId);
      const targetIndex = ids.indexOf(targetId);

      if (lastIndex === -1 || targetIndex === -1) {
        return { selectedItems: new Set([targetId]), lastSelectedId: targetId };
      }

      const start = Math.min(lastIndex, targetIndex);
      const end = Math.max(lastIndex, targetIndex);
      const rangeIds = ids.slice(start, end + 1);

      const newSelection = new Set(state.selectedItems);
      rangeIds.forEach(id => newSelection.add(id));

      return { selectedItems: newSelection, lastSelectedId: targetId };
    });
  },

  selectSingle: (id) => {
    set({ selectedItems: new Set([id]), lastSelectedId: id });
  },

  selectAll: (ids) => {
    set({ selectedItems: new Set(ids) });
  },

  clearSelection: () => {
    set({ selectedItems: new Set(), lastSelectedId: null });
  },

  setViewMode: (mode) => {
    set({ viewMode: mode });
  },

  setSortBy: (sort) => {
    set({ sortBy: sort });
  },

  setSortOrder: (order) => {
    set({ sortOrder: order });
  },

  setBreadcrumbs: (crumbs) => {
    set({ breadcrumbs: crumbs });
  },

  setActiveTab: (tab) => {
    set({ activeTab: tab });
  },

  copyToClipboard: (items) => {
    set({ clipboard: { items, operation: 'copy' } });
  },

  cutToClipboard: (items) => {
    set({ clipboard: { items, operation: 'cut' } });
  },

  clearClipboard: () => {
    set({ clipboard: { items: [], operation: null } });
  },
}));
