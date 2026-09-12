import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Activity,
    AlertCircle,
    AlertTriangle,
    ArrowRight,
    BadgePercent,
    Banknote,
    BookOpen,
    Calendar,
    CalendarDays,
    CheckCircle2,
    CircleDollarSign,
    Download,
    FileSpreadsheet,
    Landmark,
    Layers,
    LineChart,
    ListFilter,
    Lock,
    PieChart,
    Receipt,
    RefreshCw,
    Scale,
    ShieldAlert,
    ShieldCheck,
    TrendingDown,
    TrendingUp,
    WalletCards,
    Zap
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import AgingReceivables from '../components/finance/AgingReceivables';
import AdvancedFinancialReports from '../components/finance/AdvancedFinancialReports';
import CashReconciliation from '../components/finance/CashReconciliation';
import CommissionManager from '../components/finance/CommissionManager';
import DiscountReports from '../components/finance/DiscountReports';
import ExpenseManager from '../components/finance/ExpenseManager';
import FinancialClosures from '../components/finance/FinancialClosures';
import GeneralLedger from '../components/finance/GeneralLedger';
import PLDashboard from '../components/finance/PLDashboard';
import PageHeader from '../components/ui/PageHeader';
import {
    useGetCashierReconciliationQuery,
    useGetDiscountReportQuery,
    useGetDoctorCommissionsQuery,
    useGetFinancialClosuresQuery,
    useGetProfitAndLossQuery,
    useGetReceivablesAgingQuery,
    useGetTrialBalanceQuery
} from '../store/api';
import { formatFinancialCurrency, formatFinancialDate, toFinancialDateInput } from '../utils/financialFormat';

const today = () => toFinancialDateInput();
const weekStart = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return toFinancialDateInput(new Date(d.setDate(diff)));
};
const monthStart = () => toFinancialDateInput(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
const lastMonthStart = () => toFinancialDateInput(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1));
const lastMonthEnd = () => toFinancialDateInput(new Date(new Date().getFullYear(), new Date().getMonth(), 0));
const yearStart = () => toFinancialDateInput(new Date(new Date().getFullYear(), 0, 1));

const number = (value) => Number(value || 0);
const firstNumber = (...values) => {
    const found = values.find((value) => value !== undefined && value !== null && value !== '');
    return number(found);
};
const formatPercent = (value, language) => `${new Intl.NumberFormat(language?.startsWith('ar') ? 'ar-EG' : 'en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(Number(value || 0))}%`;
const formatCount = (value, language) => new Intl.NumberFormat(language?.startsWith('ar') ? 'ar-EG' : 'en-US').format(Number(value || 0));

const ar = {
    eyebrow: 'الإدارة المالية والمحاسبية الموحدة',
    title: 'المركز المالي والحسابات الختامية',
    description: 'متابعة قائمة الدخل، تقارير المصروفات، مستحقات الأطباء، أعمار الديون، ومطابقة اليومية والقيود.',
    liveLedger: 'دفتر الأستاذ المباشر',
    datePresets: {
        today: 'اليوم',
        thisWeek: 'هذا الأسبوع',
        thisMonth: 'هذا الشهر',
        lastMonth: 'الشهر السابق',
        thisYear: 'هذا العام',
        custom: 'فترة مخصصة'
    },
    categories: {
        all: 'كافة الأقسام',
        analytics: 'التحليل والتقارير التنفيذية',
        performance: 'الأداء والربحية التشغيلية',
        liability: 'المصروفات والعمولات',
        collections: 'التحصيل وأعمار الديون',
        governance: 'الحوكمة والإقفال المحاسبي'
    }
};

