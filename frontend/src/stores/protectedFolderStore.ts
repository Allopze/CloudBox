import { create } from 'zustand';

interface ProtectedFolderState {
    // Set of folder IDs that have been unlocked in this session
    unlockedFolders: Set<string>;

    // Folder pending unlock (for showing modal)
    pendingUnlockFolder: { id: string; name: string; onSuccess?: () => void } | null;

    addUnlockedFolder: (id: string) => void;
    isUnlocked: (id: string) => boolean;
    clearUnlocked: () => void;

    setPendingUnlock: (folder: { id: string; name: string; onSuccess?: () => void } | null) => void;
}

export const useProtectedFolderStore = create<ProtectedFolderState>((set, get) => ({
    unlockedFolders: new Set(),
    pendingUnlockFolder: null,

    addUnlockedFolder: (id: string) => {
        set((state) => {
            const newSet = new Set(state.unlockedFolders);
            newSet.add(id);
            return { unlockedFolders: newSet };
        });
    },

    isUnlocked: (id: string) => {
        return get().unlockedFolders.has(id);
    },

    clearUnlocked: () => {
        set({ unlockedFolders: new Set() });
    },

    setPendingUnlock: (folder) => {
        set({ pendingUnlockFolder: folder });
    },
}));
