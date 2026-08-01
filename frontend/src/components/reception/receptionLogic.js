import { roundFinancialAmount, toFinancialNumber } from '../../utils/financialFormat';

export const toLocalDateInput = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const getCurrentUserId = (user) => user?.id || user?.user_id || null;

export const buildPermissionModel = (user) => {
    const permissions = new Set([...(user?.permissions || []), ...(user?.elevatedPermissions || [])]);
    const has = (permission) => user?.role === 'Developer' || permissions.has(permission);

    return {
        has,
        canProcessPayments: has('PROCESS_PAYMENTS'),
        canReconcileShifts: has('RECONCILE_SHIFTS'),
        canOpenCashierShift: has('OPEN_CASHIER_SHIFT'),
        canCloseCashierShift: has('CLOSE_CASHIER_SHIFT'),
        canDiscount: user?.role === 'Developer' || permissions.has('APPLY_DISCOUNTS'),
        canAppendSupplies: has('CONSUME_INVENTORY'),
        canManageQueue: has('MANAGE_QUEUE'),
        canDeliverResults: has('DELIVER_RESULTS')
    };
};

export const calculateAdjustedBalance = (invoice, additionalDiscount = 0) => {
    if (!invoice) return 0;
    const subtotal = toFinancialNumber(invoice.subtotal_amount);
    const currentDiscount = toFinancialNumber(invoice.discount_amount);
    const nextDiscount = Math.max(0, toFinancialNumber(additionalDiscount));
    const cumulativeDiscount = Math.min(subtotal, currentDiscount + nextDiscount);
    const taxable = Math.max(0, subtotal - cumulativeDiscount);
    const tax = taxable * (toFinancialNumber(invoice.tax_rate) / 100);
    const total = taxable + tax;
    const insurance = Math.min(total, toFinancialNumber(invoice.insurance_covered_amount));
    const patientPayable = Math.max(0, total - insurance);
    const netPaid = Math.max(0, toFinancialNumber(invoice.paid_amount) - toFinancialNumber(invoice.refunded_amount));
    const creditedAmount = Math.max(0, toFinancialNumber(invoice.credited_amount));
    return Math.max(0, roundFinancialAmount(patientPayable - creditedAmount - netPaid));
};

export const getPaymentValidation = ({
    adjustedBalance,
    discountAmount,
    discountReason,
    paymentAmount,
    paymentMethod
}) => {
    const amount = toFinancialNumber(paymentAmount);
    const discount = toFinancialNumber(discountAmount);
    const referenceRequired = paymentMethod !== 'Cash';
    const invalid =
        amount < 0 ||
        amount > adjustedBalance + 0.005 ||
        (amount <= 0 && discount <= 0) ||
        (discount > 0 && String(discountReason || '').trim().length < 3);

    return {
        amount,
        discount,
        invalid,
        referenceRequired,
        remainingBalance: Math.max(0, roundFinancialAmount(adjustedBalance - amount))
    };
};

export const getNextStageAfterPayment = (queueItem) => {
    if (!queueItem) return null;
    return queueItem.nurse_name || queueItem.nurse_id ? 'Prep Pending' : 'Ready for Exam';
};

export const VALID_QUEUE_TRANSITIONS = {
    Registered: ['Scheduled', 'Cancelled'],
    Scheduled: ['Arrived', 'Cancelled'],
    Arrived: ['Payment Pending', 'Prep Pending', 'Ready for Exam', 'Cancelled'],
    'Payment Pending': ['Prep Pending', 'Ready for Exam', 'Cancelled'],
    'Prep Pending': ['Ready for Exam', 'Cancelled'],
    'Ready for Exam': ['In Exam', 'Cancelled'],
    'In Exam': ['Reporting', 'Cancelled'],
    Reporting: ['Finalized', 'Cancelled'],
    Finalized: ['Delivered'],
    Delivered: [],
    Cancelled: []
};

export const getValidQueueTransitions = (stage) => VALID_QUEUE_TRANSITIONS[stage] || [];

export const canTransitionQueue = (fromStage, toStage) => {
    if (!fromStage || !toStage || fromStage === toStage) return false;
    return getValidQueueTransitions(fromStage).includes(toStage);
};

export const buildScheduleSummary = (appointments = [], queueItems = []) => ({
    booked: appointments.length,
    ready: appointments.filter((appointment) => ['Confirmed', 'Scheduled'].includes(appointment.status)).length,
    urgent: appointments.filter((appointment) => ['Urgent', 'Emergency'].includes(appointment.priority)).length,
    activeQueue: queueItems.length
});

export const buildReceptionTabs = ({ canProcessPayments, t }) => [
    { id: 'schedule', label: t('tabs.schedule') },
    { id: 'patients', label: t('tabs.patients') },
    ...(canProcessPayments ? [{ id: 'cashier', label: t('tabs.cashier') }] : []),
    { id: 'billing', label: t('tabs.billing') },
];

export const getShiftStatusColor = (status) => {
    const colors = {
        Open: 'bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:ring-emerald-800',
        Closed: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
        PendingReview: 'bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:ring-amber-800',
        Reconciled: 'bg-cyan-100 text-cyan-700 ring-cyan-200 dark:bg-cyan-900/20 dark:text-cyan-300 dark:ring-cyan-800',
    };
    return colors[status] || colors.Closed;
};

export const calculateCashVariance = (expected, counted) => {
    return roundFinancialAmount(Number(counted) - Number(expected));
};

export const formatAuditLogEntry = (entry) => ({
    id: entry.id || `${entry.action}-${entry.timestamp}`,
    action: entry.action,
    action_label: entry.action_label || entry.action,
    details: entry.details || '',
    description: entry.description || '',
    performed_by: entry.performed_by || entry.user_name || 'System',
    user_name: entry.user_name || entry.performed_by || 'System',
    created_at: entry.created_at || entry.timestamp || new Date().toISOString(),
    ip_address: entry.ip_address || '',
    metadata: entry.metadata || {},
});

export const validateReconciliation = ({ expected, counted, tolerance = 0.01 }) => {
    const variance = Math.abs(calculateCashVariance(expected, counted));
    return {
        isValid: variance <= tolerance,
        variance: roundFinancialAmount(variance),
        isWithinTolerance: variance <= tolerance,
        requiresReview: variance > tolerance,
    };
};
