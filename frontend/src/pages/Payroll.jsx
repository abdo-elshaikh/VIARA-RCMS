import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import {
    AlertTriangle,
    BadgeDollarSign,
    Banknote,
    Calculator,
    CheckCircle2,
    ClipboardCheck,
    FileSpreadsheet,
    LockKeyhole,
    MinusCircle,
    Plus,
    Receipt,
    Scale,
    Settings2,
    ShieldCheck,
    Users,
    Sparkles,
    SlidersHorizontal,
    LayoutDashboard,
    Search,
    Download,
    Eye,
    Printer,
    Check,
    X,
    ArrowRight,
    Coins,
    Calendar,
    Briefcase
} from 'lucide-react';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import TextPromptDialog from '../components/ui/TextPromptDialog';
import {
    useCalculatePayrollRunMutation,
    useCancelPayrollPeriodMutation,
    useCreatePayrollCompensationMutation,
    useCreatePayrollDeductionMutation,
    useCreatePayrollPenaltyMutation,
    useCreatePayrollPeriodMutation,
    useCreatePayrollRuleMutation,
    useGetPayrollEmployeesQuery,
    useGetPayrollCompensationQuery,
    useGetPayrollDeductionsQuery,
    useGetPayrollOverviewQuery,
    useGetPayrollPenaltiesQuery,
    useGetPayrollPeriodsQuery,
    useGetPayrollRulesQuery,
    useGetPayrollRunQuery,
    useUpdatePayrollDeductionStatusMutation,
    useUpdatePayrollPenaltyStatusMutation,
    useUpdatePayrollRuleStatusMutation,
    useUpdatePayrollRunStatusMutation,
    useUpdatePayrollCompensationMutation,
} from '../store/api';
import { selectCurrentUser } from '../store/authSlice';
import {
    clearStoredPayrollPaymentKey,
    firstDayOfCurrentMonthInput,
    getPayrollPermissions,
    getStoredPayrollPaymentKey,
    lastDayOfCurrentMonthInput,
    todayInput,
} from '../utils/payrollWorkflow';

const money = (value, currency = 'EGP') => {
    const amount = Number(value || 0);
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
};

const csvCell = (value) => {
    const text = String(value ?? '');
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
};

const shortDate = (value) => (value ? String(value).slice(0, 10) : '-');

const getErrorMessage = (error, fallback) => (
    error?.data?.error || error?.data?.message || error?.error || fallback
);

const statusTone = {
    Draft: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    Calculated: 'bg-cyan-500/10 text-cyan-700 border-cyan-500/30 dark:text-cyan-300',
    Reviewed: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/30 dark:text-indigo-300',
    Approved: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300',
    Paid: 'bg-teal-500/10 text-teal-700 border-teal-500/30 dark:text-teal-300',
    Locked: 'bg-purple-500/10 text-purple-700 border-purple-500/30 dark:text-purple-300',
    Cancelled: 'bg-rose-500/10 text-rose-700 border-rose-500/30 dark:text-rose-300',
};

const WORKFLOW_STEPS = ['Draft', 'Calculated', 'Reviewed', 'Approved', 'Paid', 'Locked'];
const RULE_METHODS = {
    Overtime: ['HourlyMultiplier', 'FixedAmount', 'PercentageOfBase'],
    Late: ['PerMinute', 'FixedAmount'],
    EarlyLeave: ['PerMinute', 'FixedAmount'],
    Absence: ['PerDay', 'FixedAmount'],
    Allowance: ['FixedAmount', 'PercentageOfBase', 'PercentageOfGross'],
    Deduction: ['FixedAmount', 'PercentageOfBase', 'PercentageOfGross'],
    Penalty: ['FixedAmount', 'PercentageOfBase', 'PercentageOfGross'],
    EmployerContribution: ['FixedAmount', 'PercentageOfBase', 'PercentageOfGross'],
};

