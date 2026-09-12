import { useEffect, useMemo, useState } from 'react';
import {
    AlertCircle, ArrowLeftRight, ArrowUpDown, Banknote, CalendarClock, CalendarDays, Check,
    CheckCircle2, ChevronRight, CircleDollarSign, Clock3, DoorOpen, FileKey2, FileText, Inbox,
    MinusCircle, RefreshCw, RotateCcw, Scale, Search, Settings2, ShieldAlert, ShieldCheck, UserRound,
    UserCog, WalletCards, X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import PageHeader from '../components/ui/PageHeader';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import TextPromptDialog from '../components/ui/TextPromptDialog';
import {
    useGetAttendancePermissionsQuery,
    useGetClaimsQuery,
    useGetCashierReconciliationQuery,
    useGetInsuranceApprovalsQuery,
    useGetLeaveRequestsQuery,
    useGetPayrollDeductionsQuery,
    useGetPayrollPenaltiesQuery,
    useGetPayrollPeriodsQuery,
    useGetPayrollRulesQuery,
    useGetPartialPaymentExceptionsQuery,
    useGetPortalReviewRequestsQuery,
    useGetPrivacyRequestsQuery,
    useGetRefundsQuery,
    useGetShiftRequestsQuery,
    useReviewCashierClosureMutation,
    useReviewPartialPaymentExceptionMutation,
    useReviewPortalAppointmentRequestMutation,
    useReviewPortalProfileUpdateRequestMutation,
    useResolvePrivacyRequestMutation,
    useReviewRefundMutation,
    useUpdateAttendancePermissionStatusMutation,
    useUpdateClaimStatusMutation,
    useUpdateInsuranceApprovalStatusMutation,
    useUpdateLeaveStatusMutation,
    useUpdatePayrollDeductionStatusMutation,
    useUpdatePayrollPenaltyStatusMutation,
    useUpdatePayrollRuleStatusMutation,
    useUpdatePayrollRunStatusMutation,
    useUpdateShiftRequestStatusMutation,
} from '../store/api';
import { selectCurrentUser } from '../store/authSlice';
import { getErrorMessage } from '../utils/getErrorMessage';
import { formatDateTime, formatLocalizedDate } from '../utils/localizedDate';
import {
    clearStoredPayrollPaymentKey,
    getPayrollPermissions,
    getStoredPayrollPaymentKey,
    payrollQueueActionForStatus,
    todayInput,
} from '../utils/payrollWorkflow';

const INBOX_APPROVAL_STATUS = 'pendingApproval';
const SOURCE_PENDING_APPROVAL_STATUSES = Object.freeze({
    leave: new Set(['Pending']),
    privacy: new Set(['Pending', 'InReview', 'Approved']),
    refund: new Set(['Pending']),
    claim: new Set(['Pending Approval']),
    authorization: new Set(['Pending']),
    deduction: new Set(['Draft']),
    rule: new Set(['Pending Approval']),
    penalty: new Set(['Pending Approval']),
    variance: new Set(['Requires Review']),
    partialPayment: new Set(['Pending']),
    portalAppointment: new Set(['Pending']),
    profileUpdate: new Set(['Pending']),
    attendancePermission: new Set(['Pending']),
    shiftRequest: new Set(['Pending']),
});

const getRequestSourceStatus = (source, raw = {}) => {
    if (source === 'payroll') return raw.run_status || raw.status || null;
    if (source === 'variance') return raw.review_status || raw.status || null;
    return raw.status || null;
};

const getSourceStatus = (item) => getRequestSourceStatus(item.source, item.raw || {});

const isPendingApprovalSourceRequest = (source, request) => (
    SOURCE_PENDING_APPROVAL_STATUSES[source]?.has(getRequestSourceStatus(source, request)) || false
);

const getPrimaryPendingApprovalStatus = (source) => (
    SOURCE_PENDING_APPROVAL_STATUSES[source]?.values().next().value
);

const markPendingApproval = (item, sourceLabels, t) => {
    const approvalStatusLabel = t(`status.${INBOX_APPROVAL_STATUS}`, { defaultValue: 'Pending approval' });
    const sourceLabel = sourceLabels[item.source] || item.source;
    const sourceStatus = getSourceStatus(item);

    return {
        ...item,
        approvalStatus: INBOX_APPROVAL_STATUS,
        approvalStatusLabel,
        sourceLabel,
        sourceStatus,
        facts: [
            [t('facts.approvalStatus', { defaultValue: 'Approval status' }), approvalStatusLabel],
            [t('facts.requestSource', { defaultValue: 'Request source' }), sourceLabel],
            [t('facts.sourceStatus', { defaultValue: 'Source status' }), sourceStatus || t('fallback.notSpecified')],
            ...(item.facts || []),
        ],
    };
};

const SOURCE_STYLES = {
    leave: {
        icon: CalendarDays,
        badge: 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/60 dark:bg-indigo-950/35 dark:text-indigo-300',
        iconBox: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
        active: 'border-indigo-300 bg-indigo-50/70 shadow-indigo-100/50 dark:border-indigo-700/70 dark:bg-indigo-950/25',
    },
    privacy: {
        icon: FileKey2,
        badge: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/35 dark:text-violet-300',
        iconBox: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
        active: 'border-violet-300 bg-violet-50/70 shadow-violet-100/50 dark:border-violet-700/70 dark:bg-violet-950/25',
    },
    refund: {
        icon: RotateCcw,
        badge: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/35 dark:text-rose-300',
        iconBox: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
        active: 'border-rose-300 bg-rose-50/70 shadow-rose-100/50 dark:border-rose-700/70 dark:bg-rose-950/25',
    },
    claim: {
        icon: ShieldCheck,
        badge: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/60 dark:bg-cyan-950/35 dark:text-cyan-300',
        iconBox: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300',
        active: 'border-cyan-300 bg-cyan-50/70 shadow-cyan-100/50 dark:border-cyan-700/70 dark:bg-cyan-950/25',
    },
    penalty: {
        icon: Scale,
        badge: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/60 dark:bg-orange-950/35 dark:text-orange-300',
        iconBox: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
        active: 'border-orange-300 bg-orange-50/70 shadow-orange-100/50 dark:border-orange-700/70 dark:bg-orange-950/25',
    },
    deduction: {
        icon: MinusCircle,
        badge: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/35 dark:text-amber-300',
        iconBox: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
        active: 'border-amber-300 bg-amber-50/70 shadow-amber-100/50 dark:border-amber-700/70 dark:bg-amber-950/25',
    },
    rule: {
        icon: Settings2,
        badge: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200',
        iconBox: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
        active: 'border-slate-300 bg-slate-50/80 shadow-slate-100/50 dark:border-slate-700 dark:bg-slate-900/45',
    },
    partialPayment: {
        icon: ShieldAlert,
        badge: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-300',
        iconBox: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
        active: 'border-red-300 bg-red-50/70 shadow-red-100/50 dark:border-red-700/70 dark:bg-red-950/25',
    },
    payroll: {
        icon: Banknote,
        badge: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/35 dark:text-emerald-300',
        iconBox: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
        active: 'border-emerald-300 bg-emerald-50/70 shadow-emerald-100/50 dark:border-emerald-700/70 dark:bg-emerald-950/25',
    },
    variance: {
        icon: CircleDollarSign,
        badge: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/35 dark:text-amber-300',
        iconBox: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
        active: 'border-amber-300 bg-amber-50/70 shadow-amber-100/50 dark:border-amber-700/70 dark:bg-amber-950/25',
    },
    portalAppointment: {
        icon: CalendarClock,
        badge: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/35 dark:text-blue-300',
        iconBox: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
        active: 'border-blue-300 bg-blue-50/70 shadow-blue-100/50 dark:border-blue-700/70 dark:bg-blue-950/25',
    },
    profileUpdate: {
        icon: UserCog,
        badge: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-900/60 dark:bg-fuchsia-950/35 dark:text-fuchsia-300',
        iconBox: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300',
        active: 'border-fuchsia-300 bg-fuchsia-50/70 shadow-fuchsia-100/50 dark:border-fuchsia-700/70 dark:bg-fuchsia-950/25',
    },
    authorization: {
        icon: ShieldCheck,
        badge: 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900/60 dark:bg-teal-950/35 dark:text-teal-300',
        iconBox: 'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
        active: 'border-teal-300 bg-teal-50/70 shadow-teal-100/50 dark:border-teal-700/70 dark:bg-teal-950/25',
    },
    attendancePermission: {
        icon: DoorOpen,
        badge: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/35 dark:text-emerald-300',
        iconBox: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
        active: 'border-emerald-300 bg-emerald-50/70 shadow-emerald-100/50 dark:border-emerald-700/70 dark:bg-emerald-950/25',
    },
    shiftRequest: {
        icon: ArrowLeftRight,
        badge: 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900/60 dark:bg-purple-950/35 dark:text-purple-300',
        iconBox: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300',
        active: 'border-purple-300 bg-purple-50/70 shadow-purple-100/50 dark:border-purple-700/70 dark:bg-purple-950/25',
    },
};

const riskRank = { critical: 3, high: 2, routine: 1 };

const differenceInDays = (start, end) => {
    if (!start || !end) return 1;
    return Math.max(1, Math.round((new Date(end) - new Date(start)) / 86400000) + 1);
};

const getAgeHours = (value) => {
    const time = value ? new Date(value).getTime() : NaN;
    return Number.isFinite(time) ? Math.max(0, (Date.now() - time) / 3600000) : null;
};

const dateValue = (value) => {
    const time = value ? new Date(value).getTime() : NaN;
    return Number.isFinite(time) ? time : Date.now();
};

const formatMoney = (value, currency, locale) => {
    try {
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency,
            maximumFractionDigits: 2,
        }).format(Number(value || 0));
    } catch {
        return `${Number(value || 0).toFixed(2)} ${currency}`;
    }
};

