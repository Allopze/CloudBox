import { create } from 'zustand';
import { API_URL } from '../lib/api';

export interface BrandingSettings {
  primaryColor?: string;
  logoUrl?: string;
  logoLightUrl?: string;
  logoDarkUrl?: string;
  faviconUrl?: string;
}

interface BrandingState {
  branding: BrandingSettings;
  loading: boolean;
  loadBranding: () => Promise<void>;
  setBranding: (branding: BrandingSettings) => void;
}

const defaultBranding: BrandingSettings = {
  primaryColor: '#dc2626',
  logoUrl: '',
  logoLightUrl: '',
  logoDarkUrl: '',
  faviconUrl: '',
};

const applyFavicon = (faviconUrl?: string) => {
  if (!faviconUrl) return;
  let link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = faviconUrl;
};

export const useBrandingStore = create<BrandingState>((set) => ({
  branding: defaultBranding,
  loading: false,

  loadBranding: async () => {
    set({ loading: true });
    try {
      // base assets served publicly (no auth)
      const assetBranding: BrandingSettings = {
        ...defaultBranding,
        logoLightUrl: `${API_URL}/admin/branding/logo-light`,
        logoDarkUrl: `${API_URL}/admin/branding/logo-dark`,
        faviconUrl: `${API_URL}/admin/branding/favicon`,
      };

      const res = await fetch(`${API_URL}/admin/settings/branding`, {
        credentials: 'include',
      });

      if (res.ok) {
        const payload = await res.json();
        const branding: BrandingSettings = {
          ...assetBranding,
          ...payload,
          logoLightUrl: payload.logoLightUrl || payload.logoUrl || assetBranding.logoLightUrl,
          logoDarkUrl: payload.logoDarkUrl || payload.logoUrl || assetBranding.logoDarkUrl,
        };
        set({ branding, loading: false });
        if (branding.faviconUrl) {
          applyFavicon(branding.faviconUrl);
        }
      } else {
        set({ branding: assetBranding, loading: false });
        if (assetBranding.faviconUrl) {
          applyFavicon(assetBranding.faviconUrl);
        }
      }
    } catch (error) {
      console.error('Failed to load branding settings', error);
      const fallback: BrandingSettings = {
        ...defaultBranding,
        logoLightUrl: `${API_URL}/admin/branding/logo-light`,
        logoDarkUrl: `${API_URL}/admin/branding/logo-dark`,
        faviconUrl: `${API_URL}/admin/branding/favicon`,
      };
      set({ branding: fallback, loading: false });
      if (fallback.faviconUrl) {
        applyFavicon(fallback.faviconUrl);
      }
    }
  },

  setBranding: (branding) => {
    set({ branding });
    if (branding.faviconUrl) {
      applyFavicon(branding.faviconUrl);
    }
  },
}));
