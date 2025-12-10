import { create } from 'zustand';
import { API_URL } from '../lib/api';

export interface BrandingSettings {
  primaryColor?: string;
  logoUrl?: string;
  logoLightUrl?: string;
  logoDarkUrl?: string;
  faviconUrl?: string;
  siteName?: string;
}

interface BrandingState {
  branding: BrandingSettings;
  loading: boolean;
  loadBranding: (signal?: AbortSignal) => Promise<void>;
  setBranding: (branding: BrandingSettings) => void;
}

const defaultBranding: BrandingSettings = {
  primaryColor: '#dc2626',
  logoUrl: '',
  logoLightUrl: '',
  logoDarkUrl: '',
  faviconUrl: '',
  siteName: 'CloudBox',
};

const applyFavicon = (faviconUrl?: string) => {
  if (!faviconUrl) return;

  // Construct full URL if it's a relative path
  const fullUrl = faviconUrl.startsWith('/') ? `${API_URL.replace('/api', '')}${faviconUrl}` : faviconUrl;

  let link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = fullUrl;
};

const applyTitle = (siteName?: string) => {
  if (siteName) {
    document.title = siteName;
  }
};

const getFullUrl = (url: string | undefined): string => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  if (url.startsWith('/api')) return `${API_URL.replace('/api', '')}${url}`;
  return url;
};

export const useBrandingStore = create<BrandingState>((set) => ({
  branding: defaultBranding,
  loading: false,

  loadBranding: async (signal?: AbortSignal) => {
    set({ loading: true });
    try {
      const res = await fetch(`${API_URL}/admin/settings/branding`, {
        credentials: 'include',
        signal,
      });

      if (signal?.aborted) return;

      if (res.ok) {
        const payload = await res.json();
        const branding: BrandingSettings = {
          primaryColor: payload.primaryColor || defaultBranding.primaryColor,
          logoUrl: getFullUrl(payload.logoUrl),
          logoLightUrl: getFullUrl(payload.logoLightUrl || payload.logoUrl),
          logoDarkUrl: getFullUrl(payload.logoDarkUrl || payload.logoUrl),
          faviconUrl: getFullUrl(payload.faviconUrl),
          siteName: payload.siteName || defaultBranding.siteName,
        };
        set({ branding, loading: false });
        if (branding.faviconUrl) {
          applyFavicon(branding.faviconUrl);
        }
        applyTitle(branding.siteName);
      } else {
        set({ branding: defaultBranding, loading: false });
      }
    } catch (error) {
      if (signal?.aborted) return;
      console.error('Failed to load branding settings', error);
      set({ branding: defaultBranding, loading: false });
    }
  },

  setBranding: (branding) => {
    set({ branding });
    if (branding.faviconUrl) {
      applyFavicon(branding.faviconUrl);
    }
    applyTitle(branding.siteName);
  },
}));

