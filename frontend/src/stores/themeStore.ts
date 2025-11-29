import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ThemeState {
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (dark: boolean) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      isDark: window.matchMedia('(prefers-color-scheme: dark)').matches,

      toggleTheme: () => {
        set((state) => ({ isDark: !state.isDark }));
      },

      setTheme: (dark) => {
        set({ isDark: dark });
      },
    }),
    {
      name: 'theme-storage',
    }
  )
);
