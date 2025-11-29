import { create } from 'zustand';
import type { FileItem, Folder } from '../types';

interface FileState {
  selectedItems: Set<string>;
  viewMode: 'grid' | 'list';
  sortBy: 'name' | 'date' | 'size' | 'type';
  sortOrder: 'asc' | 'desc';
  clipboard: {
    items: (FileItem | Folder)[];
    operation: 'copy' | 'cut' | null;
  };

  breadcrumbs: { id: string; name: string }[];
  activeTab: 'all' | 'favorites' | 'videos' | 'screenshots' | 'albums';

  toggleSelection: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;
  setViewMode: (mode: 'grid' | 'list') => void;
  setSortBy: (sort: 'name' | 'date' | 'size' | 'type') => void;
  setSortOrder: (order: 'asc' | 'desc') => void;
  setBreadcrumbs: (crumbs: { id: string; name: string }[]) => void;
  setActiveTab: (tab: 'all' | 'favorites' | 'videos' | 'screenshots' | 'albums') => void;
  copyToClipboard: (items: (FileItem | Folder)[]) => void;
  cutToClipboard: (items: (FileItem | Folder)[]) => void;
  clearClipboard: () => void;
}

export const useFileStore = create<FileState>((set) => ({
  selectedItems: new Set(),
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
      return { selectedItems: newSelection };
    });
  },

  selectAll: (ids) => {
    set({ selectedItems: new Set(ids) });
  },

  clearSelection: () => {
    set({ selectedItems: new Set() });
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
