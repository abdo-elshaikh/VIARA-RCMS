import { useMemo, useState } from 'react';
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
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import TextPromptDialog from '../components/ui/TextPromptDialog';
import {
    useCalculatePayrollRunMutation,
    useCreatePayrollCompensationMutation,
    useCreatePayrollDeductionMutation,
    useCreatePayrollPenaltyMutation,
    useCreatePayrollPeriodMutation,
    useCreatePayrollRuleMutation,
    useGetEmployeeProfilesQuery,
    useGetPayrollCompensationQuery,
    useGetPayrollDeductionsQuery,
    useGetPayrollOverviewQuery,
    useGetPayrollPenaltiesQuery,
    useGetPayrollPeriodsQuery,
    useGetPayrollRulesQuery,
    useGetPayrollRunQuery,
    useUpdatePayrollRunStatusMutation,
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
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
};

const shortDate = (value) => (value ? String(value).slice(0, 10) : '-');

const getErrorMessage = (error, fallback) => (
    error?.data?.error || error?.data?.message || error?.error || fallback
);

const statusTone = {
    Draft: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700',
    Calculated: 'bg-cyan-50 text-cyan-700 ring-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:ring-cyan-800',
    Reviewed: 'bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-800',
    Approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800',
    Paid: 'bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-800',
    Locked: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-800',
    Cancelled: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800',
};

const statToneClasses = {
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900',
    cyan: 'bg-cyan-50 text-cyan-700 ring-cyan-100 dark:bg-cyan-950/40 dark:text-cyan-300 dark:ring-cyan-900',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900',
    indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-900',
};

const buttonToneClasses = {
    cyan: 'bg-cyan-600 hover:bg-cyan-700',
    indigo: 'bg-indigo-600 hover:bg-indigo-700',
    emerald: 'bg-emerald-600 hover:bg-emerald-700',
    teal: 'bg-teal-600 hover:bg-teal-700',
    violet: 'bg-violet-600 hover:bg-violet-700',
    amber: 'bg-amber-600 hover:bg-amber-700',
    rose: 'bg-rose-600 hover:bg-rose-700',
    slate: 'bg-slate-700 hover:bg-slate-800',
};

const StatCard = ({ icon: Icon, label, value, detail, tone = 'cyan' }) => (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
        <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
                <p className="mt-2 truncate text-2xl font-black text-slate-950 dark:text-white">{value}</p>
                {detail && <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{detail}</p>}
            </div>
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${statToneClasses[tone] || statToneClasses.cyan}`}>
                <Icon size={19} />
            </span>
        </div>
    </div>
);

const Field = ({ label, children }) => (
    <label className="block">
        <span className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">{label}</span>
        {children}
    </label>
);

const LoadedInputPanel = ({ icon: Icon, title, subtitle, count, items, emptyText, tone = 'cyan', renderItem }) => (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
            <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-sm font-black text-slate-950 dark:text-white">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ring-1 ${statToneClasses[tone] || statToneClasses.cyan}`}>
                        <Icon size={16} />
                    </span>
                    <span className="truncate">{title}</span>
                </h2>
                <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{subtitle}</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-700 dark:bg-slate-900 dark:text-slate-200">{count}</span>
        </div>
        <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
            {items.map(renderItem)}
            {!items.length && (
                <div className="p-5 text-center text-xs font-bold text-slate-500 dark:text-slate-400">{emptyText}</div>
            )}
        </div>
    </div>
);

const inputClass = 'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100';
const areaClass = 'min-h-20 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100';