const formatAge = (hours, t) => {
    if (hours === null || hours === undefined) return '—';
    if (hours < 1) return t('age.lessThanHour');
    if (hours < 24) return t('age.hours', { count: Math.floor(hours) });
    return t('age.days', { count: Math.floor(hours / 24) });
};

const PendingRequests = () => {
    const { t, i18n } = useTranslation('approvals');
    const navigate = useNavigate();
    const user = useSelector(selectCurrentUser);
    const locale = i18n.language?.startsWith('ar') ? 'ar-EG' : 'en-GB';
    const permissions = useMemo(() => new Set(user?.permissions || []), [user?.permissions]);
    const elevated = ['Developer', 'Admin'].includes(user?.role);
    const hasPermission = (permission) => elevated || permissions.has(permission);
    const payrollPermissions = useMemo(() => getPayrollPermissions(user), [user]);

    const canReviewLeave = hasPermission('MANAGE_LEAVE');
    const canReviewPrivacy = hasPermission('RESOLVE_PRIVACY_REQUESTS');
    const canExportPatientData = hasPermission('EXPORT_PATIENT_DATA');
    const canAnonymizePatientData = hasPermission('ANONYMIZE_PATIENT_DATA');
    const canReviewRefund = hasPermission('APPROVE_REFUNDS') || hasPermission('ISSUE_REFUNDS');
    const canReviewClaims = hasPermission('MANAGE_INSURANCE_CLAIMS');
    const canReviewAuthorization = hasPermission('MANAGE_INSURANCE_APPROVALS');
    const canViewPayroll = payrollPermissions.view;
    const canApprovePayroll = canViewPayroll && payrollPermissions.approve;
    const canUsePayrollQueue = canViewPayroll && (
        payrollPermissions.review
        || payrollPermissions.approve
        || payrollPermissions.pay
        || payrollPermissions.lock
    );
    const canReviewVariance = hasPermission('APPROVE_SHIFT_VARIANCE');
    const canReviewPortalAppointments = hasPermission('EDIT_APPOINTMENTS');
    const canReviewProfileUpdates = hasPermission('EDIT_PATIENTS');
    const canReviewPortal = canReviewPortalAppointments || canReviewProfileUpdates;
    const canReviewPartialPayment = hasPermission('APPROVE_PARTIAL_PAYMENT_EXCEPTION');
    const canReviewAttendancePermissions = elevated || user?.role === 'HR' || hasPermission('MANAGE_ATTENDANCE') || hasPermission('MANAGE_LEAVE');
    const canReviewShiftRequests = elevated || user?.role === 'HR' || hasPermission('MANAGE_SHIFTS') || hasPermission('MANAGE_ATTENDANCE') || hasPermission('MANAGE_LEAVE');

    const leaveQuery = useGetLeaveRequestsQuery({}, {
        skip: !canReviewLeave,
        pollingInterval: 30000,
    });
    const privacyQuery = useGetPrivacyRequestsQuery(undefined, {
        skip: !canReviewPrivacy,
        pollingInterval: 30000,
    });
    const refundQuery = useGetRefundsQuery({ status: getPrimaryPendingApprovalStatus('refund'), limit: '100' }, {
        skip: !canReviewRefund,
        pollingInterval: 30000,
    });
    const claimQuery = useGetClaimsQuery({ status: getPrimaryPendingApprovalStatus('claim'), limit: 100 }, {
        skip: !canReviewClaims,
        pollingInterval: 30000,
    });
    const authorizationQuery = useGetInsuranceApprovalsQuery(undefined, {
        skip: !canReviewAuthorization,
        pollingInterval: 30000,
    });
    const deductionQuery = useGetPayrollDeductionsQuery({ status: getPrimaryPendingApprovalStatus('deduction'), limit: 100 }, {
        skip: !canApprovePayroll,
        pollingInterval: 30000,
    });
    const penaltyQuery = useGetPayrollPenaltiesQuery({ status: getPrimaryPendingApprovalStatus('penalty'), limit: 100 }, {
        skip: !canApprovePayroll,
        pollingInterval: 30000,
    });
    const ruleQuery = useGetPayrollRulesQuery({ status: getPrimaryPendingApprovalStatus('rule') }, {
        skip: !canApprovePayroll,
        pollingInterval: 30000,
    });
    const payrollQuery = useGetPayrollPeriodsQuery({ limit: 100 }, {
        skip: !canUsePayrollQueue,
        pollingInterval: 30000,
    });
    const varianceQuery = useGetCashierReconciliationQuery({}, {
        skip: !canReviewVariance,
        pollingInterval: 30000,
    });
    const partialPaymentQuery = useGetPartialPaymentExceptionsQuery({ status: getPrimaryPendingApprovalStatus('partialPayment'), limit: 100 }, {
        skip: !canReviewPartialPayment,
        pollingInterval: 30000,
    });
    const portalQuery = useGetPortalReviewRequestsQuery(undefined, {
        skip: !canReviewPortal,
        pollingInterval: 30000,
    });
    const attendancePermissionQuery = useGetAttendancePermissionsQuery({ status: 'Pending' }, {
        skip: !canReviewAttendancePermissions,
        pollingInterval: 30000,
    });
    const shiftRequestsQuery = useGetShiftRequestsQuery({ status: 'Pending' }, {
        skip: !canReviewShiftRequests,
        pollingInterval: 30000,
    });

    const [updateLeaveStatus, leaveMutation] = useUpdateLeaveStatusMutation();
    const [resolvePrivacyRequest, privacyMutation] = useResolvePrivacyRequestMutation();
    const [reviewRefund, refundMutation] = useReviewRefundMutation();
    const [updateClaimStatus, claimMutation] = useUpdateClaimStatusMutation();
    const [updateAuthorizationStatus, authorizationMutation] = useUpdateInsuranceApprovalStatusMutation();
    const [updateDeductionStatus, deductionMutation] = useUpdatePayrollDeductionStatusMutation();
    const [updatePenaltyStatus, penaltyMutation] = useUpdatePayrollPenaltyStatusMutation();
    const [updateRuleStatus, ruleMutation] = useUpdatePayrollRuleStatusMutation();
    const [updatePayrollRunStatus, payrollMutation] = useUpdatePayrollRunStatusMutation();
    const [reviewCashierClosure, varianceMutation] = useReviewCashierClosureMutation();
    const [reviewPartialPaymentException, partialPaymentMutation] = useReviewPartialPaymentExceptionMutation();
    const [reviewPortalAppointment, portalAppointmentMutation] = useReviewPortalAppointmentRequestMutation();
    const [reviewPortalProfileUpdate, profileUpdateMutation] = useReviewPortalProfileUpdateRequestMutation();
    const [updateAttendancePermissionStatus, attendancePermissionMutation] = useUpdateAttendancePermissionStatusMutation();
    const [updateShiftRequestStatus, shiftRequestMutation] = useUpdateShiftRequestStatusMutation();

    const [search, setSearch] = useState('');
    const [sourceFilter, setSourceFilter] = useState('all');
    const [riskFilter, setRiskFilter] = useState('all');
    const [sort, setSort] = useState('priority');
    const [selectedKey, setSelectedKey] = useState(null);
    const [decision, setDecision] = useState(null);

    const sourceLabels = useMemo(() => ({
        leave: t('sources.leave'),
        privacy: t('sources.privacy'),
        refund: t('sources.refund'),
        claim: t('sources.claim'),
        deduction: t('sources.deduction', { defaultValue: 'Payroll deduction' }),
        rule: t('sources.rule', { defaultValue: 'Payroll rule' }),
        penalty: t('sources.penalty'),
        payroll: t('sources.payroll'),
        variance: t('sources.variance'),
        partialPayment: t('sources.partialPayment', { defaultValue: 'Partial payment exceptions' }),
        portalAppointment: t('sources.portalAppointment'),
        profileUpdate: t('sources.profileUpdate'),
        authorization: t('sources.authorization'),
        attendancePermission: t('sources.attendancePermission', { defaultValue: 'Departure & Attendance' }),
        shiftRequest: t('sources.shiftRequest', { defaultValue: 'Shift Swaps & Modifications' }),
    }), [t]);
    const availableSources = useMemo(() => [
        canReviewLeave && 'leave',
        canReviewPrivacy && 'privacy',
        canReviewRefund && 'refund',
        canReviewClaims && 'claim',
        canApprovePayroll && 'deduction',
        canApprovePayroll && 'rule',
        canApprovePayroll && 'penalty',
        canUsePayrollQueue && 'payroll',
        canReviewVariance && 'variance',
        canReviewPartialPayment && 'partialPayment',
        canReviewPortalAppointments && 'portalAppointment',
        canReviewProfileUpdates && 'profileUpdate',
        canReviewAuthorization && 'authorization',
        canReviewAttendancePermissions && 'attendancePermission',
        canReviewShiftRequests && 'shiftRequest',
    ].filter(Boolean), [
        canApprovePayroll, canReviewClaims, canReviewLeave, canReviewPrivacy,
        canReviewRefund, canReviewVariance, canReviewPartialPayment, canReviewPortalAppointments,
        canReviewProfileUpdates, canReviewAuthorization, canReviewAttendancePermissions,
        canReviewShiftRequests, canUsePayrollQueue,
    ]);

    const items = useMemo(() => {
        const normalized = [];

        if (canReviewLeave) {
            (leaveQuery.data || [])
                .filter((request) => isPendingApprovalSourceRequest('leave', request))
                .forEach((request) => {
                    const days = differenceInDays(request.start_date, request.end_date);
                    normalized.push({
                        key: `leave:${request.request_id}`,
                        id: request.request_id,
                        source: 'leave',
                        title: request.employee_name || t('fallback.staffMember'),
                        subtitle: t('item.leaveSubtitle', { type: request.leave_type, count: days }),
                        requester: request.employee_name || t('fallback.unknown'),
                        submittedAt: request.created_at || request.updated_at,
                        risk: getAgeHours(request.created_at || request.updated_at) >= 72 ? 'high' : 'routine',
                        reason: request.reason,
                        reference: request.request_id,
                        link: '/hr',
                        approveLabel: t('actions.approve'),
                        facts: [
                            [t('facts.dates'), `${formatLocalizedDate(request.start_date, locale)} – ${formatLocalizedDate(request.end_date, locale)}`],
                            [t('facts.duration'), t('facts.days', { count: days })],
                            [t('facts.leaveType'), request.leave_type || '—'],
                        ],
                        raw: request,
                    });
                });
        }

        if (canReviewPrivacy) {
            (privacyQuery.data || [])
                .filter((request) => isPendingApprovalSourceRequest('privacy', request))
                .forEach((request) => {
                    const critical = request.request_type === 'Anonymize';
                    normalized.push({
                        key: `privacy:${request.request_id}`,
                        id: request.request_id,
                        source: 'privacy',
                        title: request.patient_name || request.mrn || t('fallback.patient'),
                        subtitle: t('item.privacySubtitle', { type: t(`privacyTypes.${request.request_type}`, { defaultValue: request.request_type }) }),
                        requester: request.requested_by_name || t('fallback.patientOrStaff'),
                        submittedAt: request.created_at,
                        risk: critical ? 'critical' : (getAgeHours(request.created_at) >= 48 ? 'high' : 'routine'),
                        reason: request.notes,
                        reference: request.mrn || request.request_id,
                        link: '/settings?tab=privacy',
                        approveLabel: request.request_type === 'Correction' ? t('actions.resolve') : t('actions.accept'),
                        approveDisabled: (
                            request.request_type === 'Export' && !canExportPatientData
                        ) || (
                            request.request_type === 'Anonymize' && !canAnonymizePatientData
                        ),
                        facts: [
                            [t('facts.patient'), request.patient_name || '—'],
                            [t('facts.mrn'), request.mrn || '—'],
                            [t('facts.requestType'), t(`privacyTypes.${request.request_type}`, { defaultValue: request.request_type })],
                        ],
                        raw: request,
                    });
                });
        }

        if (canReviewRefund) {
            (refundQuery.data || [])
                .filter((request) => isPendingApprovalSourceRequest('refund', request)
                    && (elevated && user?.role === 'Developer'
                        || String(request.requested_by) !== String(user?.user_id)))
                .forEach((request) => {
                    const amount = Number(request.amount || 0);
                    normalized.push({
                        key: `refund:${request.refund_id}`,
                        id: request.refund_id,
                        source: 'refund',
                        title: request.patient_name || request.mrn || t('fallback.patient'),
                        subtitle: t('item.refundSubtitle', { invoice: request.invoice_number || '—' }),
                        requester: request.requested_by_name || t('fallback.unknown'),
                        submittedAt: request.created_at,
                        risk: amount >= 5000 || getAgeHours(request.created_at) >= 48 ? 'high' : 'routine',
                        reason: request.reason,
                        reference: request.invoice_number || request.refund_id,
                        link: '/reception',
                        approveLabel: t('actions.approve'),
                        facts: [
                            [t('facts.amount'), formatMoney(amount, request.currency_code || 'EGP', locale)],
                            [t('facts.invoice'), request.invoice_number || '—'],
                            [t('facts.payment'), request.receipt_number || request.payment_reference || '—'],
                        ],
                        raw: request,
                    });
                });
        }

        if (canReviewClaims) {
            (claimQuery.data || [])
                .filter((request) => isPendingApprovalSourceRequest('claim', request)
                    && (user?.role === 'Developer'
                        || String(request.created_by) !== String(user?.user_id)))
                .forEach((request) => {
                    const amount = Number(request.expected_amount || 0);
                    normalized.push({
                        key: `claim:${request.claim_id}`,
                        id: request.claim_id,
                        source: 'claim',
                        title: request.claim_number || t('fallback.insuranceClaim'),
                        subtitle: request.provider_name || t('fallback.insuranceProvider'),
                        requester: request.created_by_name || t('fallback.insuranceTeam'),
                        submittedAt: request.updated_at || request.created_at,
                        risk: amount >= 10000 || getAgeHours(request.updated_at || request.created_at) >= 48 ? 'high' : 'routine',
                        reason: request.notes,
                        reference: request.invoice_number || request.claim_number || request.claim_id,
                        link: '/insurance',
                        approveLabel: t('actions.approve'),
                        facts: [
                            [t('facts.expectedAmount'), formatMoney(amount, request.currency_code || 'EGP', locale)],
                            [t('facts.provider'), request.provider_name || '—'],
                            [t('facts.invoice'), request.invoice_number || '—'],
                            [t('facts.mrn'), request.mrn || '—'],
                        ],
                        raw: request,
                    });
                });
        }

        if (canReviewAuthorization) {
            (authorizationQuery.data || [])
                .filter((request) => isPendingApprovalSourceRequest('authorization', request)
                    && (user?.role === 'Developer'
                        || String(request.requested_by) !== String(user?.user_id)))
                .forEach((request) => {
                    const amount = Number(request.requested_amount || 0);
                    normalized.push({
                        key: `authorization:${request.approval_id}`,
                        id: request.approval_id,
                        source: 'authorization',
                        title: request.mrn || t('fallback.patient'),
                        subtitle: t('item.authorizationSubtitle'),
                        requester: request.requested_by_name || t('fallback.insuranceTeam'),
                        submittedAt: request.requested_at,
                        risk: amount >= 10000 || getAgeHours(request.requested_at) >= 48 ? 'high' : 'routine',
                        reason: null,
                        reference: request.approval_id,
                        link: '/insurance?tab=approvals',
                        approveLabel: t('actions.approve'),
                        facts: [
                            [t('facts.requestedAmount'), formatMoney(amount, request.currency_code || 'EGP', locale)],
                            [t('facts.provider'), request.provider_name || t('fallback.insuranceProvider')],
                            [t('facts.exam'), request.exam_type_name || t('fallback.notSpecified')],
                        ],
                        raw: request,
                    });
                });
        }

        if (canApprovePayroll) {
            (deductionQuery.data || [])
                .filter((request) => isPendingApprovalSourceRequest('deduction', request)
                    && (user?.role === 'Developer'
                        || String(request.created_by) !== String(user?.user_id)))
                .forEach((request) => {
                    const amount = Number(request.amount || 0);
                    const percentage = Number(request.percentage || 0);
                    normalized.push({
                        key: `deduction:${request.deduction_id}`,
                        id: request.deduction_id,
                        source: 'deduction',
                        title: request.employee_name || t('fallback.staffMember'),
                        subtitle: request.name || t('fallback.deduction', { defaultValue: 'Deduction' }),
                        requester: request.created_by_name || t('fallback.unknown'),
                        submittedAt: request.created_at,
                        risk: amount >= 5000 || percentage >= 25 ? 'high' : 'routine',
                        reason: request.notes,
                        reference: request.deduction_id,
                        link: '/payroll',
                        approveLabel: t('actions.approve'),
                        facts: [
                            [t('facts.amount'), amount ? formatMoney(amount, request.currency_code || 'EGP', locale) : `${percentage}%`],
                            [t('facts.source'), request.deduction_type || t('fallback.unknown')],
                        ],
                        raw: request,
                    });
                });

            (ruleQuery.data || [])
                .filter((request) => isPendingApprovalSourceRequest('rule', request)
                    && (user?.role === 'Developer'
                        || String(request.created_by) !== String(user?.user_id)))
                .forEach((request) => {
                    const value = Number(request.value || 0);
                    normalized.push({
                        key: `rule:${request.rule_id}`,
                        id: request.rule_id,
                        source: 'rule',
                        title: request.name || t('fallback.payrollRule', { defaultValue: 'Payroll rule' }),
                        subtitle: t('item.payrollRuleSubtitle', {
                            type: request.rule_type || t('fallback.payrollRule', { defaultValue: 'Payroll rule' }),
                        }),
                        requester: request.created_by_name || t('fallback.unknown'),
                        submittedAt: request.created_at,
                        risk: value >= 5000 || ['Deduction', 'Penalty'].includes(request.rule_type) ? 'high' : 'routine',
                        reason: request.metadata?.notes || request.metadata?.reason || null,
                        reference: request.rule_id,
                        link: '/payroll',
                        approveLabel: t('actions.approve'),
                        facts: [
                            [t('facts.ruleType', { defaultValue: 'Rule type' }), request.rule_type || t('fallback.unknown')],
                            [t('facts.method', { defaultValue: 'Method' }), request.calculation_method || t('fallback.unknown')],
                            [t('facts.value', { defaultValue: 'Value' }), value],
                            [t('facts.effectiveFrom', { defaultValue: 'Effective from' }), formatLocalizedDate(request.effective_from, locale)],
                        ],
                        raw: request,
                    });
                });

            (penaltyQuery.data || [])
                .filter((request) => isPendingApprovalSourceRequest('penalty', request)
                    && (user?.role === 'Developer'
                        || String(request.created_by) !== String(user?.user_id)))
                .forEach((request) => {
                    const amount = Number(request.amount || 0);
                    normalized.push({
                        key: `penalty:${request.penalty_id}`,
                        id: request.penalty_id,
                        source: 'penalty',
                        title: request.employee_name || t('fallback.staffMember'),
                        subtitle: t('item.penaltySubtitle', {
                            type: request.penalty_type || t('fallback.penalty'),
                        }),
                        requester: request.created_by_name || t('fallback.unknown'),
                        submittedAt: request.created_at,
                        risk: amount >= 5000 || getAgeHours(request.created_at) >= 48 ? 'high' : 'routine',
                        reason: request.reason,
                        reference: request.penalty_id,
                        link: '/payroll',
                        approveLabel: t('actions.approve'),
                        facts: [
                            [t('facts.amount'), formatMoney(amount, request.currency_code || 'EGP', locale)],
                            [t('facts.penaltyType'), request.penalty_type || t('fallback.unknown')],
                            [t('facts.source'), request.source || t('fallback.unknown')],
                        ],
                        raw: request,
                    });
                });

        }

        if (canUsePayrollQueue) {
            (payrollQuery.data || [])
                .map((request) => ({
                    period: request,
                    action: payrollQueueActionForStatus(request.run_status || request.status, payrollPermissions),
                }))
                .filter(({ period, action }) => period.run_id && action)
                .forEach(({ period, action }) => {
                    normalized.push({
                        key: `payroll:${action.actionStatus}:${period.run_id}`,
                        id: period.run_id,
                        source: 'payroll',
                        title: period.name || t('fallback.payrollRun'),
                        subtitle: t(action.subtitleKey),
                        requester: period.reviewed_by_name || period.approved_by_name || period.paid_by_name || period.created_by_name || t('fallback.payrollTeam'),
                        submittedAt: period.reviewed_at || period.approved_at || period.paid_at || period.updated_at || period.created_at,
                        risk: action.risk,
                        reason: period.notes,
                        reference: period.run_id,
                        link: '/payroll',
                        approveLabel: t(action.approveLabelKey),
                        rejectDisabled: action.rejectDisabled,
                        rejectMessageKey: action.rejectMessageKey,
                        actionStatus: action.actionStatus,
                        requiresPayment: action.requiresPayment,
                        needsApprovalNotes: action.needsApprovalNotes,
                        facts: [
                            [t('facts.period'), `${formatLocalizedDate(period.start_date, locale)} - ${formatLocalizedDate(period.end_date, locale)}`],
                            [t('facts.employees'), period.employee_count ?? 0],
                            [t('facts.netPay'), formatMoney(period.total_net, period.currency_code || 'EGP', locale)],
                        ],
                        raw: period,
                    });
                });
        }

        if (canReviewVariance) {
            (varianceQuery.data?.data || [])
                .filter((request) => isPendingApprovalSourceRequest('variance', request)
                    && request.closure_id
                    && (user?.role === 'Developer' || String(request.cashier_id) !== String(user?.user_id)))
                .forEach((request) => {
                    const variance = Number(request.variance || 0);
                    normalized.push({
                        key: `variance:${request.closure_id}`,
                        id: request.closure_id,
                        source: 'variance',
                        title: request.cashier_name || t('fallback.cashier'),
                        subtitle: t('item.varianceSubtitle'),
                        requester: request.cashier_name || t('fallback.cashier'),
                        submittedAt: request.closed_at || request.updated_at || request.opened_at,
                        risk: Math.abs(variance) >= 1000 ? 'high' : 'routine',
                        reason: request.variance_reason,
                        reference: request.closure_id,
                        link: '/financials?tab=cashier',
                        approveLabel: t('actions.review'),
                        rejectDisabled: true,
                        facts: [
                            [t('facts.expectedCash'), formatMoney(request.expected_cash, request.currency_code || 'EGP', locale)],
                            [t('facts.countedCash'), formatMoney(request.counted_cash, request.currency_code || 'EGP', locale)],
                            [t('facts.variance'), formatMoney(variance, request.currency_code || 'EGP', locale)],
                        ],
                        raw: request,
                    });
                });
        }

        if (canReviewPartialPayment) {
            (partialPaymentQuery.data || [])
                .filter((request) => isPendingApprovalSourceRequest('partialPayment', request)
                    && (user?.role === 'Developer'
                        || String(request.requested_by) !== String(user?.user_id)))
                .forEach((request) => {
                    const balance = Number(request.requested_balance_amount || 0);
                    const transactionLabel = t(`partialPaymentTransactions.${request.transaction_type}`, {
                        defaultValue: request.transaction_type === 'ResultDelivery' ? 'Result delivery' : 'Clinical queue movement',
                    });
                    normalized.push({
                        key: `partialPayment:${request.exception_id}`,
                        id: request.exception_id,
                        source: 'partialPayment',
                        title: request.patient_name || request.mrn || t('fallback.patient'),
                        subtitle: t('item.partialPaymentSubtitle', {
                            transaction: transactionLabel,
                            invoice: request.invoice_number || '—',
                            defaultValue: `${transactionLabel} exception for invoice ${request.invoice_number || '—'}`,
                        }),
                        requester: request.requested_by_name || t('fallback.unknown'),
                        submittedAt: request.requested_at,
                        risk: balance >= 5000 || getAgeHours(request.requested_at) >= 24 ? 'high' : 'routine',
                        reason: request.reason,
                        reference: request.invoice_number || request.exception_id,
                        link: '/reception',
                        approveLabel: t('actions.approve'),
                        facts: [
                            [t('facts.invoice'), request.invoice_number || '—'],
                            [t('facts.transaction', { defaultValue: 'Transaction' }), transactionLabel],
                            [t('facts.netPaid', { defaultValue: 'Net paid' }), formatMoney(request.net_paid_amount, request.currency_code || 'EGP', locale)],
                            [t('facts.balance', { defaultValue: 'Balance' }), formatMoney(balance, request.currency_code || 'EGP', locale)],
                        ],
                        raw: request,
                    });
                });
        }

        if (canReviewPortalAppointments) {
            (portalQuery.data?.appointmentRequests || [])
                .filter((request) => isPendingApprovalSourceRequest('portalAppointment', request))
                .forEach((request) => {
                    const preferredTime = request.preferred_date
                        ? new Date(request.preferred_date).getTime()
                        : null;
                    const dueSoon = Number.isFinite(preferredTime)
                        && preferredTime - Date.now() <= 72 * 3600000;
                    normalized.push({
                        key: `portalAppointment:${request.request_id}`,
                        id: request.request_id,
                        source: 'portalAppointment',
                        title: request.patient_name || request.mrn || t('fallback.patient'),
                        subtitle: t('item.portalAppointmentSubtitle'),
                        requester: request.patient_name || t('fallback.patient'),
                        submittedAt: request.created_at,
                        risk: dueSoon || getAgeHours(request.created_at) >= 48 ? 'high' : 'routine',
                        reason: request.clinical_notes,
                        reference: request.mrn || request.request_id,
                        link: '/appointments',
                        approveLabel: t('actions.accept'),
                        facts: [
                            [t('facts.preferredDate'), request.preferred_date
                                ? formatLocalizedDate(request.preferred_date, locale)
                                : t('fallback.notSpecified')],
                            [t('facts.timeWindow'), request.preferred_time_window || t('fallback.notSpecified')],
                            [t('facts.exam'), request.exam_type_name || request.modality_type || t('fallback.notSpecified')],
                            [t('facts.contact'), request.contact_phone || request.contact_email || t('fallback.notSpecified')],
                        ],
                        raw: request,
                    });
                });
        }

        if (canReviewProfileUpdates) {
            (portalQuery.data?.profileUpdateRequests || [])
                .filter((request) => isPendingApprovalSourceRequest('profileUpdate', request))
                .forEach((request) => {
                    const changes = Object.entries(request.requested_changes || {});
                    const changeSummary = changes.map(([field, value]) => (
                        `${t(`profileFields.${field}`, { defaultValue: field })}: ${value}`
                    )).join('\n');
                    normalized.push({
                        key: `profileUpdate:${request.update_request_id}`,
                        id: request.update_request_id,
                        source: 'profileUpdate',
                        title: request.patient_name || request.mrn || t('fallback.patient'),
                        subtitle: t('item.profileUpdateSubtitle'),
                        requester: request.patient_name || t('fallback.patient'),
                        submittedAt: request.created_at,
                        risk: getAgeHours(request.created_at) >= 48 ? 'high' : 'routine',
                        reason: changeSummary,
                        reference: request.mrn || request.update_request_id,
                        link: `/patients/${request.patient_id}`,
                        approveLabel: t('actions.approve'),
                        facts: [
                            [t('facts.mrn'), request.mrn || t('fallback.notSpecified')],
                            [t('facts.requestedChanges'), t('facts.fields', { count: changes.length })],
                        ],
                        raw: request,
                    });
                });
        }

        if (canReviewAttendancePermissions) {
            (attendancePermissionQuery.data || [])
                .filter((request) => isPendingApprovalSourceRequest('attendancePermission', request)
                    && (String(request.user_id) !== String(user?.user_id)))
                .forEach((request) => {
                    const permKey = request.permission_type ? (request.permission_type.charAt(0).toLowerCase() + request.permission_type.slice(1)) : '';
                    const permTypeLabel = t(`attendancePermissionTypes.${permKey}`, {
                        defaultValue: request.permission_type === 'EarlyDeparture'
                            ? (locale === 'ar-EG' ? 'إذن انصراف مبكر' : 'Early Departure')
                            : request.permission_type === 'LateArrival'
                                ? (locale === 'ar-EG' ? 'إذن حضور متأخر' : 'Late Arrival')
                                : (locale === 'ar-EG' ? 'إذن دخول طارئ للنظام' : 'Emergency Access'),
                    });
                    normalized.push({
                        key: `attendancePermission:${request.permission_id}`,
                        id: request.permission_id,
                        source: 'attendancePermission',
                        title: request.employee_name || t('fallback.staffMember'),
                        subtitle: t('item.attendancePermissionSubtitle', {
                            type: permTypeLabel,
                            minutes: request.minutes_granted || 0,
                            date: formatLocalizedDate(request.effective_date, locale),
                            defaultValue: `${permTypeLabel} (${request.minutes_granted || 0} min) · ${formatLocalizedDate(request.effective_date, locale)}`,
                        }),
                        requester: request.employee_name || t('fallback.unknown'),
                        submittedAt: request.created_at || request.updated_at,
                        risk: getAgeHours(request.created_at) >= 48 ? 'high' : 'routine',
                        reason: request.reason,
                        reference: request.permission_id,
                        link: '/hr?tab=attendance',
                        approveLabel: t('actions.approve'),
                        facts: [
                            [t('facts.effectiveDate', { defaultValue: 'Effective date' }), formatLocalizedDate(request.effective_date, locale)],
                            [t('facts.permissionType', { defaultValue: 'Permission type' }), permTypeLabel],
                            [t('facts.allowedTime', { defaultValue: 'Allowed time' }), request.allowed_time || '—'],
                            [t('facts.minutesGranted', { defaultValue: 'Minutes granted' }), `${request.minutes_granted || 0} ${t('facts.minutes', { defaultValue: 'minutes' })}`],
                            ...(request.shift_start ? [[t('facts.shift', { defaultValue: 'Shift' }), `${request.shift_start.slice(0, 5)} – ${request.shift_end?.slice(0, 5)}`]] : []),
                        ],
                        raw: request,
                    });
                });
        }

        if (canReviewShiftRequests) {
            (shiftRequestsQuery.data || [])
                .filter((request) => isPendingApprovalSourceRequest('shiftRequest', request)
                    && (String(request.user_id) !== String(user?.user_id)))
                .forEach((request) => {
                    const isSwap = request.request_type === 'Swap';
                    const typeLabel = isSwap
                        ? (locale === 'ar-EG' ? 'طلب تبديل وردية' : 'Shift Swap Request')
                        : (locale === 'ar-EG' ? 'طلب تعديل وردية' : 'Shift Modification Request');
                    normalized.push({
                        key: `shiftRequest:${request.request_id}`,
                        id: request.request_id,
                        source: 'shiftRequest',
                        title: request.requester_name || t('fallback.staffMember'),
                        subtitle: isSwap
                            ? `${typeLabel} · مع ${request.target_user_name || 'زميل'}`
                            : `${typeLabel} · ${formatLocalizedDate(request.proposed_start_time, locale)}`,
                        requester: request.requester_name || t('fallback.unknown'),
                        submittedAt: request.created_at || request.updated_at,
                        risk: getAgeHours(request.created_at) >= 48 ? 'high' : 'routine',
                        reason: request.reason,
                        reference: request.request_id,
                        link: '/hr',
                        approveLabel: t('actions.approve'),
                        facts: [
                            [t('facts.requestType', { defaultValue: 'نوع الطلب' }), typeLabel],
                            [t('facts.currentShift', { defaultValue: 'الوردية الأصلية' }), request.current_start_time ? formatLocalizedDate(request.current_start_time, locale) : '—'],
                            ...(isSwap ? [[t('facts.targetColleague', { defaultValue: 'الزميل المراد التبديل معه' }), request.target_user_name || '—']] : []),
                            ...(!isSwap && request.proposed_start_time ? [[t('facts.proposedTime', { defaultValue: 'الموعد المقترح' }), `${new Date(request.proposed_start_time).toLocaleTimeString()} - ${new Date(request.proposed_end_time).toLocaleTimeString()}`]] : []),
                            [t('facts.reason', { defaultValue: 'السبب' }), request.reason || '—'],
                        ],
                        raw: request,
                    });
                });
        }

        return normalized.map((item) => markPendingApproval(item, sourceLabels, t));
    }, [
        canAnonymizePatientData, canExportPatientData,
        authorizationQuery.data, canApprovePayroll, canUsePayrollQueue,
        canReviewAuthorization, canReviewClaims, canReviewLeave,
        canReviewPrivacy, canReviewRefund, canReviewVariance, canReviewPartialPayment,
        canReviewPortalAppointments, canReviewProfileUpdates, canReviewShiftRequests, canReviewAttendancePermissions, claimQuery.data, elevated,
        deductionQuery.data, leaveQuery.data, locale, partialPaymentQuery.data, payrollPermissions, payrollQuery.data, penaltyQuery.data, privacyQuery.data,
        portalQuery.data, refundQuery.data, sourceLabels, t, user?.role, user?.user_id,
        varianceQuery.data, ruleQuery.data, attendancePermissionQuery.data, shiftRequestsQuery.data,
    ]);

    const counts = useMemo(() => items.reduce((result, item) => {
        result[item.source] = (result[item.source] || 0) + 1;
        return result;
    }, {}), [items]);

    const filteredItems = useMemo(() => {
        const query = search.trim().toLowerCase();
        const result = items.filter((item) => {
            if (sourceFilter !== 'all' && item.source !== sourceFilter) return false;
            if (riskFilter !== 'all' && item.risk !== riskFilter) return false;
            if (!query) return true;
            return [
                item.title, item.subtitle, item.requester, item.reference,
                item.reason, item.approvalStatusLabel, item.sourceLabel, item.sourceStatus, sourceLabels[item.source],
            ].filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
        });

        return result.sort((left, right) => {
            if (sort === 'newest') return dateValue(right.submittedAt) - dateValue(left.submittedAt);
            if (sort === 'oldest') return dateValue(left.submittedAt) - dateValue(right.submittedAt);
            return (riskRank[right.risk] - riskRank[left.risk])
                || (dateValue(left.submittedAt) - dateValue(right.submittedAt));
        });
    }, [items, riskFilter, search, sort, sourceFilter, sourceLabels]);

    const selectedItem = filteredItems.find((item) => item.key === selectedKey) || filteredItems[0] || null;

    useEffect(() => {
        if (!selectedItem) {
            setSelectedKey(null);
        } else if (selectedItem.key !== selectedKey) {
            setSelectedKey(selectedItem.key);
        }
    }, [selectedItem, selectedKey]);

    const enabledQueries = [
        canReviewLeave && leaveQuery,
        canReviewPrivacy && privacyQuery,
        canReviewRefund && refundQuery,
        canReviewClaims && claimQuery,
        canReviewAuthorization && authorizationQuery,
        canApprovePayroll && deductionQuery,
        canApprovePayroll && ruleQuery,
        canApprovePayroll && penaltyQuery,
        canUsePayrollQueue && payrollQuery,
        canReviewVariance && varianceQuery,
        canReviewPartialPayment && partialPaymentQuery,
        canReviewPortal && portalQuery,
        canReviewAttendancePermissions && attendancePermissionQuery,
        canReviewShiftRequests && shiftRequestsQuery,
    ].filter(Boolean);
    const loading = enabledQueries.some((query) => query.isLoading);
    const fetching = enabledQueries.some((query) => query.isFetching);
    const failedSources = enabledQueries.filter((query) => query.isError).length;
    const busy = leaveMutation.isLoading
        || privacyMutation.isLoading
        || refundMutation.isLoading
        || claimMutation.isLoading
        || authorizationMutation.isLoading
        || deductionMutation.isLoading
        || ruleMutation.isLoading
        || penaltyMutation.isLoading
        || payrollMutation.isLoading
        || varianceMutation.isLoading
        || partialPaymentMutation.isLoading
        || portalAppointmentMutation.isLoading
        || profileUpdateMutation.isLoading
        || attendancePermissionMutation.isLoading
        || shiftRequestMutation.isLoading;
    const highRiskCount = items.filter((item) => item.risk !== 'routine').length;
    const oldestHours = items.length
        ? items.reduce((max, item) => Math.max(max, getAgeHours(item.submittedAt) || 0), 0)
        : null;

    const refreshAll = () => {
        if (canReviewLeave) leaveQuery.refetch();
        if (canReviewPrivacy) privacyQuery.refetch();
        if (canReviewRefund) refundQuery.refetch();
        if (canReviewClaims) claimQuery.refetch();
        if (canReviewAuthorization) authorizationQuery.refetch();
        if (canApprovePayroll) deductionQuery.refetch();
        if (canApprovePayroll) ruleQuery.refetch();
        if (canApprovePayroll) penaltyQuery.refetch();
        if (canUsePayrollQueue) payrollQuery.refetch();
        if (canReviewVariance) varianceQuery.refetch();
        if (canReviewPartialPayment) partialPaymentQuery.refetch();
        if (canReviewPortal) portalQuery.refetch();
        if (canReviewAttendancePermissions) attendancePermissionQuery.refetch();
        if (canReviewShiftRequests) shiftRequestsQuery.refetch();
    };

    const executeDecision = async (notes = '') => {
        if (!decision) return false;
        const { item, action } = decision;
        const approved = action === 'approve';

        try {
            if (item.source === 'leave') {
                await updateLeaveStatus({
                    id: item.id,
                    status: approved ? 'Approved' : 'Rejected',
                }).unwrap();
            } else if (item.source === 'refund') {
                await reviewRefund({
                    id: item.id,
                    status: approved ? 'Approved' : 'Rejected',
                    reason: notes,
                }).unwrap();
            } else if (item.source === 'claim') {
                await updateClaimStatus({
                    id: item.id,
                    status: approved ? 'Approved' : 'Rejected',
                    ...(approved ? {} : { rejectionReason: notes }),
                }).unwrap();
            } else if (item.source === 'authorization') {
                await updateAuthorizationStatus({
                    id: item.id,
                    status: approved ? 'Approved' : 'Rejected',
                    ...(approved
                        ? {
                            approvalNumber: notes,
                            approvedAmount: Number(item.raw.requested_amount || 0),
                        }
                        : { rejectionReason: notes }),
                }).unwrap();
            } else if (item.source === 'privacy') {
                const privacyAction = approved
                    ? (item.raw.request_type === 'Correction'
                        ? 'Resolve'
                        : item.raw.request_type === 'Anonymize' && item.raw.status === 'InReview'
                            ? 'CompleteAnonymization'
                            : item.raw.request_type)
                    : 'Reject';
                await resolvePrivacyRequest({
                    requestId: item.id,
                    action: privacyAction,
                    notes: notes || undefined,
                }).unwrap();
            } else if (item.source === 'deduction') {
                await updateDeductionStatus({
                    id: item.id,
                    status: approved ? 'Approved' : 'Cancelled',
                    notes: notes || undefined,
                }).unwrap();
            } else if (item.source === 'rule') {
                await updateRuleStatus({
                    id: item.id,
                    status: approved ? 'Approved' : 'Rejected',
                    notes: notes || undefined,
                }).unwrap();
            } else if (item.source === 'penalty') {
                await updatePenaltyStatus({
                    id: item.id,
                    status: approved ? 'Approved' : 'Rejected',
                    notes: notes || undefined,
                }).unwrap();
            } else if (item.source === 'payroll') {
                const status = approved ? item.actionStatus : 'Cancelled';
                const paymentPayload = status === 'Paid'
                    ? {
                        paymentMethod: 'BankTransfer',
                        paidAmount: Number(item.raw.total_net || 0),
                        paidDate: todayInput(),
                        referenceNumber: notes,
                        idempotencyKey: getStoredPayrollPaymentKey(item.id),
                    }
                    : {};
                await updatePayrollRunStatus({
                    runId: item.id,
                    status,
                    notes: notes || undefined,
                    ...paymentPayload,
                }).unwrap();
                if (status === 'Paid') clearStoredPayrollPaymentKey(item.id);
            } else if (item.source === 'variance') {
                await reviewCashierClosure({
                    id: item.id,
                    reviewNotes: notes,
                }).unwrap();
            } else if (item.source === 'partialPayment') {
                await reviewPartialPaymentException({
                    id: item.id,
                    status: approved ? 'Approved' : 'Rejected',
                    reviewNotes: notes,
                }).unwrap();
            } else if (item.source === 'portalAppointment') {
                await reviewPortalAppointment({
                    id: item.id,
                    status: approved ? 'Reviewed' : 'Rejected',
                    staffNotes: notes,
                }).unwrap();
            } else if (item.source === 'profileUpdate') {
                await reviewPortalProfileUpdate({
                    id: item.id,
                    status: approved ? 'Approved' : 'Rejected',
                    staffNotes: notes,
                }).unwrap();
            } else if (item.source === 'attendancePermission') {
                await updateAttendancePermissionStatus({
                    id: item.id,
                    status: approved ? 'Approved' : 'Rejected',
                    reviewNotes: notes || undefined,
                }).unwrap();
            } else if (item.source === 'shiftRequest') {
                await updateShiftRequestStatus({
                    id: item.id,
                    status: approved ? 'Approved' : 'Rejected',
                    reviewNotes: notes || undefined,
                }).unwrap();
            }

            toast.success(t(approved ? 'messages.approved' : 'messages.rejected', {
                source: sourceLabels[item.source],
            }));
            setDecision(null);
            return true;
        } catch (error) {
            toast.error(getErrorMessage(error, t('messages.failed')));
            return false;
        }
    };

    const decisionNeedsNotes = Boolean(decision && (
        (decision.action === 'reject' && decision.item.source !== 'leave')
        || (decision.action === 'approve' && decision.item.source === 'refund')
        || (decision.action === 'approve' && decision.item.source === 'variance')
        || (decision.item.source === 'partialPayment')
        || (decision.action === 'approve' && decision.item.source === 'portalAppointment')
        || (decision.action === 'approve' && decision.item.source === 'profileUpdate')
        || (decision.action === 'approve' && decision.item.source === 'authorization')
        || (decision.action === 'approve' && decision.item.source === 'payroll' && decision.item.requiresPayment)
        || (decision.action === 'approve' && decision.item.source === 'payroll' && decision.item.needsApprovalNotes)
        || (
            decision.action === 'approve'
            && decision.item.source === 'privacy'
            && decision.item.raw.request_type === 'Correction'
        )
    ));
    const authorizationApproval = decision?.action === 'approve'
        && decision?.item?.source === 'authorization';
    const payrollPaymentApproval = decision?.action === 'approve'
        && decision?.item?.source === 'payroll'
        && decision?.item?.requiresPayment;
    const partialPaymentDecision = decision?.item?.source === 'partialPayment';
    const decisionNoteMinimum = authorizationApproval
        ? 2
        : (decision?.item?.source === 'privacy' || partialPaymentDecision ? 5 : 3);
    const decisionTooShortMessage = t('dialog.tooShort', {
        defaultValue: 'Use at least 3 characters.',
    }).replace(/\d+/, String(decisionNoteMinimum));
    const payrollDecisionMessageKey = decision?.action === 'approve' && decision?.item?.source === 'payroll'
        ? {
            Reviewed: 'dialog.payrollReviewMessage',
            Paid: 'dialog.payrollPaidMessage',
            Locked: 'dialog.payrollLockMessage',
        }[decision.item.actionStatus]
        : null;
    const confirmMessageKey = payrollDecisionMessageKey
        || (decision?.action === 'approve' ? 'dialog.approveMessage' : 'dialog.rejectWithoutReason');

    return (
        <main className="app-page">
            <div className="mx-auto max-w-screen-2xl space-y-5 pb-10">
                <PageHeader
                    icon={Inbox}
                    eyebrow={t('header.eyebrow')}
                    title={t('header.title')}
                    description={t('header.description')}
                    className="overflow-hidden rounded-3xl border-slate-200/80 bg-gradient-to-br from-white via-slate-50/70 to-cyan-50/50 shadow-xl shadow-slate-200/35 dark:border-white/10 dark:from-slate-950 dark:via-slate-900 dark:to-cyan-950/20 dark:shadow-none"
                    meta={
                        <div className="flex flex-wrap gap-2">
                            <HeaderPill icon={Clock3} label={t('header.liveQueue')} />
                            <HeaderPill icon={ShieldCheck} label={t('header.audited')} />
                            <HeaderPill icon={CheckCircle2} label={t('header.decisionReady')} />
                        </div>
                    }
                    metrics={[
                        { key: 'pending', label: t('summary.pending'), value: items.length, icon: Inbox, tone: 'cyan' },
                        { key: 'priority', label: t('summary.priority'), value: highRiskCount, icon: ShieldAlert, tone: 'rose' },
                        { key: 'oldest', label: t('summary.oldest'), value: formatAge(oldestHours, t), icon: Clock3, tone: 'amber' },
                        { key: 'sources', label: t('summary.sources'), value: Object.values(counts).filter(Boolean).length, icon: WalletCards, tone: 'slate' },
                    ]}
                    metricsLabel={t('summary.label')}
                    actions={
                        <button
                            type="button"
                            onClick={refreshAll}
                            disabled={fetching}
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            <RefreshCw size={16} className={fetching ? 'animate-spin' : ''} />
                            {t('actions.refresh')}
                        </button>
                    }
                />

                <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label={t('summary.label')}>
                    <SummaryCard icon={Inbox} label={t('summary.pending')} value={items.length} tone="cyan" />
                    <SummaryCard icon={ShieldAlert} label={t('summary.priority')} value={highRiskCount} tone="rose" />
                    <SummaryCard icon={Clock3} label={t('summary.oldest')} value={formatAge(oldestHours, t)} tone="amber" />
                    <SummaryCard icon={WalletCards} label={t('summary.sources')} value={Object.values(counts).filter(Boolean).length} tone="indigo" />
                </section>

                {failedSources > 0 && (
                    <div role="alert" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                        <AlertCircle size={18} className="mt-0.5 shrink-0" />
                        <span>{t('errors.partial', { count: failedSources })}</span>
                    </div>
                )}

                <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-xl shadow-slate-200/30 dark:border-white/10 dark:bg-[#07111f] dark:shadow-none">
                    <div className="border-b border-slate-200/80 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.025]">
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                            <label className="relative min-w-0 flex-1">
                                <span className="sr-only">{t('filters.search')}</span>
                                <Search size={16} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="search"
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                    placeholder={t('filters.searchPlaceholder')}
                                    className="h-11 w-full rounded-xl border border-slate-200 bg-white ps-10 pe-4 text-sm font-semibold text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                                />
                            </label>
                            <div className="grid grid-cols-2 gap-2 sm:flex">
                                <SelectFilter
                                    icon={ShieldAlert}
                                    label={t('filters.risk')}
                                    value={riskFilter}
                                    onChange={setRiskFilter}
                                    options={[
                                        ['all', t('filters.allRisk')],
                                        ['critical', t('risk.critical')],
                                        ['high', t('risk.high')],
                                        ['routine', t('risk.routine')],
                                    ]}
                                />
                                <SelectFilter
                                    icon={ArrowUpDown}
                                    label={t('filters.sort')}
                                    value={sort}
                                    onChange={setSort}
                                    options={[
                                        ['priority', t('sort.priority')],
                                        ['oldest', t('sort.oldest')],
                                        ['newest', t('sort.newest')],
                                    ]}
                                />
                            </div>
                        </div>

                        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label={t('filters.source')}>
                            <SourceFilter
                                active={sourceFilter === 'all'}
                                label={t('sources.all')}
                                count={items.length}
                                onClick={() => setSourceFilter('all')}
                            />
                            {availableSources.map((source) => (
                                <SourceFilter
                                    key={source}
                                    active={sourceFilter === source}
                                    label={sourceLabels[source]}
                                    count={counts[source] || 0}
                                    onClick={() => setSourceFilter(source)}
                                />
                            ))}
                        </div>
                    </div>

                    {loading ? (
                        <LoadingState />
                    ) : filteredItems.length === 0 ? (
                        <EmptyState
                            filtered={Boolean(search || sourceFilter !== 'all' || riskFilter !== 'all')}
                            t={t}
                            onClear={() => {
                                setSearch('');
                                setSourceFilter('all');
                                setRiskFilter('all');
                            }}
                        />
                    ) : (
                        <div className="grid lg:grid-cols-[minmax(330px,0.9fr)_minmax(0,1.35fr)]">
                            <div className="max-h-[690px] overflow-y-auto border-b border-slate-200/80 dark:border-white/10 lg:border-b-0 lg:border-e">
                                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-white/5">
                                    <p className="text-xs font-black uppercase tracking-[.14em] text-slate-500 dark:text-slate-400">
                                        {t('queue.title')}
                                    </p>
                                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                        {filteredItems.length}
                                    </span>
                                </div>
                                <div className="space-y-2 p-3">
                                    {filteredItems.map((item) => (
                                        <QueueItem
                                            key={item.key}
                                            item={item}
                                            active={selectedItem?.key === item.key}
                                            sourceLabel={sourceLabels[item.source]}
                                            locale={locale}
                                            t={t}
                                            onSelect={() => setSelectedKey(item.key)}
                                        />
                                    ))}
                                </div>
                            </div>

                            <RequestDetail
                                item={selectedItem}
                                sourceLabel={sourceLabels[selectedItem?.source]}
                                locale={locale}
                                t={t}
                                busy={busy}
                                onNavigate={() => navigate(selectedItem.link)}
                                onApprove={() => setDecision({ item: selectedItem, action: 'approve' })}
                                onReject={() => setDecision({ item: selectedItem, action: 'reject' })}
                            />
                        </div>
                    )}
                </section>
            </div>

            {decisionNeedsNotes ? (
                <TextPromptDialog
                    isOpen={Boolean(decision)}
                    onClose={() => setDecision(null)}
                    onConfirm={executeDecision}
                    title={decision?.action === 'approve' ? t('dialog.approveTitle') : t('dialog.rejectTitle')}
                    message={t(authorizationApproval
                        ? 'dialog.approvalNumberMessage'
                        : payrollPaymentApproval
                            ? 'dialog.payrollPaymentReferenceMessage'
                        : (decision?.action === 'approve' ? 'dialog.approveNotesMessage' : 'dialog.rejectMessage'), {
                        title: decision?.item?.title,
                        defaultValue: payrollPaymentApproval
                            ? 'Enter the bank transfer reference before marking {{title}} as paid.'
                            : undefined,
                    })}
                    label={t(authorizationApproval
                        ? 'facts.approvalNumber'
                        : payrollPaymentApproval
                            ? 'facts.paymentReference'
                        : (decision?.action === 'approve' ? 'dialog.notesLabel' : 'dialog.reasonLabel'), {
                        defaultValue: payrollPaymentApproval ? 'Payment reference' : undefined,
                    })}
                    placeholder={t(authorizationApproval
                        ? 'dialog.approvalNumberPlaceholder'
                        : payrollPaymentApproval
                            ? 'dialog.paymentReferencePlaceholder'
                        : (decision?.action === 'approve' ? 'dialog.notesPlaceholder' : 'dialog.reasonPlaceholder'), {
                        defaultValue: payrollPaymentApproval ? 'Enter bank transfer reference' : undefined,
                    })}
                    confirmLabel={decision?.action === 'approve' ? decision?.item?.approveLabel : t('actions.reject')}
                    cancelLabel={t('actions.cancel')}
                    validationMessage={t('dialog.required')}
                    validate={(value) => value.length < decisionNoteMinimum ? decisionTooShortMessage : ''}
                    inputProps={{ maxLength: authorizationApproval ? 100 : payrollPaymentApproval ? 120 : 1000 }}
                    isLoading={busy}
                />
            ) : (
                <ConfirmDialog
                    isOpen={Boolean(decision)}
                    onClose={() => setDecision(null)}
                    onConfirm={() => executeDecision('')}
                    title={decision?.action === 'approve' ? t('dialog.approveTitle') : t('dialog.rejectTitle')}
                    message={t(confirmMessageKey, {
                        title: decision?.item?.title,
                        source: sourceLabels[decision?.item?.source],
                        amount: decision?.item?.source === 'payroll'
                            ? formatMoney(decision.item.raw.total_net, decision.item.raw.currency_code || 'EGP', locale)
                            : undefined,
                        date: todayInput(),
                    })}
                    confirmLabel={decision?.action === 'approve' ? decision?.item?.approveLabel : t('actions.reject')}
                    cancelLabel={t('actions.cancel')}
                    variant={decision?.action === 'approve' ? 'info' : 'warning'}
                    isLoading={busy}
                />
            )}
        </main>
    );
};

const HeaderPill = ({ icon: Icon, label }) => (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200/80 bg-cyan-50/80 px-3 py-1 text-xs font-bold text-cyan-800 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-300">
        <Icon size={13} />
        {label}
    </span>
);

const summaryTones = {
    cyan: 'bg-cyan-50 text-cyan-700 ring-cyan-100 dark:bg-cyan-500/10 dark:text-cyan-300 dark:ring-cyan-500/20',
    rose: 'bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/20',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20',
    indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/20',
};

const SummaryCard = ({ icon: Icon, label, value, tone }) => (
    <article className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-[#07111f] sm:p-4">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${summaryTones[tone]}`}>
            <Icon size={18} />
        </span>
        <div className="min-w-0">
            <p className="truncate text-[10px] font-black uppercase tracking-[.12em] text-slate-400">{label}</p>
            <p className="mt-1 truncate font-mono text-xl font-black text-slate-950 dark:text-white">{value}</p>
        </div>
    </article>
);

const SelectFilter = ({ icon: Icon, label, value, onChange, options }) => (
    <label className="relative min-w-0 sm:min-w-[165px]">
        <span className="sr-only">{label}</span>
        <Icon size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <select
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white ps-9 pe-8 text-xs font-bold text-slate-700 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
        >
            {options.map(([optionValue, optionLabel]) => (
                <option key={optionValue} value={optionValue}>{optionLabel}</option>
            ))}
        </select>
    </label>
);

const SourceFilter = ({ active, label, count, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition ${
            active
                ? 'border-slate-900 bg-slate-900 text-white shadow-sm dark:border-cyan-400 dark:bg-cyan-500/15 dark:text-cyan-200'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
        }`}
    >
        {label}
        <span className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] ${active ? 'bg-white/15' : 'bg-slate-100 dark:bg-slate-800'}`}>{count}</span>
    </button>
);

const RiskBadge = ({ risk, t }) => {
    const tones = {
        critical: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300',
        high: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300',
        routine: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
    };
    return (
        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${tones[risk]}`}>
            {t(`risk.${risk}`)}
        </span>
    );
};

const ApprovalStatusBadge = ({ label }) => (
    <span className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-cyan-700 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-300">
        {label}
    </span>
);

const QueueItem = ({ item, active, sourceLabel, locale, t, onSelect }) => {
    const style = SOURCE_STYLES[item.source];
    const Icon = style.icon;
    const hours = getAgeHours(item.submittedAt);

    return (
        <button
            type="button"
            onClick={onSelect}
            aria-current={active ? 'true' : undefined}
            className={`group w-full rounded-2xl border p-3.5 text-start shadow-sm transition ${
                active
                    ? `${style.active} shadow-md`
                    : 'border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/70 dark:border-white/10 dark:bg-white/[0.02] dark:hover:bg-white/[0.05]'
            }`}
        >
            <div className="flex items-start gap-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${style.iconBox}`}>
                    <Icon size={17} />
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <p className="truncate text-sm font-black text-slate-950 dark:text-white">{item.title}</p>
                            <p className="mt-0.5 truncate text-xs font-medium text-slate-500 dark:text-slate-400">{item.subtitle}</p>
                        </div>
                        <ChevronRight size={16} className="mt-1 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${style.badge}`}>{sourceLabel}</span>
                        <ApprovalStatusBadge label={item.approvalStatusLabel} />
                        <RiskBadge risk={item.risk} t={t} />
                        <span className="ms-auto inline-flex items-center gap-1 text-[10px] font-bold text-slate-400">
                            <Clock3 size={11} />
                            {formatAge(hours, t)}
                        </span>
                    </div>
                    <p className="mt-2 truncate text-[11px] text-slate-400">
                        {item.submittedAt ? formatDateTime(item.submittedAt, locale) : t('fallback.dateUnavailable')}
                    </p>
                </div>
            </div>
        </button>
    );
};

const RequestDetail = ({ item, sourceLabel, locale, t, busy, onNavigate, onApprove, onReject }) => {
    if (!item) return null;
    const style = SOURCE_STYLES[item.source];
    const Icon = style.icon;

    return (
        <article className="flex min-h-[560px] flex-col">
            <header className="border-b border-slate-200/80 p-5 dark:border-white/10 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3.5">
                        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${style.iconBox}`}>
                            <Icon size={22} />
                        </span>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${style.badge}`}>{sourceLabel}</span>
                                <ApprovalStatusBadge label={item.approvalStatusLabel} />
                                <RiskBadge risk={item.risk} t={t} />
                            </div>
                            <h2 className="mt-2 break-words text-xl font-black tracking-tight text-slate-950 dark:text-white sm:text-2xl">{item.title}</h2>
                            <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">{item.subtitle}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onNavigate}
                        className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                        {t('actions.openSource')}
                        <ChevronRight size={14} className="rtl:rotate-180" />
                    </button>
                </div>
            </header>

            <div className="flex-1 space-y-5 p-5 sm:p-6">
                <section>
                    <h3 className="text-[11px] font-black uppercase tracking-[.16em] text-slate-400">{t('detail.request')}</h3>
                    <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                        <DetailValue icon={UserRound} label={t('facts.requestedBy')} value={item.requester} />
                        <DetailValue icon={Clock3} label={t('facts.submitted')} value={item.submittedAt ? formatDateTime(item.submittedAt, locale) : t('fallback.dateUnavailable')} />
                        {item.facts.map(([label, value]) => (
                            <DetailValue key={label} icon={FileText} label={label} value={value} />
                        ))}
                    </dl>
                </section>

                <section>
                    <h3 className="text-[11px] font-black uppercase tracking-[.16em] text-slate-400">{t('detail.context')}</h3>
                    <div className={`mt-3 rounded-2xl border p-4 ${
                        item.reason
                            ? 'border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200'
                            : 'border-dashed border-slate-200 bg-white text-slate-400 dark:border-white/10 dark:bg-transparent'
                    }`}>
                        <p className="whitespace-pre-wrap text-sm font-medium leading-6">{item.reason || t('detail.noContext')}</p>
                    </div>
                </section>

                {item.risk === 'critical' && (
                    <div className="flex gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
                        <ShieldAlert size={19} className="mt-0.5 shrink-0" />
                        <div>
                            <p className="font-black">{t('detail.criticalTitle')}</p>
                            <p className="mt-1 text-xs font-medium leading-5 opacity-80">{t('detail.criticalMessage')}</p>
                        </div>
                    </div>
                )}

                {item.approveDisabled && (
                    <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                        <AlertCircle size={19} className="mt-0.5 shrink-0" />
                        <p className="font-semibold leading-5">{t('detail.permissionRequired')}</p>
                    </div>
                )}

                {item.rejectDisabled && (
                    <div className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                        <AlertCircle size={19} className="mt-0.5 shrink-0" />
                        <p className="font-semibold leading-5">
                            {t(item.source === 'variance' ? 'detail.reviewOnly' : (item.rejectMessageKey || 'detail.rejectPermissionRequired'))}
                        </p>
                    </div>
                )}
            </div>

            <footer className="sticky bottom-0 border-t border-slate-200/80 bg-white/95 p-4 backdrop-blur-xl dark:border-white/10 dark:bg-[#07111f]/95 sm:p-5">
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button
                        type="button"
                        onClick={onReject}
                        disabled={busy || item.rejectDisabled}
                        title={item.rejectDisabled
                            ? t(item.source === 'variance' ? 'detail.reviewOnly' : (item.rejectMessageKey || 'detail.rejectPermissionRequired'))
                            : undefined}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-5 text-sm font-black text-rose-700 transition hover:bg-rose-100 disabled:opacity-50 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300"
                    >
                        <X size={17} />
                        {t('actions.reject')}
                    </button>
                    <button
                        type="button"
                        onClick={onApprove}
                        disabled={busy || item.approveDisabled}
                        title={item.approveDisabled ? t('detail.permissionRequired') : undefined}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-black text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-50"
                    >
                        <Check size={17} />
                        {item.approveLabel}
                    </button>
                </div>
            </footer>
        </article>
    );
};

