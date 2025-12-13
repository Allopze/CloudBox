import { API_ORIGIN } from './env';

export type BrandingSettings = {
  primaryColor?: string;
  logoUrl?: string;
  logoLightUrl?: string;
  logoDarkUrl?: string;
  faviconUrl?: string;
  siteName?: string;
};

export const resolveAssetUrl = (url?: string) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  if (url.startsWith('/api')) return `${API_ORIGIN}${url}`;
  return url;
};

export const applyFavicon = (faviconUrl?: string) => {
  const fullUrl = resolveAssetUrl(faviconUrl);
  if (!fullUrl) return;

  let link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = fullUrl;
};

export const applyTitle = (siteName?: string) => {
  if (siteName) document.title = siteName;
};

