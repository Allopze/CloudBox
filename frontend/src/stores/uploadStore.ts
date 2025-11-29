import { create } from 'zustand';
import type { UploadProgress } from '../types';

interface UploadState {
  uploads: Map<string, UploadProgress>;
  isUploading: boolean;
  
  addUpload: (upload: UploadProgress) => void;
  updateUpload: (id: string, data: Partial<UploadProgress>) => void;
  removeUpload: (id: string) => void;
  clearCompleted: () => void;
}

export const useUploadStore = create<UploadState>((set) => ({
  uploads: new Map(),
  isUploading: false,

  addUpload: (upload) => {
    set((state) => {
      const newUploads = new Map(state.uploads);
      newUploads.set(upload.id, upload);
      return { uploads: newUploads, isUploading: true };
    });
  },

  updateUpload: (id, data) => {
    set((state) => {
      const newUploads = new Map(state.uploads);
      const existing = newUploads.get(id);
      if (existing) {
        newUploads.set(id, { ...existing, ...data });
      }
      
      const hasActive = Array.from(newUploads.values()).some(
        (u) => u.status === 'pending' || u.status === 'uploading'
      );
      
      return { uploads: newUploads, isUploading: hasActive };
    });
  },

  removeUpload: (id) => {
    set((state) => {
      const newUploads = new Map(state.uploads);
      newUploads.delete(id);
      
      const hasActive = Array.from(newUploads.values()).some(
        (u) => u.status === 'pending' || u.status === 'uploading'
      );
      
      return { uploads: newUploads, isUploading: hasActive };
    });
  },

  clearCompleted: () => {
    set((state) => {
      const newUploads = new Map(state.uploads);
      for (const [id, upload] of newUploads) {
        if (upload.status === 'completed' || upload.status === 'error') {
          newUploads.delete(id);
        }
      }
      return { uploads: newUploads };
    });
  },
}));
