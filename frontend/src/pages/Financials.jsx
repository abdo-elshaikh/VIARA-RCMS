import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Activity,
    AlertTriangle,
    ArrowRight,
    BadgePercent,
    BookOpen,
    CheckCircle2,
    CircleDollarSign,
    FileSpreadsheet,
    Landmark,
    LineChart,
    ListFilter,
    Lock,
    Receipt,
    RefreshCw,
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

const monthStart = () => toFinancialDateInput(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
const today = () => toFinancialDateInput();
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
    description: 'متابعة قائمة الدخل والأرباح، تقارير المصروفات، مستحقات الأطباء، أعمار الديون، ومطابقة اليومية والقيود.',
    liveLedger: 'دفتر الأستاذ المباشر',
    monthRevenue: 'إيرادات الشهر الإجمالية',
    netMargin: 'هامش صافي الربح',
    discountExceptions: 'استثناءات الخصومات',
    oldReceivables: 'ديون متأخرة (>90 يوم)',
    cashVariance: 'فروقات الخزينة والورديات',
    activeWorkspace: 'القسم المالي النشط',
    financialHealth: 'مؤشرات النزاهة والامتثال المالي',
    operatingRhythm: 'دورة العمل المحاسبي اليومي والشهري',
    categories: {
        analytics: 'التحليل والتقارير التنفيذية',
        performance: 'الأداء والربحية التشغيلية',
        liability: 'المصروفات والعمولات',
        collections: 'التحصيل وأعمار الديون',
        governance: 'الحوكمة والإقفال المحاسبي'
    },
    rhythm: [
        { title: 'إغلاق ورديات الخزينة', text: 'مطابقة رصيد الدرج الفعلي لكل وردية' },
        { title: 'تسجيل المصروفات والعهد', text: 'توثيق الفواتير وسندات الصرف' },
        { title: 'مراجعة أعمار الديون', text: 'متابعة المطالبات والجهات الضامنة' },
        { title: 'الإقفال المالي والترحيل', text: 'إغلاق الفترة وترحيل القيود الختامية' }
    ]
};

