import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enCommon from './locales/en/common.json';
import enNavigation from './locales/en/navigation.json';
import enAuth from './locales/en/auth.json';
import enDashboard from './locales/en/dashboard.json';
import enPatients from './locales/en/patients.json';
import enReception from './locales/en/reception.json';
import enAppointments from './locales/en/appointments.json';
import enLanding from './locales/en/landing.json';
import enSystem from './locales/en/system.json';
import enWorkspace from './locales/en/workspace.json';
import enInsurance from './locales/en/insurance.json';
import enPayroll from './locales/en/payroll.json';
import enWorklist from './locales/en/worklist.json';
import enPatientDetail from './locales/en/patientDetail.json';
import enIntegrations from './locales/en/integrations.json';
import enAdmin from './locales/en/admin.json';
import enFacilitySettings from './locales/en/facilitySettings.json';
import enClinicalQueues from './locales/en/clinicalQueues.json';
import enGovernance from './locales/en/governance.json';
import enSettings from './locales/en/settings.json';
import enHelp from './locales/en/help.json';
import enApprovals from './locales/en/approvals.json';
import arCommon from './locales/ar/common.json';
import arNavigation from './locales/ar/navigation.json';
import arAuth from './locales/ar/auth.json';
import arDashboard from './locales/ar/dashboard.json';
import arPatients from './locales/ar/patients.json';
import arReception from './locales/ar/reception.json';
import arAppointments from './locales/ar/appointments.json';
import arLanding from './locales/ar/landing.json';
import arSystem from './locales/ar/system.json';
import arWorkspace from './locales/ar/workspace.json';
import arInsurance from './locales/ar/insurance.json';
import arPayroll from './locales/ar/payroll.json';
import arWorklist from './locales/ar/worklist.json';
import arPatientDetail from './locales/ar/patientDetail.json';
import arIntegrations from './locales/ar/integrations.json';
import arAdmin from './locales/ar/admin.json';
import arFacilitySettings from './locales/ar/facilitySettings.json';
import arClinicalQueues from './locales/ar/clinicalQueues.json';
import arGovernance from './locales/ar/governance.json';
import arSettings from './locales/ar/settings.json';
import arHelp from './locales/ar/help.json';
import arApprovals from './locales/ar/approvals.json';

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

const resources = {
    en: { common: enCommon, navigation: enNavigation, auth: enAuth, dashboard: enDashboard, patients: enPatients, reception: enReception, appointments: enAppointments, landing: enLanding, system: enSystem, workspace: enWorkspace, insurance: enInsurance, payroll: enPayroll, worklist: enWorklist, patientDetail: enPatientDetail, integrations: enIntegrations, admin: enAdmin, facilitySettings: enFacilitySettings, clinicalQueues: enClinicalQueues, governance: enGovernance, settings: enSettings, help: enHelp, approvals: enApprovals },
    ar: { common: arCommon, navigation: arNavigation, auth: arAuth, dashboard: arDashboard, patients: arPatients, reception: arReception, appointments: arAppointments, landing: arLanding, system: arSystem, workspace: arWorkspace, insurance: arInsurance, payroll: arPayroll, worklist: arWorklist, patientDetail: arPatientDetail, integrations: arIntegrations, admin: arAdmin, facilitySettings: arFacilitySettings, clinicalQueues: arClinicalQueues, governance: arGovernance, settings: arSettings, help: arHelp, approvals: arApprovals },
};

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources,
        fallbackLng: 'en',
        lng: getInitialLanguage(),
        supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
        ns: ['common', 'navigation', 'auth', 'dashboard', 'patients', 'reception', 'appointments', 'landing', 'system', 'workspace', 'insurance', 'payroll', 'worklist', 'patientDetail', 'integrations', 'admin', 'facilitySettings', 'clinicalQueues', 'governance', 'settings', 'help', 'approvals'],
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
