import { roundFinancialAmount, toFinancialNumber } from '../../utils/financialFormat';
import { getEffectivePermissions } from '../../utils/effectivePermissions';

export const toLocalDateInput = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const shiftLocalDateInput = (dateInput, days) => {
    const date = new Date(`${dateInput}T00:00:00`);
    if (Number.isNaN(date.getTime())) return dateInput;
    date.setDate(date.getDate() + days);
    return toLocalDateInput(date);
};

export const getCurrentUserId = (user) => user?.id || user?.user_id || user?.userId || null;

export const buildPermissionModel = (user) => {
    const permissions = getEffectivePermissions(user);
    const has = (permission) => user?.role === 'Developer' || permissions.has(permission);

    return {
        has,
        canProcessPayments: has('PROCESS_PAYMENTS'),
        canViewInvoices: has('VIEW_INVOICES'),
        canViewExams: has('VIEW_EXAMS'),
        canReconcileShifts: has('RECONCILE_SHIFTS'),
        canOpenCashierShift: has('OPEN_CASHIER_SHIFT'),
        canCloseCashierShift: has('CLOSE_CASHIER_SHIFT'),
        canReviewShiftVariance: has('APPROVE_SHIFT_VARIANCE'),
        canDiscount: user?.role === 'Developer' || permissions.has('APPLY_DISCOUNTS'),
        canAppendSupplies: has('CONSUME_INVENTORY'),
        canManageQueue: has('MANAGE_QUEUE'),
        canDeliverResults: has('DELIVER_RESULTS')
    };
};

export const getInvoiceCoverageCategory = (invoice) => {
    if (!invoice) {
        return {
            type: 'self_pay',
            isInsurance: false,
            isContract: false,
            labelAr: 'حساب خاص (سداد مباشر)',
            labelEn: 'Self-Pay (Direct)',
            providerName: null,
            policyNumber: null,
            memberNumber: null,
            planName: null,
        insuranceCovered: 0,
        preauthorizationRequired: false,
        patientPayable: 0,
            totalAmount: 0
        };
    }

    const insuranceCovered = toFinancialNumber(invoice.insurance_covered_amount);
    const patientPayable = toFinancialNumber(invoice.patient_payable_amount);
    const totalAmount = toFinancialNumber(invoice.total_amount ?? (insuranceCovered + patientPayable));
    const providerName = invoice.provider_name || invoice.insurance_provider_name || null;
    const policyNumber = invoice.policy_number || invoice.insurance_policy_number || null;
    const memberNumber = invoice.member_number || invoice.insurance_member_number || null;
    const planName = invoice.plan_name || invoice.insurance_plan_name || null;

    const hasCoverage = insuranceCovered > 0 || Boolean(providerName) || Boolean(policyNumber);

    if (!hasCoverage) {
        return {
            type: 'self_pay',
            isInsurance: false,
            isContract: false,
            labelAr: 'حساب خاص (سداد مباشر)',
            labelEn: 'Self-Pay (Direct)',
            providerName: null,
            policyNumber: null,
            memberNumber: null,
            planName: null,
            insuranceCovered: 0,
            preauthorizationRequired: false,
            patientPayable,
            totalAmount
        };
    }

    // Determine if it's a corporate / syndicate contract or health insurance
    const lowerName = String(providerName || '').toLowerCase();
    const isContract = lowerName.includes('نقابة') ||
                       lowerName.includes('شركة') ||
                       lowerName.includes('contract') ||
                       lowerName.includes('syndicate') ||
                       lowerName.includes('corporate') ||
                       lowerName.includes('هيئة') ||
                       lowerName.includes('جمعية');

    return {
        type: isContract ? 'contract' : 'insurance',
        isInsurance: !isContract,
        isContract,
        labelAr: isContract ? 'تعاقد جهة / نقابة' : 'تأمين صحي',
        labelEn: isContract ? 'Corporate Contract' : 'Health Insurance',
        providerName,
        policyNumber,
        memberNumber,
        planName,
        insuranceCovered,
        preauthorizationRequired: Boolean(invoice.preauthorization_required),
        patientPayable,
        totalAmount
    };
};

export const getContractRequirementsChecklist = (category, isAr = false) => {
    if (!category || category.type === 'self_pay') return [];

    const isContract = category.type === 'contract';

    return [
        {
            id: 'card',
            labelAr: isContract ? 'التحقق من كارنيه الجهة / إثبات الهوية ساري' : 'التحقق من بطاقة / كارنيه التأمين ساري الصلاحية',
            labelEn: isContract ? 'Valid Entity / Syndicate ID Card Verified' : 'Valid Health Insurance Card Verified',
            required: true,
            hintAr: category.memberNumber ? `رقم الكارنيه: ${category.memberNumber}` : 'التأكد من مطابقة الاسم والصورة',
            hintEn: category.memberNumber ? `Card #: ${category.memberNumber}` : 'Match photo & full name'
        },
        {
            id: 'referral',
            labelAr: 'أصل خطاب التحويل الطبي / الروشتة معتمدة ومختومة',
            labelEn: 'Original Signed & Stamped Medical Referral / Prescription',
            required: true,
            hintAr: 'التحقق من وضوح اسم الطبيب وتاريخ التحويل',
            hintEn: 'Check referring physician signature and date'
        },
        {
            id: 'preauth',
            labelAr: isContract ? 'خطاب تفويض / أمر تكليف صادر من الجهة (إن وُجد)' : 'كود الموافقة المسبقة من شركة التأمين (Pre-Auth)',
            labelEn: isContract ? 'Official Letter of Authorization / PO (if applicable)' : 'Insurance Pre-Authorization Code & Expiry',
            required: Boolean(category.preauthorizationRequired),
            hintAr: category.policyNumber ? `رقم الوثيقة / البوليصة: ${category.policyNumber}` : 'التحقق من تغطية الفحص المطلوب',
            hintEn: category.policyNumber ? `Policy #: ${category.policyNumber}` : 'Ensure requested exam code matches approval'
        },
        {
            id: 'patient_copay_sign',
            labelAr: 'توقيع المريض على نموذج الاستلام وإقرار نسبة التحمل',
            labelEn: 'Patient Signed Claim Form & Copay Acknowledgment',
            required: true,
            hintAr: `نسبة التحمل المقررة: ${category.patientPayable.toLocaleString()} ج.م`,
            hintEn: `Assigned patient copay: ${category.patientPayable.toLocaleString()} EGP`
        }
    ];
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
    const referenceRequired = amount > 0 && paymentMethod !== 'Cash';
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
    const hasNurse = Boolean(
        queueItem.nurse_name ||
        queueItem.nurse_id ||
        queueItem.nurseName ||
        queueItem.nurseId
    );
    return hasNurse ? 'Prep Pending' : 'Ready for Exam';
};