const Financials = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = searchParams.get('tab') || 'reports';
    const { t, i18n } = useTranslation(['workspace', 'common']);
    const isAr = i18n.language?.startsWith('ar');
    const isRtl = i18n.dir() === 'rtl';

    const monthRange = useMemo(() => ({ startDate: monthStart(), endDate: today() }), []);
    const money = (value) => formatFinancialCurrency(value, i18n.language);
    const date = (value) => formatFinancialDate(value, i18n.language);

    const plQuery = useGetProfitAndLossQuery(monthRange);
    const agingQuery = useGetReceivablesAgingQuery({ asOfDate: monthRange.endDate });
    const cashierQuery = useGetCashierReconciliationQuery(monthRange);
    const commissionsQuery = useGetDoctorCommissionsQuery(monthRange);
    const closuresQuery = useGetFinancialClosuresQuery({});
    const discountQuery = useGetDiscountReportQuery(monthRange);
    const trialBalanceQuery = useGetTrialBalanceQuery(monthRange);

    const tabs = useMemo(() => [
        {
            id: 'reports',
            icon: FileSpreadsheet,
            tone: 'teal',
            category: isAr ? ar.categories.analytics : 'Executive Analytics',
            label: isAr ? 'التقارير المالية المتقدمة' : 'Advanced Reports',
            description: isAr ? 'تقارير مالية مجمعة مع إمكانية التصدير إلى Excel وPDF وWord وCSV.' : 'Consolidated financial reporting with multi-format exports.'
        },
        {
            id: 'pl',
            icon: LineChart,
            tone: 'emerald',
            category: isAr ? ar.categories.performance : 'Operational Performance',
            label: isAr ? 'قائمة الأرباح والخسائر (P&L)' : 'Profit & Loss (P&L)',
            description: isAr ? 'تحليل الإيرادات والمصروفات وصافي الأرباح وهوامش التشغيل.' : 'Revenue, expense, and operating profit margin analysis.'
        },
        {
            id: 'expenses',
            icon: Receipt,
            tone: 'rose',
            category: isAr ? ar.categories.liability : 'Expense Control',
            label: isAr ? 'إدارة المصروفات والعهد' : 'Expense Manager',
            description: isAr ? 'تسجيل بنود المصروفات التشغيلية والرأسمالية واعتماد الصرف.' : 'Track operating expenses, petty cash, and vendor payments.'
        },
        {
            id: 'commissions',
            icon: CircleDollarSign,
            tone: 'amber',
            category: isAr ? ar.categories.liability : 'Liabilities',
            label: isAr ? 'عمولات ومستحقات الأطباء' : 'Doctor Commissions',
            description: isAr ? 'حساب وتسوية نسب وعمولات الأطباء المحولين والاستشاريين.' : 'Calculate and settle referring physician commission balances.'
        },
        {
            id: 'discounts',
            icon: BadgePercent,
            tone: 'amber',
            category: isAr ? ar.categories.governance : 'Governance',
            label: isAr ? 'تقارير الخصومات والاستثناءات' : 'Discount Reports',
            description: isAr ? 'مراجعة نسب الخصم الممنوحة ومطابقة الموافقات الإدارية.' : 'Audit discounts granted and review high-risk policy exceptions.'
        },
        {
            id: 'receivables',
            icon: ShieldCheck,
            tone: 'sky',
            category: isAr ? ar.categories.collections : 'Collections',
            label: isAr ? 'أعمار الديون والتحصيل' : 'Aging Receivables',
            description: isAr ? 'متابعة الديون المستحقة على الشركات والجهات الضامنة والمرضى.' : 'Track corporate receivables and uncollected patient balances.'
        },
        {
            id: 'cashier',
            icon: WalletCards,
            tone: 'teal',
            category: isAr ? ar.categories.governance : 'Cash Desk',
            label: isAr ? 'مطابقة وجرد الخزينة' : 'Cash Drawer Reconciliation',
            description: isAr ? 'مطابقة النقدية الفعلية مع حركة المقبوضات لكل وردية.' : 'Reconcile drawer cash counts across all shift operations.'
        },
        {
            id: 'ledger',
            icon: BookOpen,
            tone: 'teal',
            category: isAr ? ar.categories.governance : 'Accounting Ledger',
            label: isAr ? 'دفتر الأستاذ وميزان المراجعة' : 'General Ledger & Trial Balance',
            description: isAr ? 'استعراض قيود اليومية المحاسبية وميزان المراجعة الختامي.' : 'Trial balance integrity and posted accounting journal entries.'
        },
        {
            id: 'closures',
            icon: Lock,
            tone: 'violet',
            category: isAr ? ar.categories.governance : 'Period End',
            label: isAr ? 'الإقفال المالي والفترات' : 'Financial Period Closures',
            description: isAr ? 'إجراءات الإقفال الشهري والسنوي وقفل الفترات المحاسبية.' : 'Monthly and yearly closing procedures and ledger locking.'
        }
    ], [isAr]);

    const selected = tabs.find((tab) => tab.id === activeTab) || tabs[0];
    const SelectedIcon = selected.icon;
    const tabGroups = useMemo(() => {
        const groups = new Map();
        tabs.forEach((tab) => {
            if (!groups.has(tab.category)) groups.set(tab.category, []);
            groups.get(tab.category).push(tab);
        });
        return [...groups.entries()].map(([label, items]) => ({ label, items }));
    }, [tabs]);

    const pl = plQuery.data || {};
    const aging = agingQuery.data || {};
    const cashierSummary = cashierQuery.data?.summary || {};
    const commissions = commissionsQuery.data || [];
    const closures = closuresQuery.data || [];
    const discountSummary = discountQuery.data?.summary || {};
    const trialBalance = trialBalanceQuery.data || {};

    const grossRevenue = number(pl.gross_revenue);
    const netProfit = number(pl.net_profit);
    const margin = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;
    const pendingCommission = commissions.reduce((sum, item) => sum + number(item.commission_pending), 0);
    const currentReceivables = firstNumber(aging['0_30'], aging.current, aging.days_1_30);
    const midReceivables = firstNumber(aging['31_60'], aging.days_31_60) + firstNumber(aging['61_90'], aging.days_61_90);
    const oldReceivables = firstNumber(aging['90_plus'], aging.days_90_plus);
    const totalReceivables = firstNumber(aging.total_outstanding, currentReceivables + midReceivables + oldReceivables);
    const cashierVariance = number(cashierSummary.varianceAmount || cashierSummary.variance || 0);
    const discountExceptions = number(discountSummary.flagged_invoices);
    const discountImpact = number(discountSummary.total_discount);
    const ledgerKnown = typeof trialBalance.is_balanced === 'boolean';
    const ledgerBalanced = trialBalance.is_balanced === true;
    const ledgerDifference = number(trialBalance.difference);
    const latestClosure = closures[0];
    const latestClosureBlockers = latestClosure
        ? number(latestClosure.open_shifts) + number(latestClosure.unresolved_variances) + number(latestClosure.pending_refunds)
        : 0;

    const actionQueue = [
        discountExceptions > 0 && {
            icon: BadgePercent,
            label: isAr ? 'خصومات تحتاج مراجعة' : 'Discount exceptions need review',
            detail: `${formatCount(discountExceptions, i18n.language)} · ${money(discountImpact)}`,
            tab: 'discounts',
            tone: 'amber'
        },
        oldReceivables > 0 && {
            icon: AlertTriangle,
            label: isAr ? 'ديون متأخرة تحتاج تحصيلاً' : 'Overdue receivables need follow-up',
            detail: money(oldReceivables),
            tab: 'receivables',
            tone: 'rose'
        },
        Math.abs(cashierVariance) > 0 && {
            icon: WalletCards,
            label: isAr ? 'فروقات خزينة تحتاج مطابقة' : 'Cash variance needs reconciliation',
            detail: money(cashierVariance),
            tab: 'cashier',
            tone: 'amber'
        },
        pendingCommission > 0 && {
            icon: CircleDollarSign,
            label: isAr ? 'مستحقات عمولات جاهزة للدفع' : 'Commissions ready for payment',
            detail: money(pendingCommission),
            tab: 'commissions',
            tone: 'teal'
        },
        latestClosureBlockers > 0 && {
            icon: Lock,
            label: isAr ? 'معوقات إقفال الفترة' : 'Period closure blockers',
            detail: formatCount(latestClosureBlockers, i18n.language),
            tab: 'closures',
            tone: 'violet'
        }
    ].filter(Boolean);

    const pulseLoading = [plQuery, agingQuery, cashierQuery, commissionsQuery, closuresQuery, discountQuery, trialBalanceQuery].some((q) => q.isLoading || q.isFetching);
    const pulseError = [plQuery, agingQuery, cashierQuery, commissionsQuery, closuresQuery, discountQuery, trialBalanceQuery].some((q) => q.isError);

    const workspaceStats = [
        {
            icon: TrendingUp,
            label: isAr ? ar.monthRevenue : 'Gross Revenue (MTD)',
            value: money(grossRevenue),
            detail: `${date(monthRange.startDate)} - ${date(monthRange.endDate)}`,
            tone: 'emerald',
            loading: pulseLoading,
            error: plQuery.isError,
            tag: isAr ? 'إجمالي' : 'Gross'
        },
        {
            icon: grossRevenue && netProfit < 0 ? TrendingDown : LineChart,
            label: isAr ? ar.netMargin : 'Net Profit Margin',
            value: formatPercent(margin, i18n.language),
            detail: money(netProfit),
            tone: netProfit >= 0 ? 'teal' : 'rose',
            loading: pulseLoading,
            error: plQuery.isError,
            tag: netProfit >= 0 ? (isAr ? 'فائض' : 'Surplus') : (isAr ? 'عجز' : 'Deficit')
        },
        {
            icon: BadgePercent,
            label: isAr ? ar.discountExceptions : 'Discount Exceptions',
            value: formatCount(discountExceptions, i18n.language),
            detail: `${isAr ? 'الأثر المالي' : 'Impact'}: ${money(discountImpact)}`,
            tone: discountExceptions > 0 ? 'amber' : 'emerald',
            loading: pulseLoading,
            error: discountQuery.isError,
            tag: discountExceptions > 0 ? (isAr ? 'مراجعة' : 'Review') : (isAr ? 'مطابق' : 'Optimal')
        },
        {
            icon: AlertTriangle,
            label: isAr ? ar.oldReceivables : 'Overdue (>90 Days)',
            value: money(oldReceivables),
            detail: `${isAr ? 'إجمالي الديون' : 'Total'}: ${money(totalReceivables)}`,
            tone: oldReceivables > 0 ? 'rose' : 'emerald',
            loading: pulseLoading,
            error: agingQuery.isError,
            tag: oldReceivables > 0 ? (isAr ? 'مستحق' : 'Action') : (isAr ? 'ممتاز' : 'Clean')
        },
        {
            icon: WalletCards,
            label: isAr ? ar.cashVariance : 'Drawer Variance',
            value: money(cashierVariance),
            detail: `${isAr ? 'الورديات المفتوحة' : 'Open Shifts'}: ${formatCount(cashierSummary.openShifts || 0, i18n.language)}`,
            tone: Math.abs(cashierVariance) > 0 ? 'amber' : 'teal',
            loading: pulseLoading,
            error: cashierQuery.isError,
            tag: Math.abs(cashierVariance) === 0 ? (isAr ? 'متزن' : 'Balanced') : (isAr ? 'فارق' : 'Variance')
        }
    ];

    const healthRows = [
        {
            icon: BookOpen,
            label: isAr ? 'توازن ميزان المراجعة' : 'Trial Balance Status',
            value: ledgerKnown ? (ledgerBalanced ? (isAr ? 'متزن ومطابق' : 'Balanced') : money(ledgerDifference)) : (isAr ? 'غير متوفر' : 'N/A'),
            tone: ledgerKnown ? (ledgerBalanced ? 'emerald' : 'rose') : 'slate',
            error: trialBalanceQuery.isError
        },
        {
            icon: CircleDollarSign,
            label: isAr ? 'مستحقات العمولات المعلقة' : 'Pending Commissions',
            value: money(pendingCommission),
            tone: pendingCommission > 0 ? 'amber' : 'emerald',
            error: commissionsQuery.isError
        },
        {
            icon: ShieldCheck,
            label: isAr ? 'إجمالي المطالبات والديون' : 'Collections Exposure',
            value: money(totalReceivables),
            tone: oldReceivables > 0 ? 'amber' : 'emerald',
            error: agingQuery.isError
        },
        {
            icon: Lock,
            label: isAr ? 'معوقات الإقفال الشهري' : 'Period Close Blockers',
            value: latestClosure ? formatCount(latestClosureBlockers, i18n.language) : (isAr ? 'لا يوجد فترات' : 'None'),
            tone: latestClosureBlockers > 0 ? 'amber' : 'emerald',
            error: closuresQuery.isError
        }
    ];

    return (
        <div className="space-y-4 pb-12" dir={isRtl ? 'rtl' : 'ltr'}>
            {/* Context-first financial header */}
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
                    </div>
                }
            />

            <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/60" aria-label={isAr ? 'نطاق التقرير المالي' : 'Financial reporting context'}>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    <span><strong className="text-slate-900 dark:text-white">{isAr ? 'الفترة' : 'Period'}:</strong> {date(monthRange.startDate)} - {date(monthRange.endDate)}</span>
                    <span><strong className="text-slate-900 dark:text-white">{isAr ? 'الأساس' : 'Basis'}:</strong> {isAr ? 'استحقاقي' : 'Accrual'}</span>
                    <span><strong className="text-slate-900 dark:text-white">{isAr ? 'العملة' : 'Currency'}:</strong> EGP</span>
                </div>
                <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${pulseError ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
                    <span className={`h-2 w-2 rounded-full ${pulseError ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                    {pulseError ? (isAr ? 'بعض البيانات تحتاج إعادة المحاولة' : 'Some data needs attention') : (isAr ? 'البيانات محدثة' : 'Data up to date')}
                </span>
            </section>

            {/* Executive financial metrics */}
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5" aria-label={isAr ? 'المؤشرات المالية الرئيسية' : 'Key financial metrics'}>
                {workspaceStats.map((item) => (
                    <ExecutiveMetricCard key={item.label} {...item} />
                ))}
            </section>

            {/* Main Layout: Navigation + Active Workspace + Executive Sidebar */}
            <div className="grid items-start gap-4 lg:grid-cols-[1fr_310px]">
                {/* Main Content Area */}
                <div className="min-w-0 space-y-4">
                    {/* Grouped financial navigation */}
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                        <nav aria-label={isAr ? 'أقسام الشؤون المالية' : 'Financial sections'} className="divide-y divide-slate-100 dark:divide-slate-800">
                            {tabGroups.map((group) => (
                                <div key={group.label} className="flex min-w-0 flex-col gap-2 p-3 sm:flex-row sm:items-center">
                                    <span className="w-40 shrink-0 text-[10px] font-black uppercase tracking-wider text-slate-400">{group.label}</span>
                                    <div className="flex min-w-0 gap-1.5 overflow-x-auto scrollbar-none">
                                        {group.items.map((tab) => {
                                            const Icon = tab.icon;
                                            const isActive = activeTab === tab.id;
                                            return (
                                                <button
                                                    key={tab.id}
                                                    type="button"
                                                    aria-current={isActive ? 'page' : undefined}
                                                    onClick={() => setSearchParams({ tab: tab.id })}
                                                    className={`flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-bold transition-colors ${isActive ? 'bg-teal-700 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                                                >
                                                    <Icon size={15} aria-hidden="true" />
                                                    <span className="whitespace-nowrap">{tab.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </nav>
                    </div>

                    {/* Active View Title Banner */}
                    <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-3">
                                <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-500/10 text-teal-700 dark:text-teal-300">
                                    <SelectedIcon size={20} />
                                </span>
                                <div>
                                    <h2 className="text-base font-black text-slate-900 dark:text-white">
                                        {selected.label}
                                    </h2>
                                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                        {selected.description}
                                    </p>
                                </div>
                            </div>
                            <span className="inline-flex w-fit items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                <CheckCircle2 size={13} className="text-emerald-500" />
                                <span>{selected.category}</span>
                            </span>
                        </div>
                    </div>

                    {/* Active Subcomponent View */}
                    <div className="min-h-[500px]">
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
                </div>

                {/* Executive Health & Governance Sidebar */}
                <aside className="space-y-3">
                    {/* Financial Integrity Pulse */}
                    <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                            <div className="flex items-center gap-2">
                                <Activity size={16} className="text-teal-600" />
                                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                                    {isAr ? ar.financialHealth : 'Financial Health Pulse'}
                                </h3>
                            </div>
                            {pulseLoading ? (
                                <RefreshCw size={13} className="animate-spin text-slate-400" />
                            ) : (
                                <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20" />
                            )}
                        </div>

                        <div className="mt-3 space-y-2">
                            {healthRows.map((row) => {
                                const Icon = row.icon;
                                return (
                                    <div
                                        key={row.label}
                                        className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-xs dark:border-slate-800 dark:bg-slate-950/40"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Icon size={14} className="text-slate-400 shrink-0" />
                                            <span className="truncate font-semibold text-slate-700 dark:text-slate-300">
                                                {row.label}
                                            </span>
                                        </div>
                                        <span className="font-bold text-slate-900 dark:text-white shrink-0">
                                            {row.value}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Action queue */}
                    <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                        <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                            <ListFilter size={16} className="text-teal-600" />
                            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                                {isAr ? 'الإجراءات المطلوبة' : 'Action queue'}
                            </h3>
                        </div>
                        <div className="mt-3 space-y-2">
                            {actionQueue.length === 0 ? (
                                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                                    {isAr ? 'لا توجد إجراءات مالية عاجلة.' : 'No urgent financial actions.'}
                                </div>
                            ) : actionQueue.map((item) => {
                                const Icon = item.icon;
                                return (
                                    <button key={item.tab} type="button" onClick={() => setSearchParams({ tab: item.tab })} className="flex w-full items-center gap-2.5 rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-start transition-colors hover:border-teal-200 hover:bg-teal-50 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:border-teal-500/30 dark:hover:bg-teal-500/10">
                                        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${item.tone === 'rose' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' : item.tone === 'amber' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' : 'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300'}`}><Icon size={15} /></span>
                                        <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-800 dark:text-slate-200">{item.label}</span><span className="mt-0.5 block text-[11px] font-semibold text-slate-500 dark:text-slate-400">{item.detail}</span></span>
                                        <ArrowRight size={14} className="shrink-0 text-slate-400 rtl:rotate-180" />
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
};

/* Executive Metric Card Component */
const ExecutiveMetricCard = ({ icon: Icon, label, value, detail, tone = 'teal', loading, error, tag }) => {
    const toneStyles = {
        emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
        teal: 'bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/30',
        amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
        rose: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30',
        sky: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30'
    };

    return (
        <article className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 transition-all hover:shadow-md">
            <div className="flex items-center justify-between">
                <span className={`grid h-9 w-9 place-items-center rounded-xl border ${toneStyles[tone] || toneStyles.teal}`}>
                    <Icon size={18} />
                </span>
                {loading ? (
                    <RefreshCw size={13} className="animate-spin text-slate-400" />
                ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9.5px] font-black uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {tag}
                    </span>
                )}
            </div>

            <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {label}
            </p>

            {loading ? (
                <div className="mt-1 h-7 w-24 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
            ) : (
                <p className="mt-0.5 text-xl font-black tabular-nums text-slate-900 dark:text-white sm:text-2xl">
                    {error ? '—' : value}
                </p>
            )}

            {detail && !loading && !error && (
                <p className="mt-1 truncate text-[11px] font-semibold text-slate-400">
                    {detail}
                </p>
            )}
        </article>
    );
};

export default Financials;
