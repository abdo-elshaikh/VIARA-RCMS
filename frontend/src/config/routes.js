import { getEffectivePermissions, isEmergencyAccessActive } from '../utils/effectivePermissions';
import { canAccessSettingsSection, SETTINGS_SECTION_ACCESS } from './settingsSections';

// Route access and discoverability metadata shared by routing and navigation.
const STAFF_LEAVE_ROLES = ['Admin', 'Radiologist', 'Receptionist', 'Cashier', 'Accountant', 'HR', 'Technician', 'Nurse', 'Insurance_Staff', 'Marketing'];

// Query-backed workspaces are exposed as secondary navigation instead of
// forcing users to rediscover the same tabs inside each page.
const SUB_NAVIGATION = {
    '/reception': [
        { key: 'receptionSchedule', to: '/reception?tab=schedule', permissions: ['VIEW_APPOINTMENTS'] },
        { key: 'receptionPatients', to: '/reception?tab=patients', permissions: ['VIEW_PATIENTS'] },
        { key: 'receptionCashier', to: '/reception?tab=cashier', permissions: ['PROCESS_PAYMENTS'] },
        { key: 'receptionBilling', to: '/reception?tab=billing', permissions: ['VIEW_INVOICES'] },
    ],
    '/equipment': [
        { key: 'equipmentMatrix', to: '/equipment?tab=matrix' },
        { key: 'equipmentRooms', to: '/equipment?tab=rooms' },
        { key: 'equipmentRegistry', to: '/equipment?tab=registry' },
        { key: 'equipmentProcedures', to: '/equipment?tab=procedures' },
        { key: 'equipmentMaintenance', to: '/equipment?tab=maintenance', roles: ['Admin', 'Technician'] },
        { key: 'equipmentDowntime', to: '/equipment?tab=downtime' },
    ],
    '/financials': [
        { key: 'financialReports', to: '/financials?tab=reports' },
        { key: 'financialProfitLoss', to: '/financials?tab=pl' },
        { key: 'financialExpenses', to: '/financials?tab=expenses' },
        { key: 'financialCommissions', to: '/financials?tab=commissions' },
        { key: 'financialDiscounts', to: '/financials?tab=discounts' },
        { key: 'financialReceivables', to: '/financials?tab=receivables' },
        { key: 'financialCashier', to: '/financials?tab=cashier' },
        { key: 'financialLedger', to: '/financials?tab=ledger' },
        { key: 'financialClosures', to: '/financials?tab=closures' },
    ],
    '/hr': [
        { key: 'hrDirectory', to: '/hr?tab=directory' },
        { key: 'hrShifts', to: '/hr?tab=shifts' },
        { key: 'hrAttendance', to: '/hr?tab=attendance' },
        { key: 'hrLeave', to: '/hr?tab=leave' },
        { key: 'hrCredentials', to: '/hr?tab=credentials' },
        { key: 'hrProductivity', to: '/hr?tab=productivity' },
    ],
    '/payroll': [
        { key: 'payrollOverview', to: '/payroll?tab=overview' },
        { key: 'payrollCompensation', to: '/payroll?tab=compensation' },
        { key: 'payrollAdjustments', to: '/payroll?tab=adjustments' },
        { key: 'payrollRules', to: '/payroll?tab=rules' },
    ],
    '/inventory': [
        { key: 'inventoryDashboard', to: '/inventory?tab=dashboard' },
        { key: 'inventoryCatalog', to: '/inventory?tab=catalog' },
        { key: 'inventoryPurchaseOrders', to: '/inventory?tab=pos' },
        { key: 'inventorySuppliers', to: '/inventory?tab=suppliers', roles: ['Admin'] },
    ],
    '/insurance': [
        { key: 'insuranceClaims', to: '/insurance?tab=claims' },
        { key: 'insuranceProviders', to: '/insurance?tab=providers' },
        { key: 'insurancePolicies', to: '/insurance?tab=policies' },
        { key: 'insuranceRules', to: '/insurance?tab=rules' },
        { key: 'insuranceApprovals', to: '/insurance?tab=approvals' },
    ],
    '/marketing': [
        { key: 'marketingDashboard', to: '/marketing?tab=dashboard' },
        { key: 'marketingCampaigns', to: '/marketing?tab=campaigns', roles: ['Admin', 'Receptionist', 'Marketing'] },
        { key: 'marketingTasks', to: '/marketing?tab=tasks' },
        { key: 'marketingFeedback', to: '/marketing?tab=feedback', roles: ['Admin', 'Receptionist', 'Marketing'] },
        { key: 'marketingReferrals', to: '/marketing?tab=referrals', roles: ['Admin', 'Accountant', 'Marketing'], permissions: ['VIEW_REFERRAL_ANALYTICS'] },
    ],
    '/analytics': [
        { key: 'analyticsOverview', to: '/analytics?tab=overview' },
        { key: 'analyticsClinical', to: '/analytics?tab=clinical' },
        { key: 'analyticsEquipment', to: '/analytics?tab=equipment' },
        { key: 'analyticsPeakHours', to: '/analytics?tab=peak_hours' },
        { key: 'analyticsProcedures', to: '/analytics?tab=procedures' },
        { key: 'analyticsFinancial', to: '/analytics?tab=financial' },
    ],
    '/settings': Object.keys(SETTINGS_SECTION_ACCESS).map((section) => ({
        key: `settingsSection_${section}`, to: `/settings?tab=${section}`, settingsSection: section,
    })),
};

