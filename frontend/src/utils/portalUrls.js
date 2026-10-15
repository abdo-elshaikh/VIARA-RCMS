const trimTrailingSlash = (value = '') => String(value).replace(/\/+$/, '');

const getCurrentOrigin = () => {
    if (typeof window === 'undefined') return '';
    return window.location.origin;
};

export const getPortalPublicOrigin = () => trimTrailingSlash(
    (typeof window !== 'undefined' && window.__VIARA_CONFIG__?.portalPublicUrl)
    || import.meta.env.VITE_PORTAL_PUBLIC_URL
    || import.meta.env.VITE_PORTAL_URL
    || getCurrentOrigin()
);

export const getPortalUrl = (path = '') => `${getPortalPublicOrigin()}${path.startsWith('/') ? path : `/${path}`}`;

export const getPatientPortalHomeUrl = () => getPortalUrl('/patient');

export const getPatientPortalLoginUrl = () => getPortalUrl('/patient/login');

export const getPatientPortalDashboardUrl = () => getPortalUrl('/patient/dashboard');

export const getDoctorPortalHomeUrl = () => getPortalUrl('/doctor');

export const getDoctorPortalLoginUrl = () => getPortalUrl('/doctor/login');

export const getDoctorPortalDashboardUrl = () => getPortalUrl('/doctor/dashboard');
