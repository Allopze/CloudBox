import { create } from 'zustand';

export interface GlobalOperation {
  id: string;
  type: 'upload' | 'download' | 'move' | 'copy' | 'delete' | 'compress';
  title: string;
  totalItems: number;
  completedItems: number;
  currentItem?: string;
  status: 'pending' | 'in-progress' | 'completed' | 'error' | 'cancelled';
  error?: string;
  startTime: number;
  endTime?: number;
}

interface GlobalProgressState {
  operations: GlobalOperation[];
  isMinimized: boolean;

  addOperation: (operation: Omit<GlobalOperation, 'status' | 'completedItems' | 'startTime'>) => string;
  updateOperation: (id: string, updates: Partial<GlobalOperation>) => void;
  incrementProgress: (id: string, currentItem?: string) => void;
  completeOperation: (id: string) => void;
  failOperation: (id: string, error: string) => void;
  cancelOperation: (id: string) => void;
  removeOperation: (id: string) => void;
  clearCompleted: () => void;
  toggleMinimize: () => void;
}

export const useGlobalProgressStore = create<GlobalProgressState>((set, get) => ({
  operations: [],
  isMinimized: false,

  addOperation: (operation) => {
    const id = operation.id || Math.random().toString(36).substring(2);
    const newOperation: GlobalOperation = {
      ...operation,
      id,
      status: 'pending',
      completedItems: 0,
      startTime: Date.now(),
    };

    set((state) => ({
      operations: [...state.operations, newOperation],
      isMinimized: false,
    }));

    // Auto-start
    setTimeout(() => {
      get().updateOperation(id, { status: 'in-progress' });
    }, 100);

    return id;
  },

  updateOperation: (id, updates) => {
    set((state) => ({
      operations: state.operations.map((op) =>
        op.id === id ? { ...op, ...updates } : op
      ),
    }));
  },

  incrementProgress: (id, currentItem) => {
    set((state) => ({
      operations: state.operations.map((op) =>
        op.id === id
          ? {
              ...op,
              completedItems: op.completedItems + 1,
              currentItem,
            }
          : op
      ),
    }));
  },

  completeOperation: (id) => {
    set((state) => ({
      operations: state.operations.map((op) =>
        op.id === id
          ? {
              ...op,
              status: 'completed',
              completedItems: op.totalItems,
              endTime: Date.now(),
            }
          : op
      ),
    }));

    // Auto-remove completed operations after 5 seconds
    setTimeout(() => {
      get().removeOperation(id);
    }, 5000);
  },

  failOperation: (id, error) => {
    set((state) => ({
      operations: state.operations.map((op) =>
        op.id === id
          ? {
              ...op,
              status: 'error',
              error,
              endTime: Date.now(),
            }
          : op
      ),
    }));
  },

  cancelOperation: (id) => {
    set((state) => ({
      operations: state.operations.map((op) =>
        op.id === id
          ? {
              ...op,
              status: 'cancelled',
              endTime: Date.now(),
            }
          : op
      ),
    }));
  },

  removeOperation: (id) => {
    set((state) => ({
      operations: state.operations.filter((op) => op.id !== id),
    }));
  },

  clearCompleted: () => {
    set((state) => ({
      operations: state.operations.filter(
        (op) => op.status !== 'completed' && op.status !== 'cancelled'
      ),
    }));
  },

  toggleMinimize: () => {
    set((state) => ({ isMinimized: !state.isMinimized }));
  },
}));