const CASHIER_NAVIGATION = [
    { key: 'receptionBilling', to: '/reception?tab=billing', permissions: ['VIEW_INVOICES', 'PROCESS_PAYMENTS'] },
    { key: 'cashierReconciliation', to: '/reception?tab=reconciliation', permissions: ['CLOSE_CASHIER_SHIFT'] },
    { key: 'cashierSupervisor', to: '/reception?tab=supervisor', permissions: ['APPROVE_SHIFT_VARIANCE'] },
];

export const ROUTE_METADATA = {
    '/print/sticker/:id': { roles: ['Admin', 'Receptionist', 'Radiologist', 'Technician', 'Nurse'] },
    '/print/receipt/:id': { roles: ['Admin', 'Receptionist', 'Radiologist', 'Technician', 'Nurse'] },
    '/print/booking-slip/:id': { roles: ['Admin', 'Receptionist', 'Radiologist', 'Technician', 'Nurse'] },
    '/print/invoice/:id': { roles: ['Admin', 'Receptionist', 'Cashier', 'Accountant'] },
    '/dashboard': { roles: ['Admin', 'Radiologist', 'Receptionist', 'Cashier', 'Accountant', 'HR', 'Technician', 'Nurse', 'Insurance_Staff', 'Marketing'], nav: { key: 'dashboard', iconId: 'LayoutDashboard', category: 'clinical' }, search: true },
    '/help': { roles: ['Developer', 'Admin', 'Radiologist', 'Receptionist', 'Cashier', 'Accountant', 'HR', 'Technician', 'Nurse', 'Insurance_Staff', 'Marketing', 'Referring_Doctor'], nav: { key: 'help', iconId: 'HelpCircle', category: 'system' } },
    '/admin': { roles: ['Admin'], permissions: ['VIEW_FINANCIALS'], nav: { key: 'analytics', iconId: 'FileBarChart', category: 'management' } },
    '/users': { roles: ['Admin', 'HR'], permissions: ['VIEW_USERS'], nav: { key: 'users', iconId: 'Users', category: 'management' }, search: true },
    '/users/:userId': { roles: ['Admin', 'HR', 'Receptionist', 'Radiologist', 'Technician', 'Nurse', 'Cashier', 'Accountant', 'Insurance_Staff', 'Marketing'] },
    '/user-activity': { roles: ['Admin', 'HR'], permissions: ['VIEW_AUDIT_TRAILS', 'VIEW_AUDIT_LOGS'], nav: { key: 'userActivity', iconId: 'Activity', category: 'management' }, search: true },
    '/referring-doctors': { roles: ['Receptionist', 'Admin', 'Accountant'], permissions: ['VIEW_REFERRING_DOCTORS'], nav: { key: 'referringDoctors', iconId: 'UserCircle', category: 'clinical' } },
    '/referring-doctors/:doctorId': { roles: ['Receptionist', 'Admin', 'Accountant'] },
    '/pacs/viewer': { roles: ['Radiologist', 'Technician', 'Admin', 'Nurse'], permissions: ['VIEW_PACS_IMAGES', 'MANAGE_PACS'] },
    '/pacs/reconciliation': { roles: ['Radiologist', 'Technician', 'Admin'], permissions: ['RECONCILE_STUDIES'], nav: { key: 'pacsReconciliation', iconId: 'Monitor', category: 'clinical' } },
    '/settings': { roles: ['Admin', 'Radiologist', 'Receptionist', 'Cashier', 'Accountant', 'HR', 'Technician', 'Nurse', 'Insurance_Staff', 'Marketing'], nav: { key: 'settings', iconId: 'Settings', category: 'system' }, search: [{ key: 'settings', to: '/settings' }, { key: 'roles', to: '/settings?tab=roles' }] },
    '/profile': { roles: ['Developer', 'Admin', 'Radiologist', 'Receptionist', 'Cashier', 'Accountant', 'HR', 'Technician', 'Nurse', 'Insurance_Staff', 'Marketing'], search: [{ key: 'profile', to: '/profile' }, { key: 'accountSecurity', to: '/profile?section=security' }, { key: 'leave', to: '/profile?section=leave' }] },
    '/notifications': { roles: ['Developer', 'Admin', 'Radiologist', 'Receptionist', 'Cashier', 'Accountant', 'HR', 'Technician', 'Nurse', 'Insurance_Staff', 'Marketing'], nav: { key: 'notifications', iconId: 'Bell', category: 'clinical' } },
    '/approvals': { roles: ['Admin', 'HR', 'Accountant', 'Insurance_Staff', 'Receptionist'], permissions: ['MANAGE_LEAVE', 'APPROVE_PAYROLL', 'APPROVE_REFUNDS', 'MANAGE_INSURANCE_APPROVALS', 'PROCESS_REFUNDS'], nav: { key: 'approvals', iconId: 'ClipboardCheck', category: 'management' } },
    '/analytics': { roles: ['Admin', 'Accountant', 'Marketing'], permissions: ['VIEW_ANALYTICS', 'VIEW_REFERRAL_ANALYTICS'], nav: { key: 'analytics', iconId: 'TrendingUp', category: 'reports' }, search: true },
    '/worklist': { roles: ['Radiologist', 'Technician', 'Nurse', 'Admin'], permissions: ['VIEW_EXAMS'], nav: { key: 'worklist', iconId: 'Activity', category: 'clinical', badge: true }, search: true },
    '/leave': { roles: STAFF_LEAVE_ROLES },
    '/case-reports': { roles: ['Radiologist', 'Admin', 'Receptionist', 'Technician', 'Nurse'], permissions: ['VIEW_REPORTS'], nav: { key: 'caseReports', iconId: 'ClipboardList', category: 'clinical' } },
    '/cases/:examId': { roles: ['Radiologist', 'Admin', 'Receptionist', 'Technician', 'Nurse'] },
    '/reports/editor/:examId': { roles: ['Radiologist', 'Admin'] },
    '/reception': { roles: ['Receptionist', 'Cashier', 'Admin'], permissions: ['VIEW_APPOINTMENTS', 'VIEW_INVOICES', 'PROCESS_PAYMENTS'], nav: { key: 'reception', iconId: 'Calendar', category: 'clinical' }, search: true },
    '/appointments': { roles: ['Receptionist', 'Admin'], permissions: ['VIEW_APPOINTMENTS'], nav: { key: 'appointments', iconId: 'Users', category: 'clinical', badge: true }, search: true },
    '/appointments/new': { roles: ['Receptionist', 'Admin'] },
    '/patients': { roles: ['Receptionist', 'Admin', 'Radiologist', 'Technician', 'Nurse', 'Marketing'], permissions: ['VIEW_PATIENTS'], nav: { key: 'patients', iconId: 'UserCircle', category: 'management' }, search: true },
    '/patients/:patientId': { roles: ['Receptionist', 'Admin', 'Radiologist', 'Technician', 'Nurse'], permissions: ['VIEW_PATIENTS'] },
    '/financials': { roles: ['Accountant', 'Admin'], permissions: ['VIEW_FINANCIALS'], nav: { key: 'financials', iconId: 'Package', category: 'management' }, search: true },
    '/payroll': { roles: ['HR', 'Accountant', 'Admin'], permissions: ['VIEW_PAYROLL'], nav: { key: 'payroll', iconId: 'Banknote', category: 'management' } },
    '/insurance': { roles: ['Accountant', 'Admin', 'Receptionist', 'Insurance_Staff'], permissions: ['VIEW_INSURANCE'], nav: { key: 'insurance', iconId: 'ShieldCheck', category: 'management' }, search: true },
    '/equipment': { roles: ['Admin', 'Receptionist', 'Technician'], permissions: ['VIEW_EQUIPMENT'], nav: { key: 'equipment', iconId: 'Briefcase', category: 'management' }, search: true },
    '/hr': { roles: ['HR', 'Admin'], permissions: ['VIEW_STAFF'], nav: { key: 'hr', iconId: 'Users', category: 'management' }, search: true },
    '/marketing': { roles: ['Admin', 'Receptionist', 'HR', 'Marketing'], permissions: ['VIEW_MARKETING', 'VIEW_CRM'], nav: { key: 'marketing', iconId: 'Megaphone', category: 'management' } },
    '/modality': { roles: ['Technician', 'Admin'], permissions: ['VIEW_EXAMS', 'PERFORM_EXAMS'], nav: { key: 'modality', iconId: 'Briefcase', category: 'clinical' }, search: true },
    '/nurse': { roles: ['Nurse', 'Radiologist', 'Technician', 'Admin'], permissions: ['VIEW_EXAMS', 'MANAGE_QUEUE'], nav: { key: 'nurse', iconId: 'Activity', category: 'clinical' }, search: true },
    '/inventory': { roles: ['Admin', 'Technician'], permissions: ['VIEW_INVENTORY'], nav: { key: 'inventory', iconId: 'Package', category: 'management' }, search: true },
    '/communications': { roles: ['Admin', 'Receptionist', 'Radiologist', 'Technician', 'Nurse', 'HR', 'Marketing'], permissions: ['MANAGE_CHAT'], nav: { key: 'communications', iconId: 'MessageSquare', category: 'clinical' } },
    '/display/control': { roles: ['Admin', 'Receptionist'], permissions: ['MANAGE_DISPLAY_BOARD'], nav: { key: 'displayBoard', iconId: 'Monitor', category: 'system' } },
};

