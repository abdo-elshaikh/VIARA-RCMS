const elevatedRoles = new Set(['Developer', 'Admin']);

export const payrollPermissions = {
    view: 'VIEW_PAYROLL',
    createPeriod: 'MANAGE_PAYROLL_PERIODS',
    calculate: 'CALCULATE_PAYROLL',
    review: 'REVIEW_PAYROLL',
    approve: 'APPROVE_PAYROLL',
    pay: 'PAY_PAYROLL',
    lock: 'LOCK_PAYROLL',
    cancel: 'MANAGE_PAYROLL_PERIODS',
    compensation: 'MANAGE_EMPLOYEE_COMPENSATION',
    deductions: 'MANAGE_DEDUCTIONS',
    penalties: 'MANAGE_PENALTIES',
    rules: 'MANAGE_PAYROLL_RULES',
    export: 'EXPORT_PAYROLL',
};

export const createPayrollPermissionChecker = (user) => {
    const permissions = new Set(user?.permissions || []);
    const elevated = elevatedRoles.has(user?.role);
    return (permission) => elevated || permissions.has(permission);
};

export const getPayrollPermissions = (user) => {
    const hasPermission = createPayrollPermissionChecker(user);
    return Object.fromEntries(
        Object.entries(payrollPermissions).map(([key, permission]) => [key, hasPermission(permission)])
    );
};

const pad = (value) => String(value).padStart(2, '0');

export const formatDateInput = (date) => (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
);

export const todayInput = () => formatDateInput(new Date());

export const firstDayOfCurrentMonthInput = () => {
    const date = new Date();
    return formatDateInput(new Date(date.getFullYear(), date.getMonth(), 1));
};

export const lastDayOfCurrentMonthInput = () => {
    const date = new Date();
    return formatDateInput(new Date(date.getFullYear(), date.getMonth() + 1, 0));
};

export const createIdempotencyKey = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
        const value = Math.floor(Math.random() * 16);
        const replacement = char === 'x' ? value : ((value & 0x3) | 0x8);
        return replacement.toString(16);
    });
};

const paymentKeyPrefix = 'payroll-payment-idempotency:';

export const getStoredPayrollPaymentKey = (runId) => {
    if (!runId) return createIdempotencyKey();
    const storageKey = `${paymentKeyPrefix}${runId}`;
    const existing = sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const created = createIdempotencyKey();
    sessionStorage.setItem(storageKey, created);
    return created;
};

export const clearStoredPayrollPaymentKey = (runId) => {
    if (runId) sessionStorage.removeItem(`${paymentKeyPrefix}${runId}`);
};

export const payrollQueueActionForStatus = (status, permissions) => {
    if (status === 'Calculated' && permissions.review) {
        return {
            actionStatus: 'Reviewed',
            subtitleKey: 'item.payrollReviewSubtitle',
            approveLabelKey: 'actions.review',
            risk: 'routine',
            rejectDisabled: !permissions.cancel,
            rejectMessageKey: 'detail.rejectPermissionRequired',
        };
    }
    if (status === 'Reviewed' && permissions.approve) {
        return {
            actionStatus: 'Approved',
            subtitleKey: 'item.payrollSubtitle',
            approveLabelKey: 'actions.approve',
            risk: 'high',
            rejectDisabled: !permissions.cancel,
            rejectMessageKey: 'detail.rejectPermissionRequired',
            needsApprovalNotes: true,
        };
    }
    if (status === 'Approved' && permissions.pay) {
        return {
            actionStatus: 'Paid',
            subtitleKey: 'item.payrollPaymentSubtitle',
            approveLabelKey: 'actions.markPaid',
            risk: 'high',
            rejectDisabled: true,
            rejectMessageKey: 'detail.payrollForwardOnly',
            requiresPayment: true,
        };
    }
    if (status === 'Paid' && permissions.lock) {
        return {
            actionStatus: 'Locked',
            subtitleKey: 'item.payrollLockSubtitle',
            approveLabelKey: 'actions.lock',
            risk: 'routine',
            rejectDisabled: true,
            rejectMessageKey: 'detail.payrollForwardOnly',
        };
    }
    return null;
};
