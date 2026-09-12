import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const localeLoaders = import.meta.glob('./locales/*/*.json');

export const SUPPORTED_LANGUAGES = [
    { code: 'en', label: 'English', dir: 'ltr' },
    { code: 'ar', label: '\u0627\u0644\u0639\u0631\u0628\u064a\u0629', dir: 'rtl' },
];

export const RTL_LANGUAGES = ['ar'];

export const getDirection = (lng = 'en') => (RTL_LANGUAGES.includes(lng.split('-')[0]) ? 'rtl' : 'ltr');
const getSupportedLanguage = (lng) => {
    const code = String(lng || '').split('-')[0];
    return SUPPORTED_LANGUAGES.some((language) => language.code === code) ? code : undefined;
};

const getInitialLanguage = () => {
    if (typeof localStorage === 'undefined') return undefined;
    try {
        const detectedLanguage = getSupportedLanguage(localStorage.getItem('VIARA_lang'));
        if (detectedLanguage) return detectedLanguage;
        const preferences = JSON.parse(localStorage.getItem('VIARA_preferences') || '{}');
        return getSupportedLanguage(preferences.language);
    } catch {
        return undefined;
    }
};

const localeBackend = {
    type: 'backend',
    init() {},
    read(language, namespace, callback) {
        const languageCode = getSupportedLanguage(language) || 'en';
        const loader = localeLoaders[`./locales/${languageCode}/${namespace}.json`];

        if (!loader) {
            callback(new Error(`Missing locale resource: ${languageCode}/${namespace}`), false);
            return;
        }

        loader()
            .then((module) => callback(null, module.default || module))
            .catch((error) => callback(error, false));
    },
};

await i18n
    .use(LanguageDetector)
    .use(localeBackend)
    .use(initReactI18next)
    .init({
        fallbackLng: false,
        lng: getInitialLanguage(),
        supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
        load: 'languageOnly',
        ns: ['common', 'navigation', 'auth', 'dashboard', 'patients', 'reception', 'appointments', 'landing', 'display', 'system', 'workspace', 'insurance', 'payroll', 'worklist', 'patientDetail', 'integrations', 'admin', 'facilitySettings', 'clinicalQueues', 'governance', 'settings', 'help', 'approvals'],
        defaultNS: 'common',
        interpolation: {
            escapeValue: false, // React already escapes
        },
        detection: {
            order: ['localStorage', 'navigator', 'htmlTag'],
            lookupLocalStorage: 'VIARA_lang',
            caches: ['localStorage'],
        },
    });

// Keep <html> dir/lang in sync with the active language.
const applyDocumentDirection = (lng) => {
    const language = (lng || 'en').split('-')[0];
    const dir = getDirection(language);
    document.documentElement.setAttribute('lang', language);
    document.documentElement.setAttribute('dir', dir);
};

applyDocumentDirection(i18n.resolvedLanguage || i18n.language || 'en');
i18n.on('languageChanged', applyDocumentDirection);

export default i18n;