export const getRouteMetadata = (path) => ROUTE_METADATA[path] || null;
export const getRouteRoles = (path) => getRouteMetadata(path)?.roles || [];
export const getRoutePermissions = (path) => getRouteMetadata(path)?.permissions || [];
export const canAccessRoute = (path, roleOrUser, explicitPermissions) => {
    const roles = getRouteRoles(path);
    const user = roleOrUser && typeof roleOrUser === 'object' ? roleOrUser : null;
    const role = user?.role || roleOrUser;
    const roleAllowed = roles.includes(role) || (role === 'Developer' && roles.includes('Admin'));
    if (!roleAllowed) return false;

    // Developer is the technical superuser in the backend RBAC middleware.
    if (role === 'Developer') return true;

    const requiredPermissions = getRoutePermissions(path);
    if (requiredPermissions.length === 0) return true;

    const hasPermissionClaims = Array.isArray(explicitPermissions)
        || Array.isArray(user?.permissions)
        || isEmergencyAccessActive(user);
    if (!hasPermissionClaims) return true;

    const grantedPermissions = getEffectivePermissions(user, Date.now(), explicitPermissions);
    return requiredPermissions.some((permission) => grantedPermissions.has(permission));
};

// Resolve access for a complete Help link, including query-backed workspace tabs.
// Checking only the pathname would incorrectly expose protected settings and
// cashier/approval tabs to users who can open the parent workspace.
export const canAccessRouteTarget = (target, roleOrUser, explicitPermissions) => {
    const [pathname, rawQuery = ''] = String(target || '').split('#')[0].split('?');
    if (!canAccessRoute(pathname, roleOrUser, explicitPermissions)) return false;

    const baseUser = roleOrUser && typeof roleOrUser === 'object'
        ? roleOrUser
        : { role: roleOrUser };
    const targetUser = Array.isArray(explicitPermissions)
        ? { ...baseUser, permissions: [...getEffectivePermissions(baseUser, Date.now(), explicitPermissions)] }
        : baseUser;

    const params = new URLSearchParams(rawQuery);
    const requestedTab = params.get('tab');
    if (!requestedTab) return true;

    if (pathname === '/settings') {
        const section = requestedTab === 'clinicalOperations' ? 'clinical' : requestedTab;
        return canAccessSettingsSection(section, targetUser);
    }

    const children = pathname === '/reception' && targetUser.role === 'Cashier'
        ? CASHIER_NAVIGATION
        : SUB_NAVIGATION[pathname] || [];
    const matchingChild = children.find((child) => {
        const childUrl = new URL(child.to, 'https://viara.local');
        return childUrl.searchParams.get('tab') === requestedTab;
    });
    // Unknown contextual tabs belong to their page; unknown workspace sections do not.
    if (!matchingChild) return children.length === 0;

    return canAccessNavigationChild({
        ...matchingChild,
        parentTo: pathname,
        roles: matchingChild.roles || getRouteRoles(pathname),
        permissions: matchingChild.permissions || getRoutePermissions(pathname),
    }, targetUser);
};
export const getNavigationRoutes = () => Object.entries(ROUTE_METADATA)
    .filter(([, metadata]) => metadata.nav)
    .map(([to, metadata]) => ({ to, ...metadata.nav, roles: metadata.roles, permissions: metadata.permissions || [] }));
