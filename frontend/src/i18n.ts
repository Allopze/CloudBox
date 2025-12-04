import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translation files
import enCommon from './locales/en/common.json';
import esCommon from './locales/es/common.json';
import frCommon from './locales/fr/common.json';
import deCommon from './locales/de/common.json';
import itCommon from './locales/it/common.json';
import ptCommon from './locales/pt/common.json';

// Define resources object with all languages
const resources = {
  en: { common: enCommon },
  es: { common: esCommon },
  fr: { common: frCommon },
  de: { common: deCommon },
  it: { common: itCommon },
  pt: { common: ptCommon },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    supportedLngs: ['en', 'es', 'fr', 'de', 'it', 'pt'],
    fallbackLng: 'en',
    ns: ['common'],
    defaultNS: 'common',
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    detection: {
      // Order of language detection methods
      order: ['localStorage', 'navigator', 'htmlTag'],
      // Cache user language selection in localStorage
      caches: ['localStorage'],
      // Key used in localStorage
      lookupLocalStorage: 'cloudbox-language',
    },
    debug: import.meta.env.DEV, // Enable debug only in development
  });

export default i18n;
