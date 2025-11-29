import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface NavItem {
  id: string;
  icon: string;
  label: string;
  path: string;
}

interface SidebarState {
  navItems: NavItem[];
  bottomNavItems: NavItem[];
  setNavItems: (items: NavItem[]) => void;
  setBottomNavItems: (items: NavItem[]) => void;
  resetToDefaults: () => void;
}

const defaultNavItems: NavItem[] = [
  { id: 'dashboard', icon: 'LayoutDashboard', label: 'Dashboard', path: '/' },
  { id: 'files', icon: 'FolderOpen', label: 'Mis archivos', path: '/files' },
  { id: 'documents', icon: 'FileText', label: 'Documentos', path: '/documents' },
  { id: 'photos', icon: 'Image', label: 'Galería', path: '/photos' },
  { id: 'music', icon: 'Music', label: 'Música', path: '/music' },
  { id: 'shared', icon: 'Users', label: 'Compartidos', path: '/shared' },
];

const defaultBottomNavItems: NavItem[] = [
  { id: 'trash', icon: 'Trash2', label: 'Papelera', path: '/trash' },
  { id: 'settings', icon: 'Settings', label: 'Configuración', path: '/settings' },
];

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      navItems: defaultNavItems,
      bottomNavItems: defaultBottomNavItems,
      setNavItems: (items) => set({ navItems: items }),
      setBottomNavItems: (items) => set({ bottomNavItems: items }),
      resetToDefaults: () =>
        set({
          navItems: defaultNavItems,
          bottomNavItems: defaultBottomNavItems,
        }),
    }),
    {
      name: 'sidebar-storage-v3',
      migrate: (persistedState: unknown) => {
        const state = persistedState as SidebarState;
        // Remove 'activity' from navItems if it exists from old storage
        if (state?.navItems) {
          state.navItems = state.navItems.filter(item => item.id !== 'activity');
        }
        if (state?.bottomNavItems) {
          state.bottomNavItems = state.bottomNavItems.filter(item => item.id !== 'activity');
        }
        return state;
      },
      version: 3,
    }
  )
);