export const getNavigationTree = (user) => getNavigationRoutes().map((route) => ({
    ...route,
    children: (route.to === '/reception' && user?.role === 'Cashier' ? CASHIER_NAVIGATION : SUB_NAVIGATION[route.to] || []).map((child) => ({
        ...child,
        parentTo: route.to,
        roles: child.roles || route.roles,
        permissions: child.permissions || route.permissions,
    })),
}));
export const canAccessNavigationChild = (child, user) => {
    if (!canAccessRoute(child.parentTo, user)) return false;
    if (child.settingsSection) return canAccessSettingsSection(child.settingsSection, user);
    const role = user?.role;
    if (role === 'Developer') return true;
    if (!child.roles.includes(role)) return false;
    if (!child.permissions.length) return true;
    // Preserve legacy role-only sessions, but never interpret required permissions as grants.
    if (!Array.isArray(user?.permissions) && !isEmergencyAccessActive(user)) return true;
    const granted = getEffectivePermissions(user);
    return child.permissions.some((permission) => granted.has(permission));
};
export const getAccessibleNavigationTree = (user) => getNavigationTree(user)
    .map((route) => ({
        ...route,
        children: route.children.filter((child) => canAccessNavigationChild(child, user)),
    }))
    .filter((route) => canAccessRoute(route.to, user) && (!SUB_NAVIGATION[route.to]?.length || route.children.length > 0));