const Financials = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = searchParams.get('tab') || 'reports';
    const { t, i18n } = useTranslation(['workspace', 'common']);
    const isAr = i18n.language?.startsWith('ar');
    const isRtl = i18n.dir() === 'rtl';

    // Interactive Date Presets State
    const [preset, setPreset] = useState('thisMonth');
    const [dateRange, setDateRange] = useState({ startDate: monthStart(), endDate: today() });
    const [showCustomDates, setShowCustomDates] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState('all');

    const handlePresetChange = (key) => {
        setPreset(key);
        if (key === 'today') {
            setDateRange({ startDate: today(), endDate: today() });
            setShowCustomDates(false);
        } else if (key === 'thisWeek') {
            setDateRange({ startDate: weekStart(), endDate: today() });
            setShowCustomDates(false);
        } else if (key === 'thisMonth') {
            setDateRange({ startDate: monthStart(), endDate: today() });
            setShowCustomDates(false);
        } else if (key === 'lastMonth') {
            setDateRange({ startDate: lastMonthStart(), endDate: lastMonthEnd() });
            setShowCustomDates(false);
        } else if (key === 'thisYear') {
            setDateRange({ startDate: yearStart(), endDate: today() });
            setShowCustomDates(false);
        } else if (key === 'custom') {
            setShowCustomDates(true);
        }
    };

    const money = useCallback((value) => formatFinancialCurrency(value, i18n.language), [i18n.language]);
    const date = (value) => formatFinancialDate(value, i18n.language);

    // Synchronized Financial Queries
    const plQuery = useGetProfitAndLossQuery(dateRange);
    const agingQuery = useGetReceivablesAgingQuery({ asOfDate: dateRange.endDate });
    const cashierQuery = useGetCashierReconciliationQuery(dateRange);
    const commissionsQuery = useGetDoctorCommissionsQuery(dateRange);
    const closuresQuery = useGetFinancialClosuresQuery({});
    const discountQuery = useGetDiscountReportQuery(dateRange);
    const trialBalanceQuery = useGetTrialBalanceQuery(dateRange);

    const pl = plQuery.data || {};
    const aging = agingQuery.data || {};
    const cashierSummary = cashierQuery.data?.summary || {};
    const commissions = commissionsQuery.data || [];
    const closures = closuresQuery.data || [];
    const discountSummary = discountQuery.data?.summary || {};
    const trialBalance = trialBalanceQuery.data || {};

    const grossRevenue = number(pl.gross_revenue);
    const totalExpenses = number(pl.total_expenses);
    const commissionExpense = number(pl.commission_expense);
    const netProfit = number(pl.net_profit);
    const margin = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;
    const pendingCommission = commissions.reduce((sum, item) => sum + number(item.commission_pending), 0);
    const currentReceivables = firstNumber(aging['0_30'], aging.current, aging.days_1_30);
    const midReceivables = firstNumber(aging['31_60'], aging.days_31_60) + firstNumber(aging['61_90'], aging.days_61_90);
    const oldReceivables = firstNumber(aging['90_plus'], aging.days_90_plus);
    const totalReceivables = firstNumber(aging.total_outstanding, currentReceivables + midReceivables + oldReceivables);
    const cashierVariance = number(cashierSummary.varianceAmount || cashierSummary.variance || 0);
    const openShiftsCount = number(cashierSummary.openShifts || 0);
    const discountExceptions = number(discountSummary.flagged_invoices);
    const discountImpact = number(discountSummary.total_discount);
    const ledgerKnown = typeof trialBalance.is_balanced === 'boolean';
    const ledgerBalanced = trialBalance.is_balanced === true;
    const ledgerDifference = number(trialBalance.difference);
    const latestClosure = closures[0];
    const latestClosureBlockers = latestClosure
        ? number(latestClosure.open_shifts) + number(latestClosure.unresolved_variances) + number(latestClosure.pending_refunds)
        : 0;

    // Tabs Definition
    const tabs = useMemo(() => [
        {
            id: 'reports',
            icon: FileSpreadsheet,
            category: isAr ? ar.categories.analytics : 'Executive Analytics',
            categoryKey: 'Executive Analytics',
            label: isAr ? 'التقارير المالية المتقدمة' : 'Advanced Reports',
            badge: null
        },
        {
            id: 'pl',
            icon: LineChart,
            category: isAr ? ar.categories.performance : 'Operational Performance',
            categoryKey: 'Operational Performance',
            label: isAr ? 'قائمة الأرباح والخسائر' : 'Profit & Loss (P&L)',
            badge: grossRevenue > 0 ? `${margin.toFixed(0)}%` : null
        },
        {
            id: 'expenses',
            icon: Receipt,
            category: isAr ? ar.categories.liability : 'Expense Control',
            categoryKey: 'Expense Control',
            label: isAr ? 'إدارة المصروفات والعهد' : 'Expense Manager',
            badge: totalExpenses > 0 ? money(totalExpenses) : null
        },
        {
            id: 'commissions',
            icon: CircleDollarSign,
            category: isAr ? ar.categories.liability : 'Liabilities',
            categoryKey: 'Liabilities',
            label: isAr ? 'عمولات ومستحقات الأطباء' : 'Doctor Commissions',
            badge: pendingCommission > 0 ? money(pendingCommission) : null
        },
        {
            id: 'discounts',
            icon: BadgePercent,
            category: isAr ? ar.categories.governance : 'Governance',
            categoryKey: 'Governance',
            label: isAr ? 'تقارير الخصومات والاستثناءات' : 'Discount Reports',
            badge: discountExceptions > 0 ? `${discountExceptions}` : null
        },
        {
            id: 'receivables',
            icon: ShieldCheck,
            category: isAr ? ar.categories.collections : 'Collections',
            categoryKey: 'Collections',
            label: isAr ? 'أعمار الديون والتحصيل' : 'Aging Receivables',
            badge: oldReceivables > 0 ? (isAr ? 'متأخر' : 'Overdue') : null
        },
        {
            id: 'cashier',
            icon: WalletCards,
            category: isAr ? ar.categories.collections : 'Cash Desk',
            categoryKey: 'Cash Desk',
            label: isAr ? 'مطابقة وجرد الخزينة' : 'Cash Drawer Reconciliation',
            badge: Math.abs(cashierVariance) > 0 ? money(cashierVariance) : null
        },
        {
            id: 'ledger',
            icon: BookOpen,
            category: isAr ? ar.categories.governance : 'Accounting Ledger',
            categoryKey: 'Accounting Ledger',
            label: isAr ? 'دفتر الأستاذ وميزان المراجعة' : 'General Ledger & Trial Balance',
            badge: ledgerKnown ? (ledgerBalanced ? (isAr ? 'متزن' : 'Balanced') : (isAr ? 'فارق' : 'Diff')) : null
        },
        {
            id: 'closures',
            icon: Lock,
            category: isAr ? ar.categories.governance : 'Period End',
            categoryKey: 'Period End',
            label: isAr ? 'الإقفال المالي والفترات' : 'Financial Period Closures',
            badge: latestClosureBlockers > 0 ? `${latestClosureBlockers} ${isAr ? 'عائق' : 'blockers'}` : null
        }
    ], [discountExceptions, isAr, ledgerBalanced, ledgerKnown, margin, money, oldReceivables, pendingCommission, totalExpenses, latestClosureBlockers, cashierVariance, grossRevenue]);

    const filteredTabs = useMemo(() => {
        if (selectedCategory === 'all') return tabs;
        return tabs.filter(t => t.categoryKey === selectedCategory || t.category === selectedCategory);
    }, [tabs, selectedCategory]);

    const categoriesList = useMemo(() => {
        const cats = [
            { key: 'all', label: isAr ? 'كافة الأقسام' : 'All Sections' },
            { key: 'Executive Analytics', label: isAr ? 'التحليل والتقارير' : 'Executive Analytics' },
            { key: 'Operational Performance', label: isAr ? 'الأداء والربحية' : 'Operational Performance' },
            { key: 'Expense Control', label: isAr ? 'المصروفات' : 'Expense Control' },
            { key: 'Liabilities', label: isAr ? 'العمولات' : 'Liabilities' },
            { key: 'Governance', label: isAr ? 'الحوكمة' : 'Governance' },
            { key: 'Collections', label: isAr ? 'الديون والتحصيل' : 'Collections' },
            { key: 'Cash Desk', label: isAr ? 'الخزينة' : 'Cash Desk' },
            { key: 'Accounting Ledger', label: isAr ? 'دفتر الأستاذ' : 'Accounting Ledger' },
            { key: 'Period End', label: isAr ? 'الإقفال المالي' : 'Period End' }
        ];
        return cats;
    }, [isAr]);

    const actionQueue = [
        discountExceptions > 0 && {
            icon: BadgePercent,
            label: isAr ? 'خصومات تحتاج مراجعة واعتماد' : 'Discount exceptions need review',
            detail: `${formatCount(discountExceptions, i18n.language)} · ${money(discountImpact)}`,
            tab: 'discounts',
            tone: 'amber'
        },
        oldReceivables > 0 && {
            icon: AlertTriangle,
            label: isAr ? 'ديون متأخرة تحتاج متابعة عاجلة' : 'Overdue receivables need follow-up',
            detail: money(oldReceivables),
            tab: 'receivables',
            tone: 'rose'
        },
        Math.abs(cashierVariance) > 0 && {
            icon: WalletCards,
            label: isAr ? 'فروقات نقدية بالخزينة تحتاج تسوية' : 'Cash variance needs reconciliation',
            detail: money(cashierVariance),
            tab: 'cashier',
            tone: 'amber'
        },
        pendingCommission > 0 && {
            icon: CircleDollarSign,
            label: isAr ? 'مستحقات عمولات أطباء جاهزة للصرف' : 'Commissions ready for payment',
            detail: money(pendingCommission),
            tab: 'commissions',
            tone: 'teal'
        },
        latestClosureBlockers > 0 && {
            icon: Lock,
            label: isAr ? 'معوقات إقفال الفترة المالية' : 'Period closure blockers',
            detail: formatCount(latestClosureBlockers, i18n.language),
            tab: 'closures',
            tone: 'violet'
        }
    ].filter(Boolean);

    const pulseLoading = [plQuery, agingQuery, cashierQuery, commissionsQuery, closuresQuery, discountQuery, trialBalanceQuery].some((q) => q.isLoading || q.isFetching);
    const pulseError = [plQuery, agingQuery, cashierQuery, commissionsQuery, closuresQuery, discountQuery, trialBalanceQuery].some((q) => q.isError);
    const refreshAll = () => [plQuery, agingQuery, cashierQuery, commissionsQuery, closuresQuery, discountQuery, trialBalanceQuery]
        .forEach(query => query.refetch());

    const headerMetrics = [
        {
            key: 'revenue',
            icon: TrendingUp,
            label: isAr ? 'إجمالي الإيرادات' : 'Gross Revenue',
            value: money(grossRevenue),
            detail: `${date(dateRange.startDate)} - ${date(dateRange.endDate)}`,
            tone: 'emerald',
            loading: pulseLoading,
            error: plQuery.isError,
        },
        {
            key: 'net_profit',
            icon: grossRevenue && netProfit < 0 ? TrendingDown : LineChart,
            label: isAr ? 'صافي الربح' : 'Net Profit',
            value: money(netProfit),
            detail: `${isAr ? 'الهامش' : 'Margin'}: ${margin.toFixed(1)}%`,
            tone: netProfit >= 0 ? 'teal' : 'rose',
            badge: margin > 0 ? `${margin.toFixed(0)}%` : undefined,
            loading: pulseLoading,
            error: plQuery.isError,
        },
        {
            key: 'expenses',
            icon: Receipt,
            label: isAr ? 'المصروفات التشغيلية' : 'Operating Expenses',
            value: money(totalExpenses),
            detail: `${isAr ? 'النسبة' : 'Ratio'}: ${grossRevenue > 0 ? ((totalExpenses / grossRevenue) * 100).toFixed(1) : 0}%`,
            tone: 'rose',
            loading: pulseLoading,
            error: plQuery.isError,
        },
        {
            key: 'commissions',
            icon: CircleDollarSign,
            label: isAr ? 'عمولات الأطباء المعلقة' : 'Pending Commissions',
            value: money(pendingCommission),
            detail: `${commissions.length} ${isAr ? 'طبيب محول' : 'doctors'}`,
            tone: 'amber',
            badge: pendingCommission > 0 ? (isAr ? 'معلق' : 'Pending') : undefined,
            loading: pulseLoading,
            error: commissionsQuery.isError,
        }
    ];

    return (
        <main className="mx-auto max-w-[1680px] space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
            {/* 1. Unified PageHeader Component */}
            <PageHeader
                icon={Landmark}
                eyebrowIcon={ShieldCheck}
                eyebrow={isAr ? ar.eyebrow : 'Consolidated Financial Treasury'}
                title={isAr ? ar.title : 'Executive Financials & Governance'}
                description={isAr ? ar.description : 'Track P&L statements, expense approvals, doctor commissions, collections aging, and general ledger journal entries.'}
                meta={
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-bold text-teal-700 dark:text-teal-300">
                            <Zap size={13} className="text-teal-600 dark:text-teal-400" />
                            <span>{isAr ? ar.liveLedger : 'Live Accounting Ledger'}</span>
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                            {date(dateRange.startDate)} - {date(dateRange.endDate)}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                            {isAr ? 'أساس استحقاقي' : 'Accrual basis'} · EGP
                        </span>
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${pulseError ? 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            }`}>
                            <span className={`h-2 w-2 rounded-full ${pulseError ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                            {pulseError ? (isAr ? 'بيانات تحتاج مراجعة' : 'Data needs attention') : (isAr ? 'البيانات محدثة' : 'Data up to date')}
                        </span>
                    </div>
                }
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setSearchParams({ tab: 'reports' })}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 text-xs font-bold text-white shadow-md shadow-teal-600/20 transition hover:brightness-110"
                        >
                            <Download size={15} />
                            {isAr ? 'تصدير التقارير' : 'Export Reports'}
                        </button>
                        <button
                            type="button"
                            onClick={refreshAll}
                            disabled={pulseLoading}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                        >
                            <RefreshCw size={14} className={pulseLoading ? 'animate-spin' : ''} />
                            {isAr ? 'تحديث السجل' : 'Refresh'}
                        </button>
                    </div>
                }
                metrics={headerMetrics}
                metricsLabel={isAr ? 'المؤشرات المالية الرئيسية' : 'Key financial indicators'}
            />

            {/* 2. Action Queue Banner (if items exist) */}
            {actionQueue.length > 0 && (
                <div className="rounded-2xl border border-amber-200/90 bg-amber-50/90 p-3 shadow-sm dark:border-amber-500/20 dark:bg-amber-950/30">
                    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2">
                            <ListFilter size={16} className="text-amber-700 dark:text-amber-300" />
                            <h3 className="text-xs font-black text-amber-950 dark:text-amber-200">
                                {isAr ? 'الإجراءات والمهام المطلوبة' : 'Action queue'} ({actionQueue.length})
                            </h3>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {actionQueue.map((item) => (
                                <button
                                    key={item.tab}
                                    type="button"
                                    onClick={() => setSearchParams({ tab: item.tab })}
                                    className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300/80 bg-white/90 px-3 py-1 text-xs font-bold text-amber-900 shadow-xs transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-slate-900 dark:text-amber-200 dark:hover:bg-slate-800"
                                >
                                    <span>{item.label}</span>
                                    <span className="font-mono font-black">({item.detail})</span>
                                    <ArrowRight size={12} className="rtl:rotate-180 text-amber-600" />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* 3. Unified Date Range Filter & Category Filter Chips */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                {/* Category Filter Pills */}
                <div className="flex flex-wrap items-center gap-1">
                    {categoriesList.map((cat) => (
                        <button
                            key={cat.key}
                            type="button"
                            onClick={() => setSelectedCategory(cat.key)}
                            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${selectedCategory === cat.key
                                    ? 'bg-teal-700 text-white shadow-sm font-black'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                                }`}
                        >
                            {cat.label}
                        </button>
                    ))}
                </div>

                {/* Date Presets */}
                <div className="flex flex-wrap items-center gap-1.5">
                    <CalendarDays size={15} className="text-teal-600 dark:text-teal-400" />
                    {[
                        { key: 'today', label: isAr ? ar.datePresets.today : 'Today' },
                        { key: 'thisWeek', label: isAr ? ar.datePresets.thisWeek : 'This Week' },
                        { key: 'thisMonth', label: isAr ? ar.datePresets.thisMonth : 'This Month' },
                        { key: 'lastMonth', label: isAr ? ar.datePresets.lastMonth : 'Last Month' },
                        { key: 'thisYear', label: isAr ? ar.datePresets.thisYear : 'This Year' },
                        { key: 'custom', label: isAr ? ar.datePresets.custom : 'Custom' },
                    ].map((p) => (
                        <button
                            key={p.key}
                            type="button"
                            onClick={() => handlePresetChange(p.key)}
                            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${preset === p.key
                                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-black'
                                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                                }`}
                        >
                            {p.label}
                        </button>
                    ))}

                    {showCustomDates && (
                        <div className="flex items-center gap-1.5 ps-2">
                            <input
                                type="date"
                                value={dateRange.startDate}
                                onChange={(e) => setDateRange(r => ({ ...r, startDate: e.target.value }))}
                                className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                            />
                            <span className="text-xs font-bold text-slate-400">→</span>
                            <input
                                type="date"
                                value={dateRange.endDate}
                                onChange={(e) => setDateRange(r => ({ ...r, endDate: e.target.value }))}
                                className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* 4. Clean Single-Tier Segmented Tabs Navigation */}
<div data-workspace-tabs className="rounded-2xl border border-slate-200/80 bg-white/90 p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900/90 lg:hidden">
                <nav aria-label={isAr ? 'أقسام الشؤون المالية' : 'Financial sections'} className="flex flex-wrap gap-1">
                    {filteredTabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                aria-current={isActive ? 'page' : undefined}
                                onClick={() => setSearchParams({ tab: tab.id })}
                                className={`flex min-h-9 items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${isActive
                                        ? 'bg-teal-700 text-white shadow-sm font-black'
                                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                                    }`}
                            >
                                <Icon size={14} aria-hidden="true" />
                                <span className="whitespace-nowrap">{tab.label}</span>
                                {tab.badge && (
                                    <span className={`rounded-md px-1.5 py-0.2 text-[10px] font-black whitespace-nowrap ${isActive
                                            ? 'bg-teal-900/60 text-teal-200'
                                            : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                        }`}>
                                        {tab.badge}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </nav>
            </div>

            {/* 5. Full-Width Active Workspace */}
            <div className="min-h-[500px] w-full">
                {activeTab === 'reports' && <AdvancedFinancialReports />}
                {activeTab === 'pl' && <PLDashboard />}
                {activeTab === 'expenses' && <ExpenseManager />}
                {activeTab === 'commissions' && <CommissionManager />}
                {activeTab === 'discounts' && <DiscountReports />}
                {activeTab === 'receivables' && <AgingReceivables />}
                {activeTab === 'cashier' && <CashReconciliation />}
                {activeTab === 'ledger' && <GeneralLedger />}
                {activeTab === 'closures' && <FinancialClosures />}
            </div>
        </main>
    );
};

export default Financials;
