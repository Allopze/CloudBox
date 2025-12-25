import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface NavItem {
  id: string;
  icon: string;
  labelKey: string; // Translation key instead of static label
  path: string;
}

export interface AdminNavItem {
  id: string;
  icon: string;
  labelKey: string;
}

interface SidebarState {
  navItems: NavItem[];
  bottomNavItems: NavItem[];
  adminNavItems: AdminNavItem[];
  setNavItems: (items: NavItem[]) => void;
  setBottomNavItems: (items: NavItem[]) => void;
  setAdminNavItems: (items: AdminNavItem[]) => void;
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

export const defaultAdminNavItems: AdminNavItem[] = [
  { id: 'overview', icon: 'LayoutDashboard', labelKey: 'sidebar.admin.overview' },
  { id: 'users', icon: 'Users', labelKey: 'sidebar.admin.users' },
  { id: 'settings', icon: 'Settings', labelKey: 'sidebar.admin.settings' },
  { id: 'email', icon: 'Mail', labelKey: 'sidebar.admin.email' },
  { id: 'branding', icon: 'Palette', labelKey: 'sidebar.admin.branding' },
  { id: 'file-icons', icon: 'FileType', labelKey: 'sidebar.admin.fileIcons' },
  { id: 'legal', icon: 'FileText', labelKey: 'sidebar.admin.legal' },
  { id: 'activity', icon: 'Activity', labelKey: 'sidebar.admin.activity' },
];

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      navItems: defaultNavItems,
      bottomNavItems: defaultBottomNavItems,
      adminNavItems: defaultAdminNavItems,
      setNavItems: (items) => set({ navItems: items }),
      setBottomNavItems: (items) => set({ bottomNavItems: items }),
      setAdminNavItems: (items) => set({ adminNavItems: items }),
      resetToDefaults: () =>
        set({
          navItems: defaultNavItems,
          bottomNavItems: defaultBottomNavItems,
          adminNavItems: defaultAdminNavItems,
        }),
    }),
    {
      name: 'sidebar-storage-v5',
      migrate: (_persistedState: unknown) => {
        // Always reset to defaults to use new labelKey format
        return {
          navItems: defaultNavItems,
          bottomNavItems: defaultBottomNavItems,
          adminNavItems: defaultAdminNavItems,
        };
      },
      version: 5,
    }
  )
);