export const VALID_QUEUE_TRANSITIONS = {
    Registered: ['Scheduled', 'Cancelled'],
    Scheduled: ['Arrived', 'Cancelled'],
    Arrived: ['Payment Pending', 'Prep Pending', 'Ready for Exam', 'Cancelled'],
    'Payment Pending': ['Prep Pending', 'Ready for Exam', 'Cancelled'],
    'Prep Pending': ['Ready for Exam', 'Cancelled'],
    'Ready for Exam': ['In Exam', 'Cancelled'],
    'In Exam': ['Cancelled'],
    'Images Ready': [],
    'Images Delivered': [],
    Reporting: ['Cancelled'],
    Finalized: ['Delivered'],
    Delivered: [],
    Cancelled: []
};

export const getValidQueueTransitions = (stage) => VALID_QUEUE_TRANSITIONS[stage] || [];

export const canTransitionQueue = (fromStage, toStage) => {
    if (!fromStage || !toStage || fromStage === toStage) return false;
    return getValidQueueTransitions(fromStage).includes(toStage);
};

export const isActionableCashierItem = (item, invoice) => {
    if (!item && !invoice) return false;
    if (invoice && invoice.invoice_status === 'Voided') return false;

    const stage = item?.queue_stage || item?.queueStage;
    const balance = Number(invoice?.balance_amount ?? 0);
    const hasOutstandingBalance = Boolean(invoice && balance > 0.005);

    // 1. If in 'Payment Pending', actionable if missing invoice or has balance
    if (stage === 'Payment Pending') {
        return !invoice || hasOutstandingBalance;
    }
    // 2. If in 'Arrived', actionable if invoice exists with balance
    if (stage === 'Arrived') {
        return Boolean(invoice && hasOutstandingBalance);
    }
    // 3. For any other stage (e.g. 'Prep Pending', 'Ready for Exam', 'In Exam', 'Reporting', 'Finalized'),
    // if new supplies were consumed or the invoice has an outstanding balance,
    // it MUST appear in the Cashier Queue for collection!
    if (hasOutstandingBalance) {
        return true;
    }

    return false;
};

export const buildScheduleSummary = (appointments = [], queueItems = []) => {
    const readyFromQueue = queueItems.filter((item) => ['Arrived', 'Payment Pending', 'Prep Pending'].includes(item.queue_stage || item.queueStage)).length;
    const readyFromAppts = appointments.filter((a) => ['Arrived', 'Checked-in'].includes(a.status) && !queueItems.some(q => (q.appointment_id && q.appointment_id === a.appointment_id) || (q.exam_id && q.exam_id === a.exam_id))).length;
    const urgentAppts = appointments.filter((appointment) => ['Urgent', 'Emergency'].includes(appointment.priority)).length;
    const urgentQueue = queueItems.filter((q) => ['Urgent', 'Emergency'].includes(q.priority) && !appointments.some(a => (a.appointment_id && a.appointment_id === q.appointment_id) || (a.exam_id && a.exam_id === q.exam_id))).length;

    return {
        booked: appointments.length,
        ready: readyFromQueue + readyFromAppts,
        urgent: urgentAppts + urgentQueue,
        activeQueue: queueItems.filter((item) => !['Images Delivered', 'Delivered', 'Cancelled'].includes(item.queue_stage || item.queueStage)).length
    };
};

export const buildReceptionTabs = ({ canProcessPayments, has, t, canReviewEndOfDay = false }) => {
    const tabs = [];
    if (has('VIEW_APPOINTMENTS')) tabs.push({ id: 'schedule', label: t('tabs.schedule') });
    if (has('VIEW_PATIENTS')) tabs.push({ id: 'patients', label: t('tabs.patients') });
    if (canProcessPayments && has('VIEW_INVOICES')) tabs.push({ id: 'cashier', label: t('tabs.cashier') });
    if (has('VIEW_INVOICES')) tabs.push({ id: 'billing', label: t('tabs.billing') });
    if (canReviewEndOfDay) tabs.push({ id: 'end-of-day', label: t('tabs.endOfDay', { defaultValue: 'مراجعة نهاية الوردية' }) });
    return tabs;
};

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