// One resolver for sidebar state and direct URL protection. Keep unrelated filters intact.
export const resolveWorkspaceNavigation = (pathname, search, user) => {
    const workspace = getNavigationTree(user).find((route) => route.to === pathname && route.children.length);
    if (!workspace) return null;
    const children = workspace.children.filter((child) => canAccessNavigationChild(child, user));
    const params = new URLSearchParams(search);
    const requested = params.get('tab');
    const section = requested === 'clinicalOperations' && pathname === '/settings' ? 'clinical' : requested;
    const active = children.find((child) => new URLSearchParams(child.to.split('?')[1]).get('tab') === section) || children[0];
    if (!active) return { workspace, children, active: null, redirect: '/unauthorized' };
    const activeId = new URLSearchParams(active.to.split('?')[1]).get('tab');
    params.set('tab', activeId);
    return { workspace, children, active, redirect: requested !== activeId ? `${pathname}?${params}` : null };
};
export const getAccessibleNavigationRoutes = (user) => getNavigationRoutes()
    .filter((route) => canAccessRoute(route.to, user));
export const getSearchRoutes = () => Object.entries(ROUTE_METADATA)
    .flatMap(([route, metadata]) => {
        if (!metadata.search) return [];
        const entries = Array.isArray(metadata.search) ? metadata.search : [{ key: metadata.nav?.key, to: route }];
        return entries.map((entry) => ({ ...entry, roles: metadata.roles, permissions: metadata.permissions || [] }));
    });
