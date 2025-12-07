import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface NavItem {
  id: string;
  icon: string;
  labelKey: string; // Translation key instead of static label
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
  { id: 'dashboard', icon: 'LayoutDashboard', labelKey: 'sidebar.dashboard', path: '/' },
  { id: 'files', icon: 'FolderOpen', labelKey: 'sidebar.files', path: '/files' },
  { id: 'documents', icon: 'FileText', labelKey: 'sidebar.documents', path: '/documents' },
  { id: 'photos', icon: 'Image', labelKey: 'sidebar.photos', path: '/photos' },
  { id: 'music', icon: 'Music', labelKey: 'sidebar.music', path: '/music' },
  { id: 'shared', icon: 'Users', labelKey: 'sidebar.shared', path: '/shared' },
];

const defaultBottomNavItems: NavItem[] = [
  { id: 'trash', icon: 'Trash2', labelKey: 'sidebar.trash', path: '/trash' },
  { id: 'settings', icon: 'Settings', labelKey: 'sidebar.settings', path: '/settings' },
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
      name: 'sidebar-storage-v4',
      migrate: (_persistedState: unknown) => {
        // Always reset to defaults to use new labelKey format
        return {
          navItems: defaultNavItems,
          bottomNavItems: defaultBottomNavItems,
        };
      },
      version: 4,
    }
  )
);