const DetailValue = ({ icon: Icon, label, value }) => (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 dark:border-white/10 dark:bg-white/[0.025]">
        <dt className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400">
            <Icon size={12} />
            {label}
        </dt>
        <dd className="mt-1.5 break-words text-sm font-bold text-slate-800 dark:text-slate-200">{value || '—'}</dd>
    </div>
);

const LoadingState = () => (
    <div className="grid gap-0 lg:grid-cols-[minmax(330px,0.9fr)_minmax(0,1.35fr)]">
        <div className="space-y-3 border-e border-slate-200/80 p-4 dark:border-white/10">
            {Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />)}
        </div>
        <div className="space-y-4 p-6">
            <div className="h-8 w-1/2 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
            <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-20 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />)}
            </div>
        </div>
    </div>
);

const EmptyState = ({ filtered, t, onClear }) => (
    <div className="px-6 py-20 text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20">
            {filtered ? <Search size={27} /> : <CheckCircle2 size={27} />}
        </span>
        <h2 className="mt-5 text-lg font-black text-slate-950 dark:text-white">{t(filtered ? 'empty.filteredTitle' : 'empty.title')}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm font-medium leading-6 text-slate-500 dark:text-slate-400">{t(filtered ? 'empty.filteredDescription' : 'empty.description')}</p>
        {filtered && (
            <button type="button" onClick={onClear} className="mt-5 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                {t('actions.clearFilters')}
            </button>
        )}
    </div>
);

export default PendingRequests;