const ActionButton = ({ children, icon: Icon, onClick, disabled, tone = 'cyan', type = 'button', title }) => (
    <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        title={title}
        className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-xs font-black text-white shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 ${buttonToneClasses[tone] || buttonToneClasses.cyan}`}
    >
        {Icon && <Icon size={16} />}
        {children}
    </button>
);

const Payroll = () => {
    const { t } = useTranslation('payroll');
    const user = useSelector(selectCurrentUser);
    const permissions = useMemo(() => getPayrollPermissions(user), [user]);
    const initialToday = todayInput();
    const [selectedPeriodId, setSelectedPeriodId] = useState(null);
    const [paymentMethod, setPaymentMethod] = useState('BankTransfer');
    const [paymentReference, setPaymentReference] = useState('');
    const [paymentDate, setPaymentDate] = useState(initialToday);
    const [workflowDecision, setWorkflowDecision] = useState(null);
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
        notes: '',
    });
    const [deductionForm, setDeductionForm] = useState({
        userId: '',
        name: '',
        deductionType: 'Fixed',
        amount: '',
        percentage: '',
        startDate: initialToday,
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
        effectiveFrom: initialToday,
        taxable: true,
        requiresApproval: true,
    });

    const { data: overview } = useGetPayrollOverviewQuery();
    const { data: periods = [], isFetching: periodsLoading } = useGetPayrollPeriodsQuery({ limit: 50 });
    const { data: staff = [] } = useGetEmployeeProfilesQuery();
    const effectivePeriodId = selectedPeriodId || periods[0]?.period_id;
    const selectedPeriod = useMemo(
        () => periods.find((period) => period.period_id === effectivePeriodId) || periods[0],
        [periods, effectivePeriodId]
    );
    const shouldFetchRun = Boolean(effectivePeriodId && (selectedPeriod?.run_id || selectedPeriod?.status !== 'Draft'));
    const { data: run } = useGetPayrollRunQuery(effectivePeriodId, { skip: !shouldFetchRun });
    const { data: compensation = [] } = useGetPayrollCompensationQuery({ limit: 25 });
    const { data: deductions = [] } = useGetPayrollDeductionsQuery({ limit: 25 });
    const { data: penalties = [] } = useGetPayrollPenaltiesQuery({ limit: 25 });
    const { data: rules = [] } = useGetPayrollRulesQuery();

    const [createPeriod, { isLoading: creatingPeriod }] = useCreatePayrollPeriodMutation();
    const [calculateRun, { isLoading: calculating }] = useCalculatePayrollRunMutation();
    const [updateRunStatus, { isLoading: updatingStatus }] = useUpdatePayrollRunStatusMutation();
    const [createCompensation, { isLoading: savingCompensation }] = useCreatePayrollCompensationMutation();
    const [createDeduction, { isLoading: savingDeduction }] = useCreatePayrollDeductionMutation();
    const [createPenalty, { isLoading: savingPenalty }] = useCreatePayrollPenaltyMutation();
    const [createRule, { isLoading: savingRule }] = useCreatePayrollRuleMutation();

    const staffOptions = staff.filter((employee) => !['Patient', 'Referring_Doctor', 'Developer'].includes(employee.role));
    const activeRules = rules.filter((rule) => rule.is_active && (!rule.status || rule.status === 'Approved'));

    const onCreatePeriod = async (event) => {
        event.preventDefault();
        if (!permissions.createPeriod) {
            toast.error(t('validation.permissionDenied', { defaultValue: 'You do not have permission for this payroll action.' }));
            return;
        }
        if (periodForm.endDate < periodForm.startDate) {
            toast.error(t('validation.periodDates', { defaultValue: 'Payroll period end date must be on or after start date.' }));
            return;
        }
        try {
            const created = await createPeriod(periodForm).unwrap();
            setSelectedPeriodId(created.period_id);
            setPeriodForm((current) => ({ ...current, name: '', notes: '' }));
            toast.success(t('toast.periodCreated'));
        } catch (error) {
            toast.error(getErrorMessage(error, t('toast.periodCreateFailed')));
        }
    };

    const onCalculate = async (periodId) => {
        if (!permissions.calculate) {
            toast.error(t('validation.permissionDenied', { defaultValue: 'You do not have permission for this payroll action.' }));
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

    const onStatus = async (runId, status, notes = '') => {
        const requiredPermission = {
            Reviewed: 'review',
            Approved: 'approve',
            Paid: 'pay',
            Locked: 'lock',
        }[status];
        if (requiredPermission && !permissions[requiredPermission]) {
            toast.error(t('validation.permissionDenied', { defaultValue: 'You do not have permission for this payroll action.' }));
            return false;
        }
        const idempotencyKey = status === 'Paid' ? getStoredPayrollPaymentKey(runId) : undefined;
        try {
            await updateRunStatus({
                runId,
                status,
                paymentMethod: status === 'Paid' ? paymentMethod : undefined,
                paidAmount: status === 'Paid' ? Number(run?.total_net ?? selectedPeriod?.total_net ?? 0) : undefined,
                paidDate: status === 'Paid' ? paymentDate : undefined,
                referenceNumber: status === 'Paid' ? paymentReference : undefined,
                notes: notes || undefined,
                idempotencyKey,
            }).unwrap();
            if (status === 'Paid') clearStoredPayrollPaymentKey(runId);
            toast.success(t('toast.statusUpdated'));
            return true;
        } catch (error) {
            toast.error(getErrorMessage(error, t('toast.statusFailed')));
            return false;
        }
    };

    const onCreateCompensation = async (event) => {
        event.preventDefault();
        if (!permissions.compensation) {
            toast.error(t('validation.permissionDenied', { defaultValue: 'You do not have permission for this payroll action.' }));
            return;
        }
        if (compForm.salaryType === 'Monthly' && Number(compForm.baseSalary || 0) <= 0) {
            toast.error(t('validation.monthlySalary', { defaultValue: 'Monthly compensation requires a base salary greater than zero.' }));
            return;
        }
        if (compForm.salaryType === 'Hourly' && Number(compForm.hourlyRate || 0) <= 0) {
            toast.error(t('validation.hourlyRate', { defaultValue: 'Hourly compensation requires an hourly rate greater than zero.' }));
            return;
        }
        try {
            await createCompensation({
                ...compForm,
                baseSalary: Number(compForm.baseSalary || 0),
                hourlyRate: Number(compForm.hourlyRate || 0),
            }).unwrap();
            setCompForm((current) => ({ ...current, baseSalary: '', hourlyRate: '', notes: '' }));
            toast.success(t('toast.compensationSaved'));
        } catch (error) {
            toast.error(getErrorMessage(error, t('toast.saveFailed')));
        }
    };

    const onCreateDeduction = async (event) => {
        event.preventDefault();
        if (!permissions.deductions) {
            toast.error(t('validation.permissionDenied', { defaultValue: 'You do not have permission for this payroll action.' }));
            return;
        }
        if (Number(deductionForm.amount || 0) <= 0 && Number(deductionForm.percentage || 0) <= 0) {
            toast.error(t('validation.deductionValue', { defaultValue: 'Deduction requires an amount or percentage.' }));
            return;
        }
        try {
            await createDeduction({
                ...deductionForm,
                amount: Number(deductionForm.amount || 0),
                percentage: Number(deductionForm.percentage || 0),
            }).unwrap();
            setDeductionForm((current) => ({ ...current, name: '', amount: '', percentage: '', notes: '' }));
            toast.success(t('toast.deductionSaved'));
        } catch (error) {
            toast.error(getErrorMessage(error, t('toast.saveFailed')));
        }
    };

    const onCreatePenalty = async (event) => {
        event.preventDefault();
        if (!permissions.penalties) {
            toast.error(t('validation.permissionDenied', { defaultValue: 'You do not have permission for this payroll action.' }));
            return;
        }
        try {
            await createPenalty({ ...penaltyForm, amount: Number(penaltyForm.amount || 0) }).unwrap();
            setPenaltyForm((current) => ({ ...current, amount: '', reason: '' }));
            toast.success(t('toast.penaltySaved'));
        } catch (error) {
            toast.error(getErrorMessage(error, t('toast.saveFailed')));
        }
    };

    const onCreateRule = async (event) => {
        event.preventDefault();
        if (!permissions.rules) {
            toast.error(t('validation.permissionDenied', { defaultValue: 'You do not have permission for this payroll action.' }));
            return;
        }
        try {
            await createRule({ ...ruleForm, value: Number(ruleForm.value || 0), metadata: {} }).unwrap();
            setRuleForm((current) => ({ ...current, name: '', value: '' }));
            toast.success(t('toast.ruleSaved'));
        } catch (error) {
            toast.error(getErrorMessage(error, t('toast.saveFailed')));
        }
    };

    const currency = selectedPeriod?.currency_code || 'EGP';
    const runId = selectedPeriod?.run_id || run?.run_id;
    const runStatus = run?.status || selectedPeriod?.run_status || selectedPeriod?.status;
    const paymentReferenceRequired = paymentMethod !== 'Cash';
    const paymentReady = !paymentReferenceRequired || Boolean(paymentReference.trim());
    const missingPermissionText = t('validation.permissionDenied', { defaultValue: 'You do not have permission for this payroll action.' });
    const disabledReason = (allowed) => (allowed ? undefined : missingPermissionText);
    const executeWorkflowDecision = async (notes = '') => {
        if (!workflowDecision) return false;
        const { type, periodId, runId: decisionRunId, status } = workflowDecision;
        const completed = type === 'calculate'
            ? await onCalculate(periodId)
            : await onStatus(decisionRunId, status, notes);
        if (completed) setWorkflowDecision(null);
        return completed;
    };
    const workflowNeedsNotes = workflowDecision?.status === 'Approved';

    return (
        <main className="app-page">
            <div className="mx-auto max-w-screen-2xl space-y-6 pb-12">
                <PageHeader
                    icon={BadgeDollarSign}
                    eyebrow={t('header.eyebrow')}
                    title={t('header.title')}
                    description={t('header.description')}
                    className="rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white via-cyan-50/40 to-emerald-50/30 p-6 shadow-xl shadow-slate-200/30 dark:border-white/10 dark:from-slate-950 dark:via-slate-900 dark:to-cyan-950/20 dark:shadow-none"
                    meta={(
                        <div className="flex flex-wrap gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-300">
                                <ShieldCheck size={13} /> {t('header.controlled')}
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                                <Receipt size={13} /> {t('header.auditable')}
                            </span>
                        </div>
                    )}
                />

                <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard icon={FileSpreadsheet} label={t('stats.net')} value={money(overview?.total_net, currency)} detail={t('stats.netDetail')} tone="emerald" />
                    <StatCard icon={Scale} label={t('stats.gross')} value={money(overview?.total_gross, currency)} detail={t('stats.grossDetail')} tone="cyan" />
                    <StatCard icon={MinusCircle} label={t('stats.controls')} value={money((Number(overview?.total_deductions || 0) + Number(overview?.total_penalties || 0)), currency)} detail={t('stats.controlsDetail', { count: overview?.pending_penalties || 0 })} tone="amber" />
                    <StatCard icon={ClipboardCheck} label={t('stats.openPeriods')} value={overview?.open_periods || 0} detail={t('stats.openDetail', { count: overview?.periods || 0 })} tone="indigo" />
                </section>

                <section className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
                    <div className="space-y-5">
                        <form onSubmit={onCreatePeriod} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <h2 className="text-base font-black text-slate-950 dark:text-white">{t('periods.createTitle')}</h2>
                                    <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{t('periods.createHelp')}</p>
                                </div>
                                <ActionButton type="submit" icon={Plus} disabled={creatingPeriod || !permissions.createPeriod} title={disabledReason(permissions.createPeriod)}>{t('actions.createPeriod')}</ActionButton>
                            </div>
                            <div className="mt-4 grid gap-3 md:grid-cols-5">
                                <Field label={t('fields.periodName')}>
                                    <input className={inputClass} value={periodForm.name} onChange={(e) => setPeriodForm({ ...periodForm, name: e.target.value })} placeholder={t('placeholders.periodName')} required />
                                </Field>
                                <Field label={t('fields.startDate')}>
                                    <input className={inputClass} type="date" value={periodForm.startDate} onChange={(e) => setPeriodForm({ ...periodForm, startDate: e.target.value })} required />
                                </Field>
                                <Field label={t('fields.endDate')}>
                                    <input className={inputClass} type="date" value={periodForm.endDate} onChange={(e) => setPeriodForm({ ...periodForm, endDate: e.target.value })} required />
                                </Field>
                                <Field label={t('fields.currency')}>
                                    <input className={inputClass} value={periodForm.currencyCode} onChange={(e) => setPeriodForm({ ...periodForm, currencyCode: e.target.value.toUpperCase().slice(0, 3) })} required />
                                </Field>
                                <Field label={t('fields.notes')}>
                                    <input className={inputClass} value={periodForm.notes} onChange={(e) => setPeriodForm({ ...periodForm, notes: e.target.value })} />
                                </Field>
                            </div>
                        </form>

                        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
                                <div>
                                    <h2 className="text-base font-black text-slate-950 dark:text-white">{t('periods.title')}</h2>
                                    <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{t('periods.help')}</p>
                                </div>
                                {periodsLoading && <span className="text-xs font-bold text-cyan-600">{t('states.loading')}</span>}
                            </div>
                            <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                {periods.map((period) => (
                                    <button
                                        type="button"
                                        key={period.period_id}
                                        onClick={() => setSelectedPeriodId(period.period_id)}
                                        className={`grid w-full gap-3 p-4 text-start transition hover:bg-slate-50 dark:hover:bg-slate-900/70 lg:grid-cols-[minmax(0,1fr)_auto] ${selectedPeriod?.period_id === period.period_id ? 'bg-cyan-50/60 dark:bg-cyan-950/20' : ''}`}
                                    >
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h3 className="font-black text-slate-950 dark:text-white">{period.name}</h3>
                                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ring-1 ${statusTone[period.status] || statusTone.Draft}`}>{period.status}</span>
                                            </div>
                                            <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{period.start_date?.slice(0, 10)} - {period.end_date?.slice(0, 10)} · {period.employee_count || 0} {t('periods.employees')}</p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4 lg:min-w-[460px]">
                                            <span><b className="block text-slate-400">{t('summary.gross')}</b>{money(period.total_gross, period.currency_code)}</span>
                                            <span><b className="block text-slate-400">{t('summary.deductions')}</b>{money(period.total_deductions, period.currency_code)}</span>
                                            <span><b className="block text-slate-400">{t('summary.penalties')}</b>{money(period.total_penalties, period.currency_code)}</span>
                                            <span><b className="block text-slate-400">{t('summary.net')}</b>{money(period.total_net, period.currency_code)}</span>
                                        </div>
                                    </button>
                                ))}
                                {!periods.length && (
                                    <div className="p-8 text-center">
                                        <FileSpreadsheet className="mx-auto text-slate-300" size={34} />
                                        <p className="mt-3 text-sm font-bold text-slate-600 dark:text-slate-300">{t('periods.empty')}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <aside className="space-y-5">
                        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h2 className="text-base font-black text-slate-950 dark:text-white">{t('workflow.title')}</h2>
                                    <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{selectedPeriod?.name || t('workflow.noPeriod')}</p>
                                </div>
                                <span className={`rounded-full px-2 py-1 text-[11px] font-black ring-1 ${statusTone[runStatus] || statusTone.Draft}`}>{runStatus || 'Draft'}</span>
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-3">
                                <ActionButton
                                    icon={Calculator}
                                    disabled={!selectedPeriod || calculating || !permissions.calculate || !['Draft', 'Calculated'].includes(selectedPeriod.status)}
                                    title={disabledReason(permissions.calculate)}
                                    onClick={() => setWorkflowDecision({ type: 'calculate', periodId: selectedPeriod.period_id, title: selectedPeriod.name })}
                                >
                                    {t('actions.calculate')}
                                </ActionButton>
                                <ActionButton
                                    icon={ClipboardCheck}
                                    tone="indigo"
                                    disabled={!runId || updatingStatus || !permissions.review || runStatus !== 'Calculated'}
                                    title={disabledReason(permissions.review)}
                                    onClick={() => setWorkflowDecision({ type: 'status', runId, status: 'Reviewed', title: selectedPeriod?.name })}
                                >
                                    {t('actions.review')}
                                </ActionButton>
                                <ActionButton
                                    icon={CheckCircle2}
                                    tone="emerald"
                                    disabled={!runId || updatingStatus || !permissions.approve || runStatus !== 'Reviewed'}
                                    title={disabledReason(permissions.approve)}
                                    onClick={() => setWorkflowDecision({ type: 'status', runId, status: 'Approved', title: selectedPeriod?.name })}
                                >
                                    {t('actions.approve')}
                                </ActionButton>
                                <ActionButton
                                    icon={Banknote}
                                    tone="teal"
                                    disabled={!runId || updatingStatus || !permissions.pay || runStatus !== 'Approved' || !paymentReady}
                                    title={!paymentReady ? t('validation.paymentReference', { defaultValue: 'Enter a payment reference for this method.' }) : disabledReason(permissions.pay)}
                                    onClick={() => setWorkflowDecision({ type: 'status', runId, status: 'Paid', title: selectedPeriod?.name })}
                                >
                                    {t('actions.markPaid')}
                                </ActionButton>
                            </div>
                            <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,0.75fr)_minmax(0,1fr)_auto]">
                                <input className={inputClass} type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} aria-label={t('fields.paymentDate')} />
                                <select className={inputClass} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} aria-label={t('fields.paymentMethod', { defaultValue: 'Payment method' })}>
                                    <option value="BankTransfer">{t('paymentMethods.BankTransfer', { defaultValue: 'Bank transfer' })}</option>
                                    <option value="Cash">{t('paymentMethods.Cash', { defaultValue: 'Cash' })}</option>
                                    <option value="Check">{t('paymentMethods.Check', { defaultValue: 'Check' })}</option>
                                    <option value="Wallet">{t('paymentMethods.Wallet', { defaultValue: 'Wallet' })}</option>
                                    <option value="Other">{t('paymentMethods.Other', { defaultValue: 'Other' })}</option>
                                </select>
                                <input className={inputClass} value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder={t('placeholders.paymentReference')} />
                                <ActionButton
                                    icon={LockKeyhole}
                                    tone="violet"
                                    disabled={!runId || updatingStatus || !permissions.lock || runStatus !== 'Paid'}
                                    title={disabledReason(permissions.lock)}
                                    onClick={() => setWorkflowDecision({ type: 'status', runId, status: 'Locked', title: selectedPeriod?.name })}
                                >
                                    {t('actions.lock')}
                                </ActionButton>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
                            <h2 className="text-base font-black text-slate-950 dark:text-white">{t('run.title')}</h2>
                            <div className="mt-3 max-h-[520px] space-y-2 overflow-y-auto pe-1">
                                {(run?.items || []).map((item) => (
                                    <div key={item.item_id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-black text-slate-950 dark:text-white">{item.employee_name}</p>
                                                <p className="text-xs font-semibold text-slate-500">{item.role}</p>
                                            </div>
                                            <p className="text-sm font-black text-emerald-700 dark:text-emerald-300">{money(item.net_pay, currency)}</p>
                                        </div>
                                        <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] font-bold">
                                            <span className="rounded-lg bg-slate-50 p-2 dark:bg-slate-900">{t('summary.gross')}<b className="block text-slate-900 dark:text-white">{money(item.gross_earnings, currency)}</b></span>
                                            <span className="rounded-lg bg-slate-50 p-2 dark:bg-slate-900">{t('summary.deductions')}<b className="block text-slate-900 dark:text-white">{money(item.total_deductions, currency)}</b></span>
                                            <span className="rounded-lg bg-slate-50 p-2 dark:bg-slate-900">{t('summary.penalties')}<b className="block text-slate-900 dark:text-white">{money(item.total_penalties, currency)}</b></span>
                                        </div>
                                    </div>
                                ))}
                                {!run?.items?.length && (
                                    <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
                                        <AlertTriangle className="mx-auto text-slate-300" size={28} />
                                        <p className="mt-2 text-sm font-bold text-slate-500">{t('run.empty')}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </aside>
                </section>

                <section className="grid gap-5 xl:grid-cols-4">
                    <form onSubmit={onCreateCompensation} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
                        <h2 className="flex items-center gap-2 text-sm font-black text-slate-950 dark:text-white"><Users size={17} />{t('setup.compensation')}</h2>
                        <div className="mt-4 space-y-3">
                            <Field label={t('fields.employee')}><select className={inputClass} value={compForm.userId} onChange={(e) => setCompForm({ ...compForm, userId: e.target.value })} required><option value="">{t('placeholders.employee')}</option>{staffOptions.map((employee) => <option key={employee.user_id} value={employee.user_id}>{employee.full_name}</option>)}</select></Field>
                            <Field label={t('fields.salaryType')}><select className={inputClass} value={compForm.salaryType} onChange={(e) => setCompForm({ ...compForm, salaryType: e.target.value })}><option>Monthly</option><option>Hourly</option></select></Field>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label={t('fields.baseSalary')}><input className={inputClass} type="number" min="0" value={compForm.baseSalary} onChange={(e) => setCompForm({ ...compForm, baseSalary: e.target.value })} /></Field>
                                <Field label={t('fields.hourlyRate')}><input className={inputClass} type="number" min="0" value={compForm.hourlyRate} onChange={(e) => setCompForm({ ...compForm, hourlyRate: e.target.value })} /></Field>
                            </div>
                            <Field label={t('fields.effectiveFrom')}><input className={inputClass} type="date" value={compForm.effectiveFrom} onChange={(e) => setCompForm({ ...compForm, effectiveFrom: e.target.value })} required /></Field>
                            <ActionButton type="submit" icon={Plus} disabled={savingCompensation || !permissions.compensation} title={disabledReason(permissions.compensation)}>{t('actions.save')}</ActionButton>
                        </div>
                        <p className="mt-3 text-xs font-semibold text-slate-500">{t('setup.latestProfiles', { count: compensation.length })}</p>
                    </form>

                    <form onSubmit={onCreateDeduction} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
                        <h2 className="flex items-center gap-2 text-sm font-black text-slate-950 dark:text-white"><MinusCircle size={17} />{t('setup.deductions')}</h2>
                        <div className="mt-4 space-y-3">
                            <Field label={t('fields.employee')}><select className={inputClass} value={deductionForm.userId} onChange={(e) => setDeductionForm({ ...deductionForm, userId: e.target.value })} required><option value="">{t('placeholders.employee')}</option>{staffOptions.map((employee) => <option key={employee.user_id} value={employee.user_id}>{employee.full_name}</option>)}</select></Field>
                            <Field label={t('fields.name')}><input className={inputClass} value={deductionForm.name} onChange={(e) => setDeductionForm({ ...deductionForm, name: e.target.value })} required /></Field>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label={t('fields.amount')}><input className={inputClass} type="number" min="0" value={deductionForm.amount} onChange={(e) => setDeductionForm({ ...deductionForm, amount: e.target.value })} /></Field>
                                <Field label={t('fields.percentage')}><input className={inputClass} type="number" min="0" value={deductionForm.percentage} onChange={(e) => setDeductionForm({ ...deductionForm, percentage: e.target.value })} /></Field>
                            </div>
                            <ActionButton type="submit" icon={Plus} tone="amber" disabled={savingDeduction || !permissions.deductions} title={disabledReason(permissions.deductions)}>{t('actions.save')}</ActionButton>
                        </div>
                        <p className="mt-3 text-xs font-semibold text-slate-500">{t('setup.latestDeductions', { count: deductions.length })}</p>
                    </form>

                    <form onSubmit={onCreatePenalty} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
                        <h2 className="flex items-center gap-2 text-sm font-black text-slate-950 dark:text-white"><AlertTriangle size={17} />{t('setup.penalties')}</h2>
                        <div className="mt-4 space-y-3">
                            <Field label={t('fields.employee')}><select className={inputClass} value={penaltyForm.userId} onChange={(e) => setPenaltyForm({ ...penaltyForm, userId: e.target.value })} required><option value="">{t('placeholders.employee')}</option>{staffOptions.map((employee) => <option key={employee.user_id} value={employee.user_id}>{employee.full_name}</option>)}</select></Field>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label={t('fields.penaltyType')}><input className={inputClass} value={penaltyForm.penaltyType} onChange={(e) => setPenaltyForm({ ...penaltyForm, penaltyType: e.target.value })} /></Field>
                                <Field label={t('fields.amount')}><input className={inputClass} type="number" min="0" value={penaltyForm.amount} onChange={(e) => setPenaltyForm({ ...penaltyForm, amount: e.target.value })} required /></Field>
                            </div>
                            <Field label={t('fields.reason')}><textarea className={areaClass} value={penaltyForm.reason} onChange={(e) => setPenaltyForm({ ...penaltyForm, reason: e.target.value })} required /></Field>
                            <ActionButton type="submit" icon={Plus} tone="rose" disabled={savingPenalty || !permissions.penalties} title={disabledReason(permissions.penalties)}>{t('actions.save')}</ActionButton>
                        </div>
                        <p className="mt-3 text-xs font-semibold text-slate-500">{t('setup.latestPenalties', { count: penalties.length })}</p>
                    </form>

                    <form onSubmit={onCreateRule} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
                        <h2 className="flex items-center gap-2 text-sm font-black text-slate-950 dark:text-white"><Settings2 size={17} />{t('setup.rules')}</h2>
                        <div className="mt-4 space-y-3">
                            <Field label={t('fields.ruleType')}><select className={inputClass} value={ruleForm.ruleType} onChange={(e) => setRuleForm({ ...ruleForm, ruleType: e.target.value })}><option>Allowance</option><option>Deduction</option><option>Penalty</option><option>Overtime</option><option>Late</option><option>EarlyLeave</option><option>Absence</option><option>EmployerContribution</option></select></Field>
                            <Field label={t('fields.name')}><input className={inputClass} value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} required /></Field>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label={t('fields.method')}><select className={inputClass} value={ruleForm.calculationMethod} onChange={(e) => setRuleForm({ ...ruleForm, calculationMethod: e.target.value })}><option>FixedAmount</option><option>PercentageOfBase</option><option>PercentageOfGross</option><option>HourlyMultiplier</option><option>PerMinute</option><option>PerDay</option></select></Field>
                                <Field label={t('fields.value')}><input className={inputClass} type="number" min="0" value={ruleForm.value} onChange={(e) => setRuleForm({ ...ruleForm, value: e.target.value })} required /></Field>
                            </div>
                            <ActionButton type="submit" icon={Plus} tone="slate" disabled={savingRule || !permissions.rules} title={disabledReason(permissions.rules)}>{t('actions.save')}</ActionButton>
                        </div>
                        <p className="mt-3 text-xs font-semibold text-slate-500">{t('setup.activeRules', { count: activeRules.length })}</p>
                    </form>
                </section>

                <section className="grid gap-5 xl:grid-cols-4">
                    <LoadedInputPanel
                        icon={Users}
                        tone="cyan"
                        title={t('inputs.profilesTitle', { defaultValue: 'Latest profiles loaded' })}
                        subtitle={t('inputs.profilesSubtitle', { defaultValue: 'Newest compensation profiles available to payroll.' })}
                        count={compensation.length}
                        items={compensation}
                        emptyText={t('inputs.emptyProfiles', { defaultValue: 'No compensation profiles loaded.' })}
                        renderItem={(profile) => (
                            <div key={profile.profile_id} className="p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-black text-slate-950 dark:text-white">{profile.employee_name || profile.email}</p>
                                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{profile.salary_type} - {shortDate(profile.effective_from)} to {shortDate(profile.effective_to)}</p>
                                    </div>
                                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ring-1 ${profile.is_active ? statusTone.Approved : statusTone.Draft}`}>
                                        {profile.is_active ? t('inputs.active', { defaultValue: 'Active' }) : t('inputs.inactive', { defaultValue: 'Inactive' })}
                                    </span>
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                    <span className="rounded-lg bg-slate-50 p-2 dark:bg-slate-900">{t('fields.baseSalary')}<b className="block text-slate-900 dark:text-white">{money(profile.base_salary, currency)}</b></span>
                                    <span className="rounded-lg bg-slate-50 p-2 dark:bg-slate-900">{t('fields.hourlyRate')}<b className="block text-slate-900 dark:text-white">{money(profile.hourly_rate, currency)}</b></span>
                                </div>
                            </div>
                        )}
                    />

                    <LoadedInputPanel
                        icon={MinusCircle}
                        tone="amber"
                        title={t('inputs.deductionsTitle', { defaultValue: 'Latest deductions loaded' })}
                        subtitle={t('inputs.deductionsSubtitle', { defaultValue: 'Newest deductions, including approval and balance state.' })}
                        count={deductions.length}
                        items={deductions}
                        emptyText={t('inputs.emptyDeductions', { defaultValue: 'No deductions loaded.' })}
                        renderItem={(deduction) => (
                            <div key={deduction.deduction_id} className="p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-black text-slate-950 dark:text-white">{deduction.name}</p>
                                        <p className="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{deduction.employee_name} - {deduction.deduction_type}</p>
                                    </div>
                                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ring-1 ${statusTone[deduction.status] || statusTone.Draft}`}>{deduction.status}</span>
                                </div>
                                <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                    <span className="rounded-lg bg-slate-50 p-2 dark:bg-slate-900">{t('fields.amount')}<b className="block text-slate-900 dark:text-white">{money(deduction.amount, currency)}</b></span>
                                    <span className="rounded-lg bg-slate-50 p-2 dark:bg-slate-900">{t('fields.percentage')}<b className="block text-slate-900 dark:text-white">{Number(deduction.percentage || 0)}%</b></span>
                                    <span className="rounded-lg bg-slate-50 p-2 dark:bg-slate-900">{t('inputs.remaining', { defaultValue: 'Remaining' })}<b className="block text-slate-900 dark:text-white">{money(deduction.remaining_amount, currency)}</b></span>
                                </div>
                            </div>
                        )}
                    />

                    <LoadedInputPanel
                        icon={AlertTriangle}
                        tone="amber"
                        title={t('inputs.penaltiesTitle', { defaultValue: 'Latest penalties loaded' })}
                        subtitle={t('inputs.penaltiesSubtitle', { defaultValue: 'Newest penalties that can flow into approved payroll runs.' })}
                        count={penalties.length}
                        items={penalties}
                        emptyText={t('inputs.emptyPenalties', { defaultValue: 'No penalties loaded.' })}
                        renderItem={(penalty) => (
                            <div key={penalty.penalty_id} className="p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-black text-slate-950 dark:text-white">{penalty.penalty_type}</p>
                                        <p className="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{penalty.employee_name} - {penalty.source || t('inputs.manual', { defaultValue: 'Manual' })}</p>
                                    </div>
                                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ring-1 ${statusTone[penalty.status] || statusTone.Draft}`}>{penalty.status}</span>
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                    <span className="rounded-lg bg-slate-50 p-2 dark:bg-slate-900">{t('fields.amount')}<b className="block text-slate-900 dark:text-white">{money(penalty.amount, currency)}</b></span>
                                    <span className="rounded-lg bg-slate-50 p-2 dark:bg-slate-900">{t('fields.startDate')}<b className="block text-slate-900 dark:text-white">{shortDate(penalty.created_at)}</b></span>
                                </div>
                            </div>
                        )}
                    />

                    <LoadedInputPanel
                        icon={Settings2}
                        tone="indigo"
                        title={t('inputs.rulesTitle', { defaultValue: 'Active rules' })}
                        subtitle={t('inputs.rulesSubtitle', { defaultValue: 'Rules currently enabled for payroll calculation.' })}
                        count={activeRules.length}
                        items={activeRules}
                        emptyText={t('inputs.emptyRules', { defaultValue: 'No active payroll rules loaded.' })}
                        renderItem={(rule) => (
                            <div key={rule.rule_id} className="p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-black text-slate-950 dark:text-white">{rule.name}</p>
                                        <p className="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{rule.rule_type} - {rule.calculation_method}</p>
                                    </div>
                                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ring-1 ${rule.requires_approval ? statusTone.Calculated : statusTone.Approved}`}>
                                        {rule.requires_approval ? t('inputs.approvalRequired', { defaultValue: 'Approval' }) : t('inputs.auto', { defaultValue: 'Auto' })}
                                    </span>
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                    <span className="rounded-lg bg-slate-50 p-2 dark:bg-slate-900">{t('fields.value')}<b className="block text-slate-900 dark:text-white">{Number(rule.value || 0)}</b></span>
                                    <span className="rounded-lg bg-slate-50 p-2 dark:bg-slate-900">{t('fields.effectiveFrom')}<b className="block text-slate-900 dark:text-white">{shortDate(rule.effective_from)}</b></span>
                                </div>
                            </div>
                        )}
                    />
                </section>
            </div>

            {workflowNeedsNotes ? (
                <TextPromptDialog
                    isOpen={Boolean(workflowDecision)}
                    onClose={() => setWorkflowDecision(null)}
                    onConfirm={executeWorkflowDecision}
                    title={t('dialog.approveTitle', { defaultValue: 'Approve payroll run?' })}
                    message={t('dialog.approveMessage', {
                        defaultValue: 'Record approval notes before approving {{title}}.',
                        title: workflowDecision?.title || t('fallback.period', { defaultValue: 'this period' }),
                    })}
                    label={t('fields.notes')}
                    placeholder={t('dialog.notesPlaceholder', { defaultValue: 'Summarize the checks completed before approval' })}
                    confirmLabel={t('actions.approve')}
                    cancelLabel={t('actions.cancel', { defaultValue: 'Cancel' })}
                    validationMessage={t('dialog.required', { defaultValue: 'Enter approval notes.' })}
                    validate={(value) => value.length < 3 ? t('dialog.tooShort', { defaultValue: 'Use at least 3 characters.' }) : ''}
                    inputProps={{ maxLength: 1000 }}
                    isLoading={calculating || updatingStatus}
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
                    isLoading={calculating || updatingStatus}
                />
            )}
        </main>
    );
};

export default Payroll;
