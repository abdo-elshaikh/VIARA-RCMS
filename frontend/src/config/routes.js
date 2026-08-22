// Route access and discoverability metadata shared by routing and navigation.
const STAFF_LEAVE_ROLES = ['Admin', 'Radiologist', 'Receptionist', 'Cashier', 'Accountant', 'HR', 'Technician', 'Nurse', 'Insurance_Staff', 'Marketing'];

export const ROUTE_METADATA = {
    '/print/sticker/:id': { roles: ['Admin', 'Receptionist', 'Radiologist', 'Technician', 'Nurse'] },
    '/print/receipt/:id': { roles: ['Admin', 'Receptionist', 'Radiologist', 'Technician', 'Nurse'] },
    '/print/invoice/:id': { roles: ['Admin', 'Receptionist', 'Cashier', 'Accountant'] },
    '/dashboard': { roles: ['Admin', 'Radiologist', 'Receptionist', 'Cashier', 'Accountant', 'HR', 'Technician', 'Nurse', 'Insurance_Staff', 'Marketing'], nav: { key: 'dashboard', iconId: 'LayoutDashboard', category: 'clinical' }, search: true },
    '/help': { roles: ['Admin', 'Radiologist', 'Receptionist', 'Cashier', 'Accountant', 'HR', 'Technician', 'Nurse', 'Insurance_Staff', 'Marketing'], nav: { key: 'help', iconId: 'HelpCircle', category: 'system' } },
    '/admin': { roles: ['Admin'], nav: { key: 'analytics', iconId: 'FileBarChart', category: 'management' } },
    '/users': { roles: ['Admin', 'HR'], nav: { key: 'users', iconId: 'Users', category: 'management' }, search: true },
    '/users/:userId': { roles: ['Admin', 'HR', 'Receptionist', 'Radiologist', 'Technician', 'Nurse', 'Cashier', 'Accountant', 'Insurance_Staff', 'Marketing'] },
    '/referring-doctors': { roles: ['Receptionist', 'Admin', 'Accountant'], nav: { key: 'referringDoctors', iconId: 'UserCircle', category: 'clinical' } },
    '/referring-doctors/:doctorId': { roles: ['Receptionist', 'Admin', 'Accountant'] },
    '/pacs/viewer': { roles: ['Radiologist', 'Technician', 'Admin'] },
    '/pacs/reconciliation': { roles: ['Radiologist', 'Technician', 'Admin'], nav: { key: 'pacsReconciliation', iconId: 'Monitor', category: 'clinical' } },
    '/settings': { roles: ['Admin', 'Radiologist', 'Receptionist', 'Cashier', 'Accountant', 'HR', 'Technician', 'Nurse', 'Insurance_Staff', 'Marketing'], nav: { key: 'settings', iconId: 'Settings', category: 'system' }, search: [{ key: 'settings', to: '/settings' }, { key: 'roles', to: '/settings?tab=roles' }] },
    '/profile': { roles: ['Developer', 'Admin', 'Radiologist', 'Receptionist', 'Cashier', 'Accountant', 'HR', 'Technician', 'Nurse', 'Insurance_Staff', 'Marketing'], search: [{ key: 'profile', to: '/profile' }, { key: 'accountSecurity', to: '/profile?section=security' }, { key: 'leave', to: '/profile?section=leave' }] },
    '/notifications': { roles: ['Developer', 'Admin', 'Receptionist', 'HR', 'Marketing'], nav: { key: 'notifications', iconId: 'Bell', category: 'clinical' } },
    '/approvals': { roles: ['Admin', 'HR', 'Accountant', 'Insurance_Staff', 'Receptionist'], nav: { key: 'approvals', iconId: 'ClipboardCheck', category: 'management' } },
    '/analytics': { roles: ['Admin', 'Accountant', 'Marketing'], nav: { key: 'analytics', iconId: 'TrendingUp', category: 'reports' }, search: true },
    '/worklist': { roles: ['Radiologist', 'Technician', 'Nurse', 'Admin'], nav: { key: 'worklist', iconId: 'Activity', category: 'clinical', badge: true }, search: true },
    '/leave': { roles: STAFF_LEAVE_ROLES },
    '/case-reports': { roles: ['Radiologist', 'Admin', 'Receptionist', 'Technician', 'Nurse'], nav: { key: 'caseReports', iconId: 'ClipboardList', category: 'clinical' } },
    '/cases/:examId': { roles: ['Radiologist', 'Admin', 'Receptionist', 'Technician', 'Nurse'] },
    '/reports/editor/:examId': { roles: ['Radiologist', 'Admin'] },
    '/reception': { roles: ['Receptionist', 'Cashier', 'Admin'], nav: { key: 'reception', iconId: 'Calendar', category: 'clinical' }, search: true },
    '/appointments': { roles: ['Receptionist', 'Admin'], nav: { key: 'appointments', iconId: 'Users', category: 'clinical', badge: true }, search: true },
    '/appointments/new': { roles: ['Receptionist', 'Admin'] },
    '/patients': { roles: ['Receptionist', 'Admin', 'Radiologist', 'Nurse', 'Marketing'], nav: { key: 'patients', iconId: 'UserCircle', category: 'management' }, search: true },
    '/patients/:patientId': { roles: ['Receptionist', 'Admin', 'Radiologist', 'Nurse'] },
    '/financials': { roles: ['Accountant', 'Admin'], nav: { key: 'financials', iconId: 'Package', category: 'management' }, search: true },
    '/payroll': { roles: ['HR', 'Accountant', 'Admin'], nav: { key: 'payroll', iconId: 'Banknote', category: 'management' } },
    '/insurance': { roles: ['Accountant', 'Admin', 'Receptionist', 'Insurance_Staff'], nav: { key: 'insurance', iconId: 'ShieldCheck', category: 'management' }, search: true },
    '/equipment': { roles: ['Admin', 'Receptionist', 'Technician'], nav: { key: 'equipment', iconId: 'Briefcase', category: 'management' }, search: true },
    '/hr': { roles: ['HR', 'Admin'], nav: { key: 'hr', iconId: 'Users', category: 'management' }, search: true },
    '/marketing': { roles: ['Admin', 'Receptionist', 'HR', 'Marketing'], nav: { key: 'marketing', iconId: 'Megaphone', category: 'management' } },
    '/modality': { roles: ['Technician', 'Admin'], nav: { key: 'modality', iconId: 'Briefcase', category: 'clinical' }, search: true },
    '/nurse': { roles: ['Nurse', 'Radiologist', 'Technician', 'Admin'], nav: { key: 'nurse', iconId: 'Activity', category: 'clinical' }, search: true },
    '/inventory': { roles: ['Admin', 'Technician'], nav: { key: 'inventory', iconId: 'Package', category: 'management' }, search: true },
    '/communications': { roles: ['Admin', 'Receptionist', 'Radiologist', 'Technician', 'Nurse', 'HR', 'Marketing'], nav: { key: 'communications', iconId: 'MessageSquare', category: 'clinical' } },
};

export const getRouteMetadata = (path) => ROUTE_METADATA[path] || null;
export const getRouteRoles = (path) => getRouteMetadata(path)?.roles || [];
export const canAccessRoute = (path, role) => {
    const roles = getRouteRoles(path);
    return roles.includes(role) || (role === 'Developer' && roles.includes('Admin'));
};
export const getNavigationRoutes = () => Object.entries(ROUTE_METADATA)
    .filter(([, metadata]) => metadata.nav)
    .map(([to, metadata]) => ({ to, ...metadata.nav, roles: metadata.roles }));
export const getSearchRoutes = () => Object.entries(ROUTE_METADATA)
    .flatMap(([route, metadata]) => {
        if (!metadata.search) return [];
        const entries = Array.isArray(metadata.search) ? metadata.search : [{ key: metadata.nav?.key, to: route }];
        return entries.map((entry) => ({ ...entry, roles: metadata.roles }));
    });
