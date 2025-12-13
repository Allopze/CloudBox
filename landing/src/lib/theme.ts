const STORAGE_KEY = 'cloudbox-landing-theme';

export type ThemeMode = 'dark' | 'light' | 'system';

const getSystemPrefersDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;

export const getSavedThemeMode = (): ThemeMode => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === 'dark' || raw === 'light' || raw === 'system') return raw;
  return 'system';
};

export const setSavedThemeMode = (mode: ThemeMode) => {
  localStorage.setItem(STORAGE_KEY, mode);
};

export const applyThemeMode = (mode: ThemeMode) => {
  const shouldUseDark = mode === 'dark' || (mode === 'system' && getSystemPrefersDark());
  if (shouldUseDark) document.documentElement.classList.add('dark');
  else document.documentElement.classList.remove('dark');
};

