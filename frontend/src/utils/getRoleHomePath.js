import { getDoctorPortalDashboardUrl, getPatientPortalDashboardUrl } from './portalUrls';

export const getRoleHomePath = (user, isAuthenticated = Boolean(user)) => {
    if (!isAuthenticated || !user) return '/login';

    const roleHome = {
        Admin: '/admin',
        Radiologist: '/worklist',
        Receptionist: '/reception',
        Cashier: '/reception',
        Accountant: '/financials',
        HR: '/hr',
        Marketing: '/marketing',
        Technician: '/modality',
        Nurse: '/nurse',
        Insurance_Staff: '/insurance',
        Patient: getPatientPortalDashboardUrl(),
        Doctor: getDoctorPortalDashboardUrl(),
        Referring_Doctor: getDoctorPortalDashboardUrl(),
    };

    return roleHome[user.role] || '/dashboard';
};

export default getRoleHomePath;
