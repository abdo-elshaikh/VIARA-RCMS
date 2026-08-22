import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enCommon from './locales/en/common.json';
import enAuth from './locales/en/auth.json';
import enLanding from './locales/en/landing.json';
import enSystem from './locales/en/system.json';
import enPortal from './locales/en/portal.json';
import arCommon from './locales/ar/common.json';
import arAuth from './locales/ar/auth.json';
import arLanding from './locales/ar/landing.json';
import arSystem from './locales/ar/system.json';
import arPortal from './locales/ar/portal.json';

export interface SupportedLanguage {
  code: 'en' | 'ar';
  label: string;
  dir: 'ltr' | 'rtl';
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'ar', label: 'العربية', dir: 'rtl' },
];

export const RTL_LANGUAGES = ['ar'];

export const getDirection = (lng = 'en'): 'ltr' | 'rtl' => (RTL_LANGUAGES.includes(lng.split('-')[0]) ? 'rtl' : 'ltr');

const resources = {
  en: { common: enCommon, auth: enAuth, landing: enLanding, system: enSystem, portal: enPortal },
  ar: { common: arCommon, auth: arAuth, landing: arLanding, system: arSystem, portal: arPortal },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
    ns: ['common', 'auth', 'landing', 'system', 'portal'],
    defaultNS: 'common',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      lookupLocalStorage: 'VIARA_lang',
      caches: ['localStorage'],
    },
  });

const applyDocumentDirection = (lng?: string) => {
  if (typeof document === 'undefined') return;
  const language = (lng || 'en').split('-')[0];
  const dir = getDirection(language);
  document.documentElement.setAttribute('lang', language);
  document.documentElement.setAttribute('dir', dir);
};

applyDocumentDirection(i18n.resolvedLanguage || i18n.language || 'en');
i18n.on('languageChanged', applyDocumentDirection);

export default i18n;