/* ── Itemized Payslip Modal ─────────────────────────────────── */
const PayslipModal = ({ item, period, currency, onClose, isArabic }) => {
    if (!item) return null;
    const gross = Number(item.gross_earnings || 0);
    const deductions = Number(item.total_deductions || 0);
    const penalties = Number(item.total_penalties || 0);
    const employerContributions = Number(item.total_employer_contributions || 0);
    const net = Number(item.net_pay || gross - deductions - penalties);
    const lineItems = Array.isArray(item.line_items) ? item.line_items : [];

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md animate-in fade-in duration-200">
            <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-2xl backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-100 p-6 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/30">
                            <Receipt size={22} />
                        </div>
                        <div>
                            <h2 className="text-base font-black text-slate-900 dark:text-white">
                                {isArabic ? 'كشف الراتب الإلكتروني المفصل' : 'Official Electronic Payslip'}
                            </h2>
                            <p className="text-xs font-semibold text-slate-400">
                                {period?.name} ({period?.start_date?.slice(0, 10)} - {period?.end_date?.slice(0, 10)})
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 transition"
                    >
                        <X size={17} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 space-y-5 overflow-y-auto p-6 text-xs">
                    {/* Employee Profile Inset */}
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-sm font-black text-slate-900 dark:text-white">{item.employee_name}</p>
                                <p className="text-xs font-bold text-teal-700 dark:text-teal-400 mt-0.5">{item.role}</p>
                            </div>
                            <span className="rounded-full bg-teal-500/10 px-2.5 py-0.5 text-[10px] font-black text-teal-800 dark:text-teal-300 border border-teal-500/30">
                                {period?.currency_code || 'EGP'}
                            </span>
                        </div>
                    </div>

                    {/* Financial Ledger Breakdown */}
                    <div className="space-y-3">
                        <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                            {isArabic ? 'تفاصيل الاستحقاقات والاستقطاعات' : 'Earnings & Adjustments Ledger'}
                        </h3>
                        
                        <div className="rounded-2xl border border-slate-100 divide-y divide-slate-100 dark:border-slate-800 dark:divide-slate-800">
                            {lineItems.map((line) => {
                                const subtracts = ['Deduction', 'Penalty'].includes(line.item_type);
                                return (
                                    <div key={line.line_item_id} className="flex items-center justify-between gap-4 p-3.5">
                                        <div className="min-w-0">
                                            <p className="truncate font-bold text-slate-700 dark:text-slate-300">{line.description}</p>
                                            <p className="text-[10px] font-semibold text-slate-400">{line.item_type}</p>
                                        </div>
                                        <span className={`shrink-0 font-black ${subtracts ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
                                            {subtracts ? '- ' : ''}{money(line.amount, currency)}
                                        </span>
                                    </div>
                                );
                            })}
                            {!lineItems.length && (
                                <div className="p-3.5 text-center font-semibold text-slate-400">
                                    {isArabic ? 'لا توجد بنود تفصيلية محفوظة' : 'No itemized lines are available'}
                                </div>
                            )}
                            <div className="flex items-center justify-between p-3.5">
                                <span className="font-bold text-slate-700 dark:text-slate-300">{isArabic ? 'إجمالي الراتب والاستحقاقات' : 'Gross Earnings & Allowances'}</span>
                                <span className="font-black text-slate-900 dark:text-white">{money(gross, currency)}</span>
                            </div>
                            <div className="flex items-center justify-between p-3.5">
                                <span className="font-bold text-slate-700 dark:text-slate-300">{isArabic ? 'الاستقطاعات والتأمينات' : 'Deductions & Contributions'}</span>
                                <span className="font-black text-amber-600 dark:text-amber-400">- {money(deductions, currency)}</span>
                            </div>
                            <div className="flex items-center justify-between p-3.5">
                                <span className="font-bold text-slate-700 dark:text-slate-300">{isArabic ? 'الجزاءات والخصومات الإدارية' : 'Penalties & Violations'}</span>
                                <span className="font-black text-rose-600 dark:text-rose-400">- {money(penalties, currency)}</span>
                            </div>
                            <div className="flex items-center justify-between p-3.5">
                                <span className="font-bold text-slate-700 dark:text-slate-300">{isArabic ? 'مساهمات جهة العمل (لا تخصم من الصافي)' : 'Employer contributions (not deducted from net)'}</span>
                                <span className="font-black text-indigo-600 dark:text-indigo-400">{money(employerContributions, currency)}</span>
                            </div>
                        </div>

                        {/* Net Disbursed Card */}
                        <div className="rounded-2xl border border-teal-500/30 bg-teal-500/10 p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-wider text-teal-800 dark:text-teal-300">{isArabic ? 'صافي الراتب المستحق للصرف' : 'Net Disbursed Amount'}</p>
                                    <p className="text-xl font-black text-teal-900 dark:text-teal-200 mt-1">{money(net, currency)}</p>
                                </div>
                                <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-600 text-white shadow-xs">
                                    <Coins size={20} />
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                    <button
                        type="button"
                        onClick={() => window.print()}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs font-black text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                    >
                        <Printer size={14} />
                        <span>{isArabic ? 'طباعة كشف الراتب' : 'Print Payslip'}</span>
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl bg-teal-600 px-5 py-2 text-xs font-black text-white shadow-xs hover:bg-teal-500 transition"
                    >
                        {isArabic ? 'إغلاق' : 'Close'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

const adjustmentActions = (kind, status) => {
    if (kind === 'penalty') return status === 'Pending Approval' ? ['Approved', 'Rejected'] : [];
    if (status === 'Draft') return ['Approved', 'Cancelled'];
    if (status === 'Approved') return ['Paused', 'Cancelled'];
    if (status === 'Paused') return ['Approved', 'Cancelled'];
    return [];
};

const actionLabel = (status, isArabic) => ({
    Approved: isArabic ? 'اعتماد' : 'Approve',
    Rejected: isArabic ? 'رفض' : 'Reject',
    Paused: isArabic ? 'إيقاف مؤقت' : 'Pause',
    Cancelled: isArabic ? 'إلغاء' : 'Cancel',
}[status] || status);

const AdjustmentList = ({ title, rows, currency, isArabic, kind, canApprove, busy, onAction }) => (
    <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
        <h3 className="mb-4 text-sm font-black text-slate-900 dark:text-white">{title} ({rows.length})</h3>
        <div className="max-h-[480px] space-y-3 overflow-y-auto">
            {rows.map((row) => {
                const id = kind === 'penalty' ? row.penalty_id : row.deduction_id;
                const name = kind === 'penalty' ? row.penalty_type : row.name;
                const amountText = kind === 'deduction' && row.deduction_type === 'Percentage'
                    ? `${Number(row.percentage || 0)}%`
                    : money(row.amount, currency);
                return (
                    <article key={id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="truncate text-xs font-black text-slate-900 dark:text-white">{name}</p>
                                <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-400">{row.employee_name} • {kind === 'penalty' ? row.source : row.deduction_type}</p>
                            </div>
                            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-black text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">{row.status}</span>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-xs font-black">
                            <span>{amountText}</span>
                            {row.remaining_amount != null && ['Installment', 'Advance', 'Loan'].includes(row.deduction_type) && (
                                <span className="text-amber-700 dark:text-amber-400">{isArabic ? 'المتبقي' : 'Remaining'}: {money(row.remaining_amount, currency)}</span>
                            )}
                        </div>
                        {!!adjustmentActions(kind, row.status).length && (
                            <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                                {adjustmentActions(kind, row.status).map((status) => (
                                    <button key={status} type="button" disabled={!canApprove || busy} onClick={() => onAction({ kind, id, status, name })} className={`rounded-lg px-3 py-1.5 text-[10px] font-black text-white disabled:cursor-not-allowed disabled:opacity-40 ${status === 'Approved' ? 'bg-emerald-600' : status === 'Paused' ? 'bg-amber-600' : 'bg-rose-600'}`}>
                                        {actionLabel(status, isArabic)}
                                    </button>
                                ))}
                            </div>
                        )}
                    </article>
                );
            })}
            {!rows.length && <p className="py-8 text-center text-xs font-bold text-slate-400">{isArabic ? 'لا توجد سجلات' : 'No records'}</p>}
        </div>
    </div>
);

/* ── Main Payroll Suite ──────────────────────────────────────── */
const Payroll = () => {
    const { t, i18n } = useTranslation('payroll');
    const isArabic = i18n.language === 'ar';
    const user = useSelector(selectCurrentUser);
    const permissions = useMemo(() => getPayrollPermissions(user), [user]);
    const initialToday = todayInput();

    const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'compensation' | 'adjustments' | 'rules'
    const [selectedPeriodId, setSelectedPeriodId] = useState(null);
    const [paymentMethod, setPaymentMethod] = useState('BankTransfer');
    const [paymentReference, setPaymentReference] = useState('');
    const [paymentDate, setPaymentDate] = useState(initialToday);
    const [workflowDecision, setWorkflowDecision] = useState(null);
    const [runSearch, setRunSearch] = useState('');
    const [selectedPayslipItem, setSelectedPayslipItem] = useState(null);
    const [compensationEndDates, setCompensationEndDates] = useState({});
    const [setupDecision, setSetupDecision] = useState(null);

    const [periodForm, setPeriodForm] = useState({
        name: '',
        startDate: firstDayOfCurrentMonthInput(),
        endDate: lastDayOfCurrentMonthInput(),
        currencyCode: 'EGP',
        notes: '',
    });
    const [compForm, setCompForm] = useState({
        userId: '',
        salaryType: 'Monthly',
        baseSalary: '',
        hourlyRate: '',
        standardHoursPerDay: 8,
        standardDaysPerPeriod: 22,
        effectiveFrom: initialToday,
        effectiveTo: '',
        notes: '',
    });
    const [deductionForm, setDeductionForm] = useState({
        userId: '',
        name: '',
        deductionType: 'Fixed',
        amount: '',
        percentage: '',
        totalAmount: '',
        remainingAmount: '',
        startDate: initialToday,
        endDate: '',
        status: 'Draft',
        notes: '',
    });
    const [penaltyForm, setPenaltyForm] = useState({
        userId: '',
        penaltyType: 'Policy',
        amount: '',
        reason: '',
        source: 'Manual',
        status: 'Pending Approval',
    });
    const [ruleForm, setRuleForm] = useState({
        ruleType: 'Allowance',
        name: '',
        calculationMethod: 'FixedAmount',
        value: '',
        currencyCode: 'EGP',
        effectiveFrom: initialToday,
        notes: '',
    });

    // Queries
    const { data: periods = [], isLoading: periodsLoading } = useGetPayrollPeriodsQuery();
    const { data: staff = [] } = useGetPayrollEmployeesQuery();
    const { data: compensation = [] } = useGetPayrollCompensationQuery({ limit: 500 });
    const { data: deductions = [] } = useGetPayrollDeductionsQuery({ limit: 500 });
    const { data: penalties = [] } = useGetPayrollPenaltiesQuery({ limit: 500 });
    const { data: rules = [] } = useGetPayrollRulesQuery();

    const selectedPeriod = useMemo(
        () => periods.find((p) => p.period_id === selectedPeriodId) || periods[0] || null,
        [periods, selectedPeriodId]
    );

    const activePeriodId = selectedPeriod?.period_id;
    const { data: run } = useGetPayrollRunQuery(activePeriodId, { skip: !activePeriodId });

    // Filtered Run Items
    const filteredRunItems = useMemo(() => {
        const items = run?.items || [];
        if (!runSearch.trim()) return items;
        const q = runSearch.toLowerCase();
        return items.filter(it => (it.employee_name || '').toLowerCase().includes(q) || (it.role || '').toLowerCase().includes(q));
    }, [run?.items, runSearch]);

    // Mutations
    const [createPeriod, { isLoading: creatingPeriod }] = useCreatePayrollPeriodMutation();
    const [cancelPeriod, { isLoading: cancellingPeriod }] = useCancelPayrollPeriodMutation();
    const [calculateRun, { isLoading: calculating }] = useCalculatePayrollRunMutation();
    const [updateRunStatus, { isLoading: updatingStatus }] = useUpdatePayrollRunStatusMutation();
    const [createCompensation, { isLoading: savingCompensation }] = useCreatePayrollCompensationMutation();
    const [updateCompensation, { isLoading: updatingCompensation }] = useUpdatePayrollCompensationMutation();
    const [createDeduction, { isLoading: savingDeduction }] = useCreatePayrollDeductionMutation();
    const [createPenalty, { isLoading: savingPenalty }] = useCreatePayrollPenaltyMutation();
    const [createRule, { isLoading: savingRule }] = useCreatePayrollRuleMutation();
    const [updateDeductionStatus, { isLoading: updatingDeductionStatus }] = useUpdatePayrollDeductionStatusMutation();
    const [updatePenaltyStatus, { isLoading: updatingPenaltyStatus }] = useUpdatePayrollPenaltyStatusMutation();
    const [updateRuleStatus, { isLoading: updatingRuleStatus }] = useUpdatePayrollRuleStatusMutation();

    const currency = selectedPeriod?.currency_code || 'EGP';
    const { data: overview } = useGetPayrollOverviewQuery({ currencyCode: currency, limit: 1 });
    const runId = selectedPeriod?.run_id || run?.run_id;
    const runStatus = run?.status || selectedPeriod?.run_status || selectedPeriod?.status || 'Draft';
    const paymentReferenceRequired = paymentMethod !== 'Cash';
    const paymentReady = !paymentReferenceRequired || Boolean(paymentReference.trim());
    const missingPermissionText = t('validation.permissionDenied', { defaultValue: 'You do not have permission for this payroll action.' });
    const disabledReason = (allowed) => (allowed ? undefined : missingPermissionText);

    const currentStepIndex = WORKFLOW_STEPS.indexOf(runStatus);

    const onCreatePeriod = async (event) => {
        event.preventDefault();
        if (!permissions.createPeriod) {
            toast.error(missingPermissionText);
            return;
        }
        try {
            const created = await createPeriod(periodForm).unwrap();
            setSelectedPeriodId(created.period_id);
            setPeriodForm((prev) => ({ ...prev, name: '', notes: '' }));
            toast.success(t('toast.periodCreated'));
        } catch (error) {
            toast.error(getErrorMessage(error, t('toast.createPeriodFailed')));
        }
    };

    const onCalculate = async (periodId) => {
        if (!permissions.calculate) {
            toast.error(missingPermissionText);
            return false;
        }
        try {
            await calculateRun(periodId).unwrap();
            setSelectedPeriodId(periodId);
            toast.success(t('toast.calculated'));
            return true;
        } catch (error) {
            toast.error(getErrorMessage(error, t('toast.calculateFailed')));
            return false;
        }
    };

    const onStatus = async (targetRunId, status, notes = '') => {
        const idempotencyKey = status === 'Paid' ? getStoredPayrollPaymentKey(targetRunId) : undefined;
        try {
            await updateRunStatus({
                runId: targetRunId,
                status,
                paymentMethod: status === 'Paid' ? paymentMethod : undefined,
                paidAmount: status === 'Paid' ? Number(run?.total_net ?? selectedPeriod?.total_net ?? 0) : undefined,
                paidDate: status === 'Paid' ? paymentDate : undefined,
                referenceNumber: status === 'Paid' ? paymentReference : undefined,
                notes: notes || undefined,
                idempotencyKey,
            }).unwrap();
            if (status === 'Paid') clearStoredPayrollPaymentKey(targetRunId);
            toast.success(t('toast.statusUpdated'));
            return true;
        } catch (error) {
            toast.error(getErrorMessage(error, t('toast.statusFailed')));
            return false;
        }
    };

    const onCancelDraftPeriod = async (periodId, notes) => {
        try {
            await cancelPeriod({ id: periodId, status: 'Cancelled', notes }).unwrap();
            toast.success(t('toast.statusUpdated'));
            return true;
        } catch (error) {
            toast.error(getErrorMessage(error, t('toast.statusFailed')));
            return false;
        }
    };

    const executeWorkflowDecision = async (notes = '') => {
        if (!workflowDecision) return false;
        const { type, periodId, runId: decisionRunId, status } = workflowDecision;
        const completed = type === 'calculate'
            ? await onCalculate(periodId)
            : type === 'cancelPeriod'
                ? await onCancelDraftPeriod(periodId, notes)
                : await onStatus(decisionRunId, status, notes);
        if (completed) setWorkflowDecision(null);
        return completed;
    };

    const exportBankFile = () => {
        if (!permissions.export) {
            toast.error(missingPermissionText);
            return;
        }
        const exportItems = run?.items || [];
        if (!exportItems.length) {
            toast.error(isArabic ? 'لا توجد بيانات رواتب للتصدير' : 'No payroll data to export');
            return;
        }
        const headers = ['Employee Name', 'Role', 'Gross Earnings', 'Deductions', 'Penalties', 'Employer Contributions', 'Net Pay', 'Currency', 'Period', 'Run Status'];
        const lines = exportItems.map(it => [
            csvCell(it.employee_name),
            csvCell(it.role),
            Number(it.gross_earnings || 0),
            Number(it.total_deductions || 0),
            Number(it.total_penalties || 0),
            Number(it.total_employer_contributions || 0),
            Number(it.net_pay || 0),
            csvCell(currency),
            csvCell(selectedPeriod?.name),
            csvCell(runStatus)
        ].join(','));
        const blob = new Blob([[headers.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        Object.assign(document.createElement('a'), { href: url, download: `payroll-register-${selectedPeriod?.name || 'run'}-${new Date().toISOString().slice(0, 10)}.csv` }).click();
        URL.revokeObjectURL(url);
        toast.success(isArabic ? 'تم تصدير سجل الرواتب بنجاح' : 'Payroll register exported');
    };

    const onCreateCompensation = async (e) => {
        e.preventDefault();
        try {
            await createCompensation({
                ...compForm,
                baseSalary: Number(compForm.baseSalary || 0),
                hourlyRate: Number(compForm.hourlyRate || 0),
                effectiveTo: compForm.effectiveTo || undefined,
            }).unwrap();
            setCompForm(prev => ({ ...prev, baseSalary: '', hourlyRate: '', effectiveTo: '', notes: '' }));
            toast.success(t('toast.compensationSaved'));
        } catch (error) {
            toast.error(getErrorMessage(error, t('toast.saveFailed')));
        }
    };

    const onCreateDeduction = async (e) => {
        e.preventDefault();
        try {
            await createDeduction({
                ...deductionForm,
                amount: Number(deductionForm.amount || 0),
                percentage: Number(deductionForm.percentage || 0),
                totalAmount: deductionForm.totalAmount === '' ? undefined : Number(deductionForm.totalAmount),
                remainingAmount: deductionForm.remainingAmount === '' ? undefined : Number(deductionForm.remainingAmount),
            }).unwrap();
            setDeductionForm(prev => ({ ...prev, name: '', amount: '', percentage: '', totalAmount: '', remainingAmount: '', notes: '' }));
            toast.success(t('toast.deductionSaved'));
        } catch (error) {
            toast.error(getErrorMessage(error, t('toast.saveFailed')));
        }
    };

    const onCreatePenalty = async (e) => {
        e.preventDefault();
        try {
            await createPenalty({ ...penaltyForm, amount: Number(penaltyForm.amount || 0) }).unwrap();
            setPenaltyForm(prev => ({ ...prev, amount: '', reason: '' }));
            toast.success(t('toast.penaltySaved'));
        } catch (error) {
            toast.error(getErrorMessage(error, t('toast.saveFailed')));
        }
    };

    const onCreateRule = async (e) => {
        e.preventDefault();
        try {
            await createRule({ ...ruleForm, value: Number(ruleForm.value || 0), metadata: {} }).unwrap();
            setRuleForm(prev => ({ ...prev, name: '', value: '' }));
            toast.success(t('toast.ruleSaved'));
        } catch (error) {
            toast.error(getErrorMessage(error, t('toast.saveFailed')));
        }
    };

    const executeSetupDecision = async () => {
        if (!setupDecision) return;
        const { kind, id, status } = setupDecision;
        const mutation = kind === 'deduction'
            ? updateDeductionStatus
            : kind === 'penalty' ? updatePenaltyStatus : updateRuleStatus;
        try {
            await mutation({
                id,
                status,
                notes: isArabic ? 'تم الإجراء من مساحة عمل الرواتب' : 'Action completed from payroll workspace'
            }).unwrap();
            toast.success(isArabic ? 'تم تحديث الحالة' : 'Status updated');
            setSetupDecision(null);
        } catch (error) {
            toast.error(getErrorMessage(error, t('toast.statusFailed')));
        }
    };

    const onCloseCompensation = async (profile) => {
        const effectiveTo = compensationEndDates[profile.profile_id] || todayInput();
        try {
            await updateCompensation({
                id: profile.profile_id,
                effectiveTo,
                isActive: true,
                notes: isArabic ? 'إغلاق فترة التعويض من شاشة الرواتب' : 'Compensation period closed from payroll workspace'
            }).unwrap();
            toast.success(isArabic ? 'تم تحديد نهاية ملف التعويض' : 'Compensation end date saved');
        } catch (error) {
            toast.error(getErrorMessage(error, t('toast.saveFailed')));
        }
    };

    const workflowNeedsNotes = ['Approved', 'Cancelled'].includes(workflowDecision?.status);
    const updatingSetupStatus = updatingDeductionStatus || updatingPenaltyStatus || updatingRuleStatus;

    return (
        <main className="mx-auto max-w-[1600px] space-y-6 pb-12">
            {/* Top Executive Command Deck */}
            <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-8">
                <div className="pointer-events-none absolute -end-16 -top-16 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl dark:bg-teal-500/5" />
                <div className="pointer-events-none absolute -bottom-16 -start-16 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl dark:bg-sky-500/5" />

                <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4 sm:items-center">
                        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-teal-500/20 to-teal-600/30 text-teal-700 dark:text-teal-300 ring-1 ring-teal-500/30 shadow-inner">
                            <BadgeDollarSign size={26} />
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-300">
                                    <ShieldCheck size={11} />
                                    <span>{t('header.eyebrow')}</span>
                                </span>
                            </div>
                            <h1 className="mt-1 truncate text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">
                                {t('header.title')}
                            </h1>
                            <p className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400 sm:text-sm">
                                {t('header.description')}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                        <button
                            type="button"
                            onClick={exportBankFile}
                            disabled={!permissions.export}
                            title={disabledReason(permissions.export)}
                            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-4 text-xs font-black text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                        >
                            <Download size={14} />
                            <span>{isArabic ? 'تصدير سجل الرواتب' : 'Export Payroll Register'}</span>
                        </button>
                        <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-black text-emerald-700 dark:text-emerald-300">
                            <Receipt size={14} />
                            <span>{t('header.auditable')}</span>
                        </span>
                    </div>
                </div>

                {/* Sub-Tabs Strip */}
                <div className="mt-6 flex gap-1.5 overflow-x-auto border-t border-slate-100 pt-4 dark:border-slate-800" role="tablist" aria-label={isArabic ? 'أقسام الرواتب' : 'Payroll sections'}>
                    {[
                        { id: 'overview', label: isArabic ? 'مسار الرواتب والاعتماد' : 'Runs & Workflow', icon: LayoutDashboard },
                        { id: 'compensation', label: isArabic ? 'هيكل الرواتب والعقود' : 'Compensation Profiles', icon: Users },
                        { id: 'adjustments', label: isArabic ? 'الاستقطاعات والجزاءات' : 'Deductions & Penalties', icon: MinusCircle },
                        { id: 'rules', label: isArabic ? 'قواعد وسياسات الحساب' : 'Payroll Rules', icon: Settings2 },
                    ].map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTab(tab.id)}
                                role="tab"
                                aria-selected={isActive}
                                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition ${
                                    isActive
                                        ? 'bg-teal-600 text-white shadow-sm shadow-teal-600/20'
                                        : 'border border-slate-200/80 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800'
                                }`}
                            >
                                <Icon size={14} />
                                <span>{tab.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Metrics HUD */}
            <section className="grid grid-cols-2 gap-3.5 sm:grid-cols-5">
                {[
                    { label: t('stats.net'), value: money(overview?.total_net, currency), icon: FileSpreadsheet, tone: 'emerald', detail: t('stats.netDetail') },
                    { label: t('stats.gross'), value: money(overview?.total_gross, currency), icon: Scale, tone: 'teal', detail: t('stats.grossDetail') },
                    { label: t('stats.controls'), value: money((Number(overview?.total_deductions || 0) + Number(overview?.total_penalties || 0)), currency), icon: MinusCircle, tone: 'amber', detail: t('stats.controlsDetail', { count: overview?.pending_penalties || 0 }) },
                    { label: isArabic ? 'مساهمات جهة العمل' : 'Employer contributions', value: money(overview?.total_employer_contributions, currency), icon: Briefcase, tone: 'indigo', detail: isArabic ? 'تكلفة إضافية لا تخصم من صافي الموظف' : 'Additional cost; not deducted from employee net' },
                    { label: t('stats.openPeriods'), value: overview?.open_periods || 0, icon: ClipboardCheck, tone: 'purple', detail: t('stats.openDetail', { count: overview?.periods || 0 }) },
                ].map(m => {
                    const Icon = m.icon;
                    return (
                        <div key={m.label} className="rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                            <div className="flex items-start justify-between gap-2">
                                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 truncate">{m.label}</p>
                                <span className="grid h-8 w-8 place-items-center rounded-xl bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/30">
                                    <Icon size={16} />
                                </span>
                            </div>
                            <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white tabular-nums">{m.value}</p>
                            <p className="mt-0.5 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{m.detail}</p>
                        </div>
                    );
                })}
            </section>

            {/* TAB 1: RUNS & WORKFLOW */}
            {activeTab === 'overview' && (
                <section className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)]">
                    <div className="space-y-5">
                        {/* New Period Form */}
                        <form onSubmit={onCreatePeriod} className="rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <h2 className="text-base font-black text-slate-900 dark:text-white">{t('periods.createTitle')}</h2>
                                    <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">{t('periods.createHelp')}</p>
                                </div>
                                <button
                                    type="submit"
                                    disabled={creatingPeriod || !permissions.createPeriod}
                                    title={disabledReason(permissions.createPeriod)}
                                    className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-teal-600 px-4 text-xs font-black text-white shadow-xs transition hover:bg-teal-500 disabled:opacity-50"
                                >
                                    <Plus size={14} />
                                    <span>{t('actions.createPeriod')}</span>
                                </button>
                            </div>
                            <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-5">
                                <label className="block sm:col-span-2 md:col-span-1">
                                    <span className="mb-1 block text-[11px] font-bold text-slate-500">{t('fields.periodName')}</span>
                                    <input className="h-9 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-800 outline-hidden focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" value={periodForm.name} onChange={(e) => setPeriodForm({ ...periodForm, name: e.target.value })} placeholder={t('placeholders.periodName')} required />
                                </label>
                                <label className="block">
                                    <span className="mb-1 block text-[11px] font-bold text-slate-500">{t('fields.startDate')}</span>
                                    <input className="h-9 w-full rounded-xl border border-slate-200/80 bg-white px-2.5 text-xs font-bold text-slate-800 outline-hidden focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" type="date" value={periodForm.startDate} onChange={(e) => setPeriodForm({ ...periodForm, startDate: e.target.value })} required />
                                </label>
                                <label className="block">
                                    <span className="mb-1 block text-[11px] font-bold text-slate-500">{t('fields.endDate')}</span>
                                    <input className="h-9 w-full rounded-xl border border-slate-200/80 bg-white px-2.5 text-xs font-bold text-slate-800 outline-hidden focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" type="date" value={periodForm.endDate} onChange={(e) => setPeriodForm({ ...periodForm, endDate: e.target.value })} required />
                                </label>
                                <label className="block">
                                    <span className="mb-1 block text-[11px] font-bold text-slate-500">{t('fields.currency')}</span>
                                    <input className="h-9 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-800 outline-hidden focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" pattern="[A-Z]{3}" value={periodForm.currencyCode} onChange={(e) => setPeriodForm({ ...periodForm, currencyCode: e.target.value.replace(/[^a-z]/gi, '').toUpperCase().slice(0, 3) })} required />
                                </label>
                                <label className="block">
                                    <span className="mb-1 block text-[11px] font-bold text-slate-500">{t('fields.notes')}</span>
                                    <input className="h-9 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-800 outline-hidden focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" value={periodForm.notes} onChange={(e) => setPeriodForm({ ...periodForm, notes: e.target.value })} placeholder="Optional notes" />
                                </label>
                            </div>
                        </form>

                        {/* Payroll Periods List */}
                        <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5 dark:border-slate-800">
                                <div>
                                    <h2 className="text-base font-black text-slate-900 dark:text-white">{t('periods.title')}</h2>
                                    <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">{t('periods.help')}</p>
                                </div>
                                {periodsLoading && <span className="text-xs font-bold text-teal-600">{t('states.loading')}</span>}
                            </div>
                            <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                {periods.map((period) => (
                                    <button
                                        type="button"
                                        key={period.period_id}
                                        onClick={() => setSelectedPeriodId(period.period_id)}
                                        className={`grid w-full gap-3 p-4 text-start transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40 lg:grid-cols-[minmax(0,1fr)_auto] ${selectedPeriod?.period_id === period.period_id ? 'bg-teal-500/10 dark:bg-teal-950/20' : ''}`}
                                    >
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h3 className="font-black text-slate-900 dark:text-white">{period.name}</h3>
                                                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-black ${statusTone[period.status] || statusTone.Draft}`}>{period.status}</span>
                                            </div>
                                            <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{period.start_date?.slice(0, 10)} - {period.end_date?.slice(0, 10)} · {period.employee_count || 0} {t('periods.employees')}</p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4 lg:min-w-[440px]">
                                            <span><b className="block text-[10px] font-black uppercase text-slate-400">{t('summary.gross')}</b>{money(period.total_gross, period.currency_code)}</span>
                                            <span><b className="block text-[10px] font-black uppercase text-slate-400">{t('summary.deductions')}</b>{money(period.total_deductions, period.currency_code)}</span>
                                            <span><b className="block text-[10px] font-black uppercase text-slate-400">{t('summary.penalties')}</b>{money(period.total_penalties, period.currency_code)}</span>
                                            <span><b className="block text-[10px] font-black uppercase text-slate-400">{t('summary.net')}</b><span className="font-black text-teal-700 dark:text-teal-400">{money(period.total_net, period.currency_code)}</span></span>
                                        </div>
                                    </button>
                                ))}
                                {!periods.length && (
                                    <div className="p-8 text-center">
                                        <FileSpreadsheet className="mx-auto text-slate-300" size={32} />
                                        <p className="mt-2 text-xs font-bold text-slate-500">{t('periods.empty')}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Workflow Controls & Employee Run Items */}
                    <aside className="space-y-5">
                        <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 space-y-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h2 className="text-base font-black text-slate-900 dark:text-white">{t('workflow.title')}</h2>
                                    <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">{selectedPeriod?.name || t('workflow.noPeriod')}</p>
                                </div>
                                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-black ${statusTone[runStatus] || statusTone.Draft}`}>{runStatus || 'Draft'}</span>
                            </div>

                            {/* Visual Workflow Stepper */}
                            <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                                <div className="grid grid-cols-6 gap-1 text-center">
                                    {WORKFLOW_STEPS.map((st, idx) => {
                                        const isDone = currentStepIndex >= idx;
                                        const isCurrent = currentStepIndex === idx;
                                        return (
                                            <div key={st} className="flex flex-col items-center">
                                                <div className={`grid h-5 w-5 place-items-center rounded-full text-[9px] font-black transition ${
                                                    isCurrent
                                                        ? 'bg-teal-600 text-white ring-2 ring-teal-500/30'
                                                        : isDone
                                                            ? 'bg-emerald-500 text-white'
                                                            : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                                }`}>
                                                    {isDone && !isCurrent ? <Check size={10} /> : idx + 1}
                                                </div>
                                                <span className={`mt-1 text-[8.5px] font-black truncate max-w-full ${isCurrent ? 'text-teal-700 dark:text-teal-300' : 'text-slate-400'}`}>
                                                    {st}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2.5">
                                <button
                                    type="button"
                                    disabled={!selectedPeriod || calculating || !permissions.calculate || !['Draft', 'Calculated'].includes(selectedPeriod.status)}
                                    title={disabledReason(permissions.calculate)}
                                    onClick={() => setWorkflowDecision({ type: 'calculate', periodId: selectedPeriod.period_id, title: selectedPeriod.name })}
                                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-teal-600 px-3 text-xs font-black text-white shadow-xs transition hover:bg-teal-500 disabled:opacity-40"
                                >
                                    <Calculator size={14} />
                                    <span>{t('actions.calculate')}</span>
                                </button>
                                <button
                                    type="button"
                                    disabled={!runId || updatingStatus || !permissions.review || runStatus !== 'Calculated'}
                                    title={disabledReason(permissions.review)}
                                    onClick={() => setWorkflowDecision({ type: 'status', runId, status: 'Reviewed', title: selectedPeriod?.name })}
                                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 text-xs font-black text-white shadow-xs transition hover:bg-indigo-500 disabled:opacity-40"
                                >
                                    <ClipboardCheck size={14} />
                                    <span>{t('actions.review')}</span>
                                </button>
                                <button
                                    type="button"
                                    disabled={!runId || updatingStatus || !permissions.approve || runStatus !== 'Reviewed'}
                                    title={disabledReason(permissions.approve)}
                                    onClick={() => setWorkflowDecision({ type: 'status', runId, status: 'Approved', title: selectedPeriod?.name })}
                                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-xs font-black text-white shadow-xs transition hover:bg-emerald-500 disabled:opacity-40"
                                >
                                    <CheckCircle2 size={14} />
                                    <span>{t('actions.approve')}</span>
                                </button>
                                <button
                                    type="button"
                                    disabled={!runId || updatingStatus || !permissions.pay || runStatus !== 'Approved' || !paymentReady}
                                    title={!paymentReady ? t('validation.paymentReference', { defaultValue: 'Enter a payment reference for this method.' }) : disabledReason(permissions.pay)}
                                    onClick={() => setWorkflowDecision({ type: 'status', runId, status: 'Paid', title: selectedPeriod?.name })}
                                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-3 text-xs font-black text-white shadow-xs transition hover:bg-teal-600 disabled:opacity-40"
                                >
                                    <Banknote size={14} />
                                    <span>{t('actions.markPaid')}</span>
                                </button>
                                <button
                                    type="button"
                                    disabled={
                                        !selectedPeriod
                                        || cancellingPeriod
                                        || updatingStatus
                                        || !permissions.cancel
                                        || !['Draft', 'Calculated', 'Reviewed'].includes(runStatus)
                                    }
                                    title={disabledReason(permissions.cancel)}
                                    onClick={() => setWorkflowDecision(runId
                                        ? { type: 'status', runId, status: 'Cancelled', title: selectedPeriod?.name }
                                        : { type: 'cancelPeriod', periodId: selectedPeriod.period_id, status: 'Cancelled', title: selectedPeriod.name })}
                                    className="col-span-2 inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3 text-xs font-black text-rose-700 shadow-xs transition hover:bg-rose-100 disabled:opacity-40 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300"
                                >
                                    <X size={14} />
                                    <span>{t('actions.cancelPayroll', { defaultValue: 'Cancel payroll' })}</span>
                                </button>
                            </div>

                            <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                                <div className="grid grid-cols-2 gap-2">
                                    <input className="h-9 rounded-xl border border-slate-200/80 bg-white px-2.5 text-xs font-bold text-slate-800 outline-hidden dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} aria-label={t('fields.paymentDate')} />
                                    <select className="h-9 rounded-xl border border-slate-200/80 bg-white px-2.5 text-xs font-bold text-slate-800 outline-hidden dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                                        <option value="BankTransfer">{t('paymentMethods.BankTransfer', { defaultValue: 'Bank transfer' })}</option>
                                        <option value="Cash">{t('paymentMethods.Cash', { defaultValue: 'Cash' })}</option>
                                        <option value="Check">{t('paymentMethods.Check', { defaultValue: 'Check' })}</option>
                                        <option value="Wallet">{t('paymentMethods.Wallet', { defaultValue: 'Wallet' })}</option>
                                        <option value="Other">{t('paymentMethods.Other', { defaultValue: 'Other' })}</option>
                                    </select>
                                </div>
                                <div className="flex gap-2">
                                    <input className="h-9 flex-1 rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-800 outline-hidden dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder={t('placeholders.paymentReference')} />
                                    <button
                                        type="button"
                                        disabled={!runId || updatingStatus || !permissions.lock || runStatus !== 'Paid'}
                                        title={disabledReason(permissions.lock)}
                                        onClick={() => setWorkflowDecision({ type: 'status', runId, status: 'Locked', title: selectedPeriod?.name })}
                                        className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-purple-600 px-3 text-xs font-black text-white shadow-xs transition hover:bg-purple-500 disabled:opacity-40"
                                    >
                                        <LockKeyhole size={14} />
                                        <span>{t('actions.lock')}</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Itemized Employee Payslip Runs */}
                        <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                                <div>
                                    <h2 className="text-base font-black text-slate-900 dark:text-white">{t('run.title')}</h2>
                                    <p className="text-xs font-semibold text-slate-400">{filteredRunItems.length} {t('periods.employees')}</p>
                                </div>
                                <div className="relative min-w-[170px]">
                                    <Search size={13} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        value={runSearch}
                                        onChange={e => setRunSearch(e.target.value)}
                                        placeholder={isArabic ? 'بحث بالاسم...' : 'Search staff...'}
                                        className="h-8 w-full rounded-xl border border-slate-200/80 bg-white ps-8 pe-3 text-xs font-bold text-slate-800 outline-hidden dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                                    />
                                </div>
                            </div>

                            <div className="max-h-[500px] space-y-2 overflow-y-auto pe-1">
                                {filteredRunItems.map((item) => (
                                    <div
                                        key={item.item_id}
                                        onClick={() => setSelectedPayslipItem(item)}
                                        className="group cursor-pointer rounded-2xl border border-slate-100 bg-slate-50/60 p-3.5 transition hover:border-teal-500/40 hover:bg-white dark:border-slate-800 dark:bg-slate-950/40 dark:hover:bg-slate-900"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="truncate text-xs font-black text-slate-900 group-hover:text-teal-600 dark:text-white dark:group-hover:text-teal-400">
                                                    {item.employee_name}
                                                </p>
                                                <p className="text-[10px] font-semibold text-slate-400">{item.role}</p>
                                            </div>
                                            <div className="text-end">
                                                <p className="text-xs font-black text-teal-700 dark:text-teal-400">{money(item.net_pay, currency)}</p>
                                                <span className="inline-flex items-center gap-1 text-[9.5px] font-black text-slate-400 group-hover:text-teal-600">
                                                    <Eye size={10} />
                                                    <span>{isArabic ? 'كشف الراتب' : 'Payslip'}</span>
                                                </span>
                                            </div>
                                        </div>
                                        <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-[10.5px] font-bold">
                                            <span className="rounded-lg bg-white p-1.5 dark:bg-slate-900 text-slate-500">{t('summary.gross')}<b className="block text-slate-900 dark:text-white">{money(item.gross_earnings, currency)}</b></span>
                                            <span className="rounded-lg bg-white p-1.5 dark:bg-slate-900 text-slate-500">{t('summary.deductions')}<b className="block text-slate-900 dark:text-white">{money(item.total_deductions, currency)}</b></span>
                                            <span className="rounded-lg bg-white p-1.5 dark:bg-slate-900 text-slate-500">{t('summary.penalties')}<b className="block text-slate-900 dark:text-white">{money(item.total_penalties, currency)}</b></span>
                                        </div>
                                    </div>
                                ))}
                                {!filteredRunItems.length && (
                                    <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center dark:border-slate-800">
                                        <AlertTriangle className="mx-auto text-slate-300" size={24} />
                                        <p className="mt-2 text-xs font-bold text-slate-500">{t('run.empty')}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </aside>
                </section>
            )}

            {/* TAB 2: COMPENSATION PROFILES */}
            {activeTab === 'compensation' && (
                <section className="grid gap-5 xl:grid-cols-[400px_minmax(0,1fr)]">
                    <form onSubmit={onCreateCompensation} className="rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 space-y-3.5">
                        <h2 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
                            <Users size={17} />
                            <span>{t('setup.compensation')}</span>
                        </h2>
                        <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-500">{t('fields.employee')}</span>
                            <select className="h-9 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-800 outline-hidden dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" value={compForm.userId} onChange={(e) => setCompForm({ ...compForm, userId: e.target.value })} required>
                                <option value="">{t('placeholders.employee')}</option>
                                {staff.map((emp) => <option key={emp.user_id} value={emp.user_id}>{emp.full_name}</option>)}
                            </select>
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-500">{t('fields.salaryType')}</span>
                            <select className="h-9 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-800 outline-hidden dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" value={compForm.salaryType} onChange={(e) => setCompForm({ ...compForm, salaryType: e.target.value })}>
                                <option>Monthly</option>
                                <option>Hourly</option>
                            </select>
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="block">
                                <span className="mb-1 block text-xs font-bold text-slate-500">{t('fields.baseSalary')}</span>
                                <input className="h-9 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-800 outline-hidden dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" type="number" min={compForm.salaryType === 'Monthly' ? '0.01' : '0'} step="0.01" required={compForm.salaryType === 'Monthly'} value={compForm.baseSalary} onChange={(e) => setCompForm({ ...compForm, baseSalary: e.target.value })} />
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-xs font-bold text-slate-500">{t('fields.hourlyRate')}</span>
                                <input className="h-9 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-800 outline-hidden dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" type="number" min={compForm.salaryType === 'Hourly' ? '0.01' : '0'} step="0.01" required={compForm.salaryType === 'Hourly'} value={compForm.hourlyRate} onChange={(e) => setCompForm({ ...compForm, hourlyRate: e.target.value })} />
                            </label>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="block">
                                <span className="mb-1 block text-xs font-bold text-slate-500">{isArabic ? 'الساعات القياسية يومياً' : 'Standard hours/day'}</span>
                                <input className="h-9 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-800 outline-hidden dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" type="number" min="0.25" max="24" step="0.25" required value={compForm.standardHoursPerDay} onChange={(e) => setCompForm({ ...compForm, standardHoursPerDay: e.target.value })} />
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-xs font-bold text-slate-500">{isArabic ? 'أيام العمل القياسية' : 'Standard days/period'}</span>
                                <input className="h-9 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-800 outline-hidden dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" type="number" min="1" max="31" step="1" required value={compForm.standardDaysPerPeriod} onChange={(e) => setCompForm({ ...compForm, standardDaysPerPeriod: e.target.value })} />
                            </label>
                        </div>
                        <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-500">{t('fields.effectiveFrom')}</span>
                            <input className="h-9 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-800 outline-hidden dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" type="date" value={compForm.effectiveFrom} onChange={(e) => setCompForm({ ...compForm, effectiveFrom: e.target.value })} required />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-500">{isArabic ? 'ساري حتى (اختياري)' : 'Effective to (optional)'}</span>
                            <input className="h-9 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-800 outline-hidden dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" type="date" min={compForm.effectiveFrom} value={compForm.effectiveTo} onChange={(e) => setCompForm({ ...compForm, effectiveTo: e.target.value })} />
                        </label>
                        <button type="submit" disabled={savingCompensation || !permissions.compensation} className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-teal-600 text-xs font-black text-white shadow-xs hover:bg-teal-500 disabled:opacity-40">
                            <Plus size={14} />
                            <span>{t('actions.save')}</span>
                        </button>
                    </form>

                    <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                        <h3 className="text-sm font-black text-slate-900 dark:text-white mb-4">{t('inputs.profilesTitle', { defaultValue: 'Loaded Profiles' })} ({compensation.length})</h3>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {compensation.map(p => (
                                <div key={p.profile_id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                                    <p className="truncate font-black text-slate-900 dark:text-white text-xs">{p.employee_name || p.email}</p>
                                    <p className="text-[11px] font-semibold text-slate-400 mt-0.5">{p.salary_type}</p>
                                    <div className="mt-3 flex items-center justify-between text-xs font-black text-slate-700 dark:text-slate-300">
                                        <span>{t('fields.baseSalary')}</span>
                                        <span>{money(p.base_salary, currency)}</span>
                                    </div>
                                    <p className="mt-2 text-[10px] font-semibold text-slate-400">{shortDate(p.effective_from)} — {p.effective_to ? shortDate(p.effective_to) : (isArabic ? 'مفتوح' : 'Open')}</p>
                                    {!p.effective_to && (
                                        <div className="mt-3 flex gap-2">
                                            <input aria-label={isArabic ? 'تاريخ نهاية التعويض' : 'Compensation end date'} type="date" min={shortDate(p.effective_from)} className="h-8 min-w-0 flex-1 rounded-lg border border-slate-200 px-2 text-[10px] dark:border-slate-700 dark:bg-slate-900" value={compensationEndDates[p.profile_id] || todayInput()} onChange={(event) => setCompensationEndDates((current) => ({ ...current, [p.profile_id]: event.target.value }))} />
                                            <button type="button" disabled={updatingCompensation || !permissions.compensation} onClick={() => onCloseCompensation(p)} className="rounded-lg bg-slate-800 px-2 text-[10px] font-black text-white disabled:opacity-40">{isArabic ? 'إنهاء' : 'Close'}</button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* TAB 3: DEDUCTIONS & PENALTIES */}
            {activeTab === 'adjustments' && (
                <section className="space-y-5">
                    <div className="grid gap-5 xl:grid-cols-2">
                    <form onSubmit={onCreateDeduction} className="rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 space-y-3.5">
                        <h2 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
                            <MinusCircle size={17} />
                            <span>{t('setup.deductions')}</span>
                        </h2>
                        <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-500">{t('fields.employee')}</span>
                            <select className="h-9 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-800 outline-hidden dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" value={deductionForm.userId} onChange={(e) => setDeductionForm({ ...deductionForm, userId: e.target.value })} required>
                                <option value="">{t('placeholders.employee')}</option>
                                {staff.map((emp) => <option key={emp.user_id} value={emp.user_id}>{emp.full_name}</option>)}
                            </select>
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-500">{t('fields.name')}</span>
                            <input className="h-9 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-800 outline-hidden dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" value={deductionForm.name} onChange={(e) => setDeductionForm({ ...deductionForm, name: e.target.value })} required />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-500">{isArabic ? 'نوع الاستقطاع' : 'Deduction type'}</span>
                            <select className="h-9 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-800 outline-hidden dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" value={deductionForm.deductionType} onChange={(e) => setDeductionForm({ ...deductionForm, deductionType: e.target.value, amount: '', percentage: '', totalAmount: '', remainingAmount: '' })}>
                                {['Fixed', 'Percentage', 'Installment', 'Advance', 'Loan', 'Tax', 'SocialInsurance', 'Other'].map((type) => <option key={type}>{type}</option>)}
                            </select>
                        </label>
                        {deductionForm.deductionType === 'Percentage' ? (
                            <label className="block">
                                <span className="mb-1 block text-xs font-bold text-slate-500">{t('fields.percentage')}</span>
                                <input className="h-9 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-800 outline-hidden dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" type="number" min="0.01" max="100" step="0.01" required value={deductionForm.percentage} onChange={(e) => setDeductionForm({ ...deductionForm, percentage: e.target.value })} />
                            </label>
                        ) : (
                            <label className="block">
                                <span className="mb-1 block text-xs font-bold text-slate-500">{['Installment', 'Advance', 'Loan'].includes(deductionForm.deductionType) ? (isArabic ? 'قيمة القسط لكل فترة' : 'Installment per period') : t('fields.amount')}</span>
                                <input className="h-9 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-800 outline-hidden dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" type="number" min="0.01" step="0.01" required value={deductionForm.amount} onChange={(e) => setDeductionForm({ ...deductionForm, amount: e.target.value })} />
                            </label>
                        )}
                        {['Installment', 'Advance', 'Loan'].includes(deductionForm.deductionType) && (
                            <div className="grid grid-cols-2 gap-3">
                                <label className="block">
                                    <span className="mb-1 block text-xs font-bold text-slate-500">{isArabic ? 'إجمالي المديونية' : 'Total balance'}</span>
                                    <input className="h-9 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-800 outline-hidden dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" type="number" min="0.01" step="0.01" required value={deductionForm.totalAmount} onChange={(e) => setDeductionForm({ ...deductionForm, totalAmount: e.target.value })} />
                                </label>
                                <label className="block">
                                    <span className="mb-1 block text-xs font-bold text-slate-500">{isArabic ? 'الرصيد المتبقي' : 'Remaining balance'}</span>
                                    <input className="h-9 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-800 outline-hidden dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" type="number" min="0.01" max={deductionForm.totalAmount || undefined} step="0.01" value={deductionForm.remainingAmount} onChange={(e) => setDeductionForm({ ...deductionForm, remainingAmount: e.target.value })} />
                                </label>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                            <label className="block">
                                <span className="mb-1 block text-xs font-bold text-slate-500">{isArabic ? 'تاريخ البداية' : 'Start date'}</span>
                                <input className="h-9 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-800 outline-hidden dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" type="date" required value={deductionForm.startDate} onChange={(e) => setDeductionForm({ ...deductionForm, startDate: e.target.value })} />
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-xs font-bold text-slate-500">{isArabic ? 'تاريخ النهاية (اختياري)' : 'End date (optional)'}</span>
                                <input className="h-9 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-800 outline-hidden dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" type="date" min={deductionForm.startDate} value={deductionForm.endDate || ''} onChange={(e) => setDeductionForm({ ...deductionForm, endDate: e.target.value })} />
                            </label>
                        </div>
                        <button type="submit" disabled={savingDeduction || !permissions.deductions} className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-amber-600 text-xs font-black text-white shadow-xs hover:bg-amber-500 disabled:opacity-40">
                            <Plus size={14} />
                            <span>{t('actions.save')}</span>
                        </button>
                    </form>

                    <form onSubmit={onCreatePenalty} className="rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 space-y-3.5">
                        <h2 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
                            <AlertTriangle size={17} />
                            <span>{t('setup.penalties')}</span>
                        </h2>
                        <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-500">{t('fields.employee')}</span>
                            <select className="h-9 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-800 outline-hidden dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" value={penaltyForm.userId} onChange={(e) => setPenaltyForm({ ...penaltyForm, userId: e.target.value })} required>
                                <option value="">{t('placeholders.employee')}</option>
                                {staff.map((emp) => <option key={emp.user_id} value={emp.user_id}>{emp.full_name}</option>)}
                            </select>
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="block">
                                <span className="mb-1 block text-xs font-bold text-slate-500">{t('fields.penaltyType')}</span>
                                <input className="h-9 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-800 outline-hidden dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" value={penaltyForm.penaltyType} onChange={(e) => setPenaltyForm({ ...penaltyForm, penaltyType: e.target.value })} />
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-xs font-bold text-slate-500">{t('fields.amount')}</span>
                                <input className="h-9 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-800 outline-hidden dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" type="number" min="0.01" step="0.01" value={penaltyForm.amount} onChange={(e) => setPenaltyForm({ ...penaltyForm, amount: e.target.value })} required />
                            </label>
                        </div>
                        <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-500">{t('fields.reason')}</span>
                            <textarea className="min-h-16 w-full rounded-xl border border-slate-200/80 bg-white p-2.5 text-xs font-bold text-slate-800 outline-hidden dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" value={penaltyForm.reason} onChange={(e) => setPenaltyForm({ ...penaltyForm, reason: e.target.value })} required />
                        </label>
                        <button type="submit" disabled={savingPenalty || !permissions.penalties} className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-rose-600 text-xs font-black text-white shadow-xs hover:bg-rose-500 disabled:opacity-40">
                            <Plus size={14} />
                            <span>{t('actions.save')}</span>
                        </button>
                    </form>
                    </div>

                    <div className="grid gap-5 xl:grid-cols-2">
                        <AdjustmentList title={t('setup.deductions')} rows={deductions} currency={currency} isArabic={isArabic} kind="deduction" canApprove={permissions.approve} busy={updatingSetupStatus} onAction={setSetupDecision} />
                        <AdjustmentList title={t('setup.penalties')} rows={penalties} currency={currency} isArabic={isArabic} kind="penalty" canApprove={permissions.approve} busy={updatingSetupStatus} onAction={setSetupDecision} />
                    </div>
                </section>
            )}

            {/* TAB 4: PAYROLL RULES */}
            {activeTab === 'rules' && (
                <section className="grid gap-5 xl:grid-cols-[400px_minmax(0,1fr)]">
                    <form onSubmit={onCreateRule} className="rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 space-y-3.5">
                        <h2 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
                            <Settings2 size={17} />
                            <span>{t('setup.rules')}</span>
                        </h2>
                        <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-500">{t('fields.ruleType')}</span>
                            <select className="h-9 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-800 outline-hidden dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" value={ruleForm.ruleType} onChange={(e) => setRuleForm({ ...ruleForm, ruleType: e.target.value, calculationMethod: RULE_METHODS[e.target.value][0] })}>
                                <option>Allowance</option>
                                <option>Deduction</option>
                                <option>Penalty</option>
                                <option>Overtime</option>
                                <option>Late</option>
                                <option>EarlyLeave</option>
                                <option>Absence</option>
                                <option>EmployerContribution</option>
                            </select>
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-500">{t('fields.name')}</span>
                            <input className="h-9 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-800 outline-hidden dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} required />
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="block">
                                <span className="mb-1 block text-xs font-bold text-slate-500">{t('fields.method')}</span>
                                <select className="h-9 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-800 outline-hidden dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" value={ruleForm.calculationMethod} onChange={(e) => setRuleForm({ ...ruleForm, calculationMethod: e.target.value })}>
                                    {RULE_METHODS[ruleForm.ruleType].map((method) => <option key={method}>{method}</option>)}
                                </select>
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-xs font-bold text-slate-500">{t('fields.value')}</span>
                                <input className="h-9 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-800 outline-hidden dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" type="number" min={ruleForm.calculationMethod === 'HourlyMultiplier' ? '1.0001' : '0'} step="0.0001" value={ruleForm.value} onChange={(e) => setRuleForm({ ...ruleForm, value: e.target.value })} required />
                            </label>
                        </div>
                        <button type="submit" disabled={savingRule || !permissions.rules} className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-purple-600 text-xs font-black text-white shadow-xs hover:bg-purple-500 disabled:opacity-40">
                            <Plus size={14} />
                            <span>{t('actions.save')}</span>
                        </button>
                    </form>

                    <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                        <h3 className="text-sm font-black text-slate-900 dark:text-white mb-4">{t('setup.rules')} ({rules.length})</h3>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {rules.map(rule => (
                                <div key={rule.rule_id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                                    <p className="truncate font-black text-slate-900 dark:text-white text-xs">{rule.name}</p>
                                    <p className="text-[11px] font-semibold text-slate-400 mt-0.5">{rule.rule_type} • {rule.calculation_method}</p>
                                    <span className="mt-2 inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-black text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">{rule.status}</span>
                                    <div className="mt-3 flex items-center justify-between text-xs font-black text-slate-700 dark:text-slate-300">
                                        <span>{t('fields.value')}</span>
                                        <span>{Number(rule.value || 0)}</span>
                                    </div>
                                    {rule.status === 'Pending Approval' && (
                                        <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                                            {['Approved', 'Rejected'].map((status) => (
                                                <button key={status} type="button" disabled={!permissions.approve || updatingSetupStatus} onClick={() => setSetupDecision({ kind: 'rule', id: rule.rule_id, status, name: rule.name })} className={`rounded-lg px-3 py-1.5 text-[10px] font-black text-white disabled:opacity-40 ${status === 'Approved' ? 'bg-emerald-600' : 'bg-rose-600'}`}>{actionLabel(status, isArabic)}</button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* Individual Itemized Payslip Modal */}
            <PayslipModal
                item={selectedPayslipItem}
                period={selectedPeriod}
                currency={currency}
                onClose={() => setSelectedPayslipItem(null)}
                isArabic={isArabic}
            />

            <ConfirmDialog
                isOpen={Boolean(setupDecision)}
                onClose={() => !updatingSetupStatus && setSetupDecision(null)}
                onConfirm={executeSetupDecision}
                title={isArabic ? 'تأكيد تغيير الحالة' : 'Confirm status change'}
                message={isArabic
                    ? `هل تريد تنفيذ إجراء «${actionLabel(setupDecision?.status, true)}» على «${setupDecision?.name || ''}»؟ سيُسجل الإجراء في سجل التدقيق.`
                    : `Apply “${actionLabel(setupDecision?.status, false)}” to “${setupDecision?.name || ''}”? This action will be recorded in the audit log.`}
                confirmLabel={actionLabel(setupDecision?.status, isArabic)}
                cancelLabel={t('actions.cancel', { defaultValue: 'Cancel' })}
                variant={setupDecision?.status === 'Approved' ? 'info' : 'warning'}
                isLoading={updatingSetupStatus}
            />

            {/* Approval Notes Dialog */}
            {workflowNeedsNotes ? (
                <TextPromptDialog
                    isOpen={Boolean(workflowDecision)}
                    onClose={() => setWorkflowDecision(null)}
                    onConfirm={executeWorkflowDecision}
                    title={workflowDecision?.status === 'Cancelled'
                        ? t('dialog.cancelTitle', { defaultValue: 'Cancel payroll?' })
                        : t('dialog.approveTitle', { defaultValue: 'Approve payroll run?' })}
                    message={workflowDecision?.status === 'Cancelled'
                        ? t('dialog.cancelMessage', {
                            defaultValue: 'Enter a cancellation reason for {{title}}. Reserved deductions and penalties will be released.',
                            title: workflowDecision?.title || t('fallback.period', { defaultValue: 'this period' }),
                        })
                        : t('dialog.approveMessage', {
                            defaultValue: 'Record approval notes before approving {{title}}.',
                            title: workflowDecision?.title || t('fallback.period', { defaultValue: 'this period' }),
                        })}
                    label={t('fields.notes')}
                    placeholder={workflowDecision?.status === 'Cancelled'
                        ? t('dialog.cancelReasonPlaceholder', { defaultValue: 'State the reason for cancellation' })
                        : t('dialog.notesPlaceholder', { defaultValue: 'Summarize the checks completed before approval' })}
                    confirmLabel={workflowDecision?.status === 'Cancelled'
                        ? t('actions.cancelPayroll', { defaultValue: 'Cancel payroll' })
                        : t('actions.approve')}
                    cancelLabel={t('actions.cancel', { defaultValue: 'Cancel' })}
                    validationMessage={workflowDecision?.status === 'Cancelled'
                        ? t('dialog.cancelReasonRequired', { defaultValue: 'Enter a cancellation reason.' })
                        : t('dialog.required', { defaultValue: 'Enter approval notes.' })}
                    validate={(value) => value.length < 3 ? t('dialog.tooShort', { defaultValue: 'Use at least 3 characters.' }) : ''}
                    inputProps={{ maxLength: 1000 }}
                    isLoading={calculating || updatingStatus || cancellingPeriod}
                />
            ) : (
                <ConfirmDialog
                    isOpen={Boolean(workflowDecision)}
                    onClose={() => setWorkflowDecision(null)}
                    onConfirm={() => executeWorkflowDecision('')}
                    title={t('dialog.confirmTitle', { defaultValue: 'Confirm payroll action' })}
                    message={t(`dialog.${workflowDecision?.type === 'calculate' ? 'calculateMessage' : `${workflowDecision?.status}Message`}`, {
                        defaultValue: 'Continue with this payroll action for {{title}}?',
                        title: workflowDecision?.title || t('fallback.period', { defaultValue: 'this period' }),
                        amount: money(run?.total_net ?? selectedPeriod?.total_net ?? 0, currency),
                        date: paymentDate,
                        reference: paymentReference || t('dialog.noReference', { defaultValue: 'no reference' }),
                        method: t(`paymentMethods.${paymentMethod}`, { defaultValue: paymentMethod }),
                    })}
                    confirmLabel={workflowDecision?.status
                        ? t(`actions.${workflowDecision.status === 'Paid' ? 'markPaid' : workflowDecision.status === 'Locked' ? 'lock' : workflowDecision.status === 'Reviewed' ? 'review' : 'approve'}`)
                        : t('actions.calculate')}
                    cancelLabel={t('actions.cancel', { defaultValue: 'Cancel' })}
                    variant={workflowDecision?.status === 'Paid' ? 'warning' : 'info'}
                    isLoading={calculating || updatingStatus || cancellingPeriod}
                />
            )}
        </main>
    );
};

export default Payroll;
