import { create } from 'zustand';
import { API_URL } from '../lib/api';

export interface BrandingSettings {
  primaryColor?: string;
  logoUrl?: string;
  logoLightUrl?: string;
  logoDarkUrl?: string;
  faviconUrl?: string;
  siteName?: string;
  customCss?: string;
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

// Convert hex to HSL
const hexToHSL = (hex: string): { h: number; s: number; l: number } => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { h: 0, s: 84, l: 51 }; // Default red

  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
};

// Generate color palette and apply as CSS variables
const applyPrimaryColor = (hexColor?: string) => {
  if (!hexColor) return;

  const { h, s } = hexToHSL(hexColor);
  const root = document.documentElement;

  // Generate palette with fixed lightness values for each shade
  const palette: Record<string, number> = {
    '50': 97,
    '100': 94,
    '200': 86,
    '300': 77,
    '400': 65,
    '500': 55,
    '600': 45,
    '700': 38,
    '800': 32,
    '900': 26,
    '950': 15,
  };

  Object.entries(palette).forEach(([shade, lightness]) => {
    root.style.setProperty(`--color-primary-${shade}`, `${h} ${s}% ${lightness}%`);
  });

  // Also set the base color
  root.style.setProperty('--color-primary', hexColor);
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

const applyCustomCss = (customCss?: string) => {
  const styleId = 'custom-branding-css';
  let styleElement = document.getElementById(styleId) as HTMLStyleElement | null;

  if (!customCss) {
    // Remove existing custom CSS if any
    if (styleElement) {
      styleElement.remove();
    }
    return;
  }

  // Create or update the style element
  if (!styleElement) {
    styleElement = document.createElement('style');
    styleElement.id = styleId;
    document.head.appendChild(styleElement);
  }

  styleElement.textContent = customCss;
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
          customCss: payload.customCss,
        };
        set({ branding, loading: false });
        applyPrimaryColor(branding.primaryColor);
        if (branding.faviconUrl) {
          applyFavicon(branding.faviconUrl);
        }
        applyTitle(branding.siteName);
        applyCustomCss(branding.customCss);
      } else {
        set({ branding: defaultBranding, loading: false });
        applyPrimaryColor(defaultBranding.primaryColor);
      }
    } catch (error) {
      if (signal?.aborted) return;
      console.error('Failed to load branding settings', error);
      set({ branding: defaultBranding, loading: false });
      applyPrimaryColor(defaultBranding.primaryColor);
    }
  },

  setBranding: (branding) => {
    set({ branding });
    applyPrimaryColor(branding.primaryColor);
    if (branding.faviconUrl) {
      applyFavicon(branding.faviconUrl);
    }
    applyTitle(branding.siteName);
    applyCustomCss(branding.customCss);
  },
}));
