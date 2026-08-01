import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    AlertTriangle,
    ArrowRight,
    BadgePercent,
    BadgeCheck,
    Banknote,
    BookOpen,
    Calculator,
    CheckCircle2,
    CircleDollarSign,
    Download,
    FileSpreadsheet,
    Landmark,
    LineChart,
    Lock,
    Receipt,
    RefreshCw,
    ShieldCheck,
    Sparkles,
    TrendingDown,
    TrendingUp,
    WalletCards,
    ChevronDown,
    ChevronUp,
    Activity,
    Clock,
    Zap,
    LayoutGrid,
    ListFilter
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

const Financials = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = searchParams.get('tab') || 'reports';
    const { t, i18n } = useTranslation('workspace');
    const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
    const [tabViewMode, setTabViewMode] = useState('pills'); // 'pills' | 'cards'

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
        { id: 'reports', icon: FileSpreadsheet, tone: 'cyan', group: t('finance.workspaceShell.groups.analytics'), priority: t('finance.workspaceShell.priority.executive'), label: t('finance.tabs.reports', { defaultValue: 'Advanced reports' }), description: t('finance.tabDescriptions.reports', { defaultValue: 'Consolidated financial reporting with CSV, Excel, Word, and PDF export.' }), outcome: t('finance.workspaceShell.outcomes.reports') },
        { id: 'pl', icon: LineChart, tone: 'emerald', group: t('finance.workspaceShell.groups.performance'), priority: t('finance.workspaceShell.priority.daily'), label: t('finance.tabs.pl'), description: t('finance.tabDescriptions.pl'), outcome: t('finance.workspaceShell.outcomes.pl') },
        { id: 'expenses', icon: Receipt, tone: 'rose', group: t('finance.workspaceShell.groups.control'), priority: t('finance.workspaceShell.priority.daily'), label: t('finance.tabs.expenses'), description: t('finance.tabDescriptions.expenses'), outcome: t('finance.workspaceShell.outcomes.expenses') },
        { id: 'commissions', icon: CircleDollarSign, tone: 'amber', group: t('finance.workspaceShell.groups.liability'), priority: t('finance.workspaceShell.priority.weekly'), label: t('finance.tabs.commissions'), description: t('finance.tabDescriptions.commissions'), outcome: t('finance.workspaceShell.outcomes.commissions') },
        { id: 'discounts', icon: BadgePercent, tone: 'amber', group: t('finance.workspaceShell.groups.governance'), priority: t('finance.workspaceShell.priority.highRisk'), label: t('finance.tabs.discounts', { defaultValue: 'Discount reports' }), description: t('finance.tabDescriptions.discounts', { defaultValue: 'Review discount impact, approvals, and high-risk policy exceptions.' }), outcome: t('finance.workspaceShell.outcomes.discounts', { defaultValue: 'Discount exception review before close' }) },
        { id: 'receivables', icon: ShieldCheck, tone: 'indigo', group: t('finance.workspaceShell.groups.collections'), priority: t('finance.workspaceShell.priority.highRisk'), label: t('finance.tabs.receivables'), description: t('finance.tabDescriptions.receivables'), outcome: t('finance.workspaceShell.outcomes.receivables') },
        { id: 'cashier', icon: WalletCards, tone: 'slate', group: t('finance.workspaceShell.groups.cashDesk'), priority: t('finance.workspaceShell.priority.shiftClose'), label: t('finance.tabs.cashier'), description: t('finance.tabDescriptions.cashier'), outcome: t('finance.workspaceShell.outcomes.cashier') },
        { id: 'ledger', icon: BookOpen, tone: 'cyan', group: t('finance.workspaceShell.groups.governance'), priority: t('finance.workspaceShell.priority.periodEnd'), label: t('finance.tabs.ledger', { defaultValue: 'General ledger' }), description: t('finance.tabDescriptions.ledger', { defaultValue: 'Trial balance and journal entry drill-down for posted financial activity.' }), outcome: t('finance.workspaceShell.outcomes.ledger', { defaultValue: 'Trace posted journals to source entries' }) },
        { id: 'closures', icon: Lock, tone: 'violet', group: t('finance.workspaceShell.groups.governance'), priority: t('finance.workspaceShell.priority.periodEnd'), label: t('finance.tabs.closures'), description: t('finance.tabDescriptions.closures'), outcome: t('finance.workspaceShell.outcomes.closures') }
    ], [t]);

    const selected = tabs.find((tab) => tab.id === activeTab) || tabs[0];
    const SelectedIcon = selected.icon;
    const activeIndex = tabs.findIndex((tab) => tab.id === selected.id) + 1;

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
    const oldReceivablesRatio = totalReceivables > 0 ? oldReceivables / totalReceivables * 100 : 0;
    const cashierVariance = number(cashierSummary.varianceAmount || cashierSummary.variance || 0);
    const discountExceptions = number(discountSummary.flagged_invoices);
    const discountedInvoices = number(discountSummary.discounted_invoices);
    const discountExceptionRatio = discountedInvoices > 0 ? discountExceptions / discountedInvoices * 100 : 0;
    const discountImpact = number(discountSummary.total_discount);
    const ledgerKnown = typeof trialBalance.is_balanced === 'boolean';
    const ledgerBalanced = trialBalance.is_balanced === true;
    const ledgerDifference = number(trialBalance.difference);
    const latestClosure = closures[0];
    const latestClosureBlockers = latestClosure
        ? number(latestClosure.open_shifts) + number(latestClosure.unresolved_variances) + number(latestClosure.pending_refunds)
        : 0;

    const pulseLoading = [plQuery, agingQuery, cashierQuery, commissionsQuery, closuresQuery, discountQuery, trialBalanceQuery].some((query) => query.isLoading || query.isFetching);
    const pulseError = [plQuery, agingQuery, cashierQuery, commissionsQuery, closuresQuery, discountQuery, trialBalanceQuery].some((query) => query.isError);

    const workspaceStats = [
        { icon: TrendingUp, label: t('finance.workspaceShell.monthRevenue'), value: money(grossRevenue), detail: t('finance.workspaceShell.monthRange', { start: date(monthRange.startDate), end: date(monthRange.endDate) }), tone: 'emerald', loading: pulseLoading, error: plQuery.isError, trend: t('finance.workspaceShell.trends.gross') },
        { icon: grossRevenue && netProfit < 0 ? TrendingDown : LineChart, label: t('finance.workspaceShell.netMargin'), value: formatPercent(margin, i18n.language), detail: money(netProfit), tone: netProfit >= 0 ? 'cyan' : 'rose', loading: pulseLoading, error: plQuery.isError, trend: netProfit >= 0 ? t('finance.workspaceShell.trends.healthy') : t('finance.workspaceShell.trends.deficit') },
        { icon: BadgePercent, label: t('finance.workspaceShell.discountExceptions'), value: formatCount(discountExceptions, i18n.language), detail: t('finance.workspaceShell.discountImpact', { amount: money(discountImpact), rate: formatPercent(discountExceptionRatio, i18n.language) }), tone: discountExceptions > 0 ? 'amber' : 'emerald', loading: pulseLoading, error: discountQuery.isError, trend: discountExceptions > 0 ? t('finance.workspaceShell.trends.review') : t('finance.workspaceShell.trends.optimal') },
        { icon: AlertTriangle, label: t('finance.workspaceShell.oldReceivables'), value: money(oldReceivables), detail: t('finance.workspaceShell.ofOutstanding', { value: formatPercent(oldReceivablesRatio, i18n.language) }), tone: oldReceivables > 0 ? 'amber' : 'emerald', loading: pulseLoading, error: agingQuery.isError, trend: oldReceivables > 0 ? t('finance.workspaceShell.trends.actionRequired') : t('finance.workspaceShell.trends.optimal') },
        { icon: WalletCards, label: t('finance.workspaceShell.cashVariance'), value: money(cashierVariance), detail: t('finance.workspaceShell.openShifts', { count: formatCount(cashierSummary.openShifts || 0, i18n.language) }), tone: Math.abs(cashierVariance) > 0 ? 'amber' : 'slate', loading: pulseLoading, error: cashierQuery.isError, trend: Math.abs(cashierVariance) === 0 ? t('finance.workspaceShell.trends.balanced') : t('finance.workspaceShell.trends.review') }
    ];

    const healthRows = [
        { icon: BookOpen, label: t('finance.workspaceShell.ledgerStatus'), value: ledgerKnown ? (ledgerBalanced ? t('finance.workspaceShell.trends.balanced') : money(ledgerDifference)) : t('finance.workspaceShell.unavailable'), tone: ledgerKnown ? (ledgerBalanced ? 'emerald' : 'rose') : 'slate', error: trialBalanceQuery.isError },
        { icon: CircleDollarSign, label: t('finance.workspaceShell.pendingCommissions'), value: money(pendingCommission), tone: pendingCommission > 0 ? 'amber' : 'emerald', error: commissionsQuery.isError },
        { icon: ShieldCheck, label: t('finance.workspaceShell.collectionsExposure'), value: money(totalReceivables), tone: oldReceivables > 0 ? 'amber' : 'emerald', error: agingQuery.isError },
        { icon: Lock, label: t('finance.workspaceShell.closeBlockers'), value: latestClosure ? formatCount(latestClosureBlockers, i18n.language) : t('finance.workspaceShell.noCloseSnapshot'), tone: latestClosureBlockers > 0 ? 'amber' : 'emerald', error: closuresQuery.isError }
    ];

    return (
        <main className="app-page">
            <div className="mx-auto max-w-screen-2xl space-y-6 pb-12">
                {/* Modernized Executive Page Header */}
                <PageHeader
                    icon={Landmark}
                    eyebrow={t('finance.eyebrow')}
                    title={t('finance.title')}
                    description={t('finance.description')}
                    className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/60 to-cyan-50/40 p-6 shadow-xl shadow-slate-200/30 backdrop-blur-xl dark:border-white/10 dark:from-slate-950 dark:via-slate-900/90 dark:to-cyan-950/20 dark:shadow-none"
                    meta={
                        <div className="flex flex-wrap items-center gap-2">
                            <FinancePill icon={BadgeCheck} label={t('finance.workspaceShell.pills.governed')} glow />
                            <FinancePill icon={Banknote} label={t('finance.workspaceShell.pills.coverage')} />
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/90 px-3 py-1 text-xs font-bold text-emerald-800 shadow-sm dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                                <Zap size={13} className="text-emerald-600 dark:text-emerald-400" />
                                {t('finance.workspaceShell.liveLedger')}
                            </span>
                        </div>
                    }
                    actions={
                        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                            <HeroSignal icon={Calculator} label={t('finance.signals.performance')} />
                            <HeroSignal icon={WalletCards} label={t('finance.signals.cashControl')} />
                            <HeroSignal icon={Lock} label={t('finance.signals.periodGovernance')} wide />
                        </div>
                    }
                />

                {/* Executive Command Signals (KPI Grid) */}
                <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5" aria-label={t('finance.workspaceShell.healthLabel')}>
                    {workspaceStats.map((item) => (
                        <CommandSignal key={item.label} {...item} unavailableLabel={t('finance.workspaceShell.unavailable')} />
                    ))}
                </section>

                {/* Alert Bar for Unavailable Signals */}
                {pulseError && (
                    <section role="alert" className="flex items-start gap-3.5 rounded-2xl border border-amber-300/80 bg-amber-50/90 p-4 text-sm text-amber-900 shadow-md backdrop-blur-md dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100">
                        <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                        <div>
                            <p className="font-black text-amber-950 dark:text-amber-100">{t('finance.workspaceShell.signalsUnavailableTitle')}</p>
                            <p className="mt-0.5 text-xs leading-5 text-amber-800 dark:text-amber-200">{t('finance.workspaceShell.signalsUnavailableDescription')}</p>
                        </div>
                    </section>
                )}

                {/* Segmented Workspace Navigation Bar with View Switcher */}
                <section aria-labelledby="finance-workspaces-heading" className="space-y-4">
                    <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 p-3 shadow-lg shadow-slate-200/40 backdrop-blur-xl dark:border-white/10 dark:bg-[#07111f]/80 dark:shadow-none sm:p-3.5">
                        <div className="mb-3 flex flex-col gap-3 px-1 sm:px-2 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex items-center gap-2.5">
                                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-400">
                                    <Sparkles size={16} />
                                </span>
                                <div>
                                    <h2 id="finance-workspaces-heading" className="text-base font-black tracking-tight text-slate-900 dark:text-white sm:text-lg">
                                        {t('finance.workspaces')}
                                    </h2>
                                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                        {t('finance.workspacesDescription')}
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between lg:justify-end">
                                {/* Layout View Mode Toggle */}
                                <div className="inline-flex w-full rounded-2xl border border-slate-200/80 bg-slate-100/70 p-1 dark:border-white/10 dark:bg-slate-900 sm:w-auto" aria-label={t('finance.workspaceShell.viewMode')}>
                                    <button
                                        type="button"
                                        onClick={() => setTabViewMode('pills')}
                                        className={`flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-1 text-xs font-bold transition-all sm:flex-none ${
                                            tabViewMode === 'pills'
                                                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                                                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                                        }`}
                                        title={t('finance.workspaceShell.compactView')}
                                    >
                                        <ListFilter size={14} />
                                        <span>{t('finance.workspaceShell.compactView')}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setTabViewMode('cards')}
                                        className={`flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-1 text-xs font-bold transition-all sm:flex-none ${
                                            tabViewMode === 'cards'
                                                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                                                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                                        }`}
                                        title={t('finance.workspaceShell.detailedView')}
                                    >
                                        <LayoutGrid size={14} />
                                        <span>{t('finance.workspaceShell.detailedView')}</span>
                                    </button>
                                </div>

                                <span className="rounded-full border border-slate-200/80 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300" dir="ltr">
                                    {formatCount(activeIndex, i18n.language)} / {formatCount(tabs.length, i18n.language)}
                                </span>
                            </div>
                        </div>

                        {/* Navigation View Modes */}
                        {tabViewMode === 'pills' ? (
                            <nav className="flex snap-x gap-2 overflow-x-auto p-1 pb-2 scrollbar-none" aria-label={t('finance.workspaceShell.workspaceNavigation')}>
                                {tabs.map((tab) => (
                                    <WorkspaceTabPill
                                        key={tab.id}
                                        tab={tab}
                                        active={activeTab === tab.id}
                                        onClick={() => setSearchParams({ tab: tab.id })}
                                    />
                                ))}
                            </nav>
                        ) : (
                            <nav className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-9" aria-label={t('finance.workspaceShell.workspaceNavigation')}>
                                {tabs.map((tab) => (
                                    <WorkspaceTabCard
                                        key={tab.id}
                                        tab={tab}
                                        active={activeTab === tab.id}
                                        onClick={() => setSearchParams({ tab: tab.id })}
                                        openLabel={t('finance.workspaceShell.open')}
                                    />
                                ))}
                            </nav>
                        )}
                    </div>
                </section>

                {/* Main Content Layout: Active View Component + Sticky Executive Sidebar */}
                <div className="grid items-start gap-5 lg:gap-6 xl:grid-cols-[minmax(0,1fr)_300px] 2xl:grid-cols-[minmax(0,1fr)_320px]">
                    {/* Active Workspace View Section */}
                    <section aria-labelledby="active-finance-view" className="min-w-0 space-y-5 xl:space-y-6">
                        {/* Selected View Context Banner */}
                        <div key={activeTab} className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 shadow-lg shadow-slate-200/40 backdrop-blur-xl animate-fade-in dark:border-white/10 dark:bg-[#07111f]/80 dark:shadow-none">
                            <div className="flex flex-col gap-4 border-b border-slate-100/80 bg-gradient-to-r from-slate-50/80 via-white to-slate-50/80 p-4 dark:border-white/5 dark:from-white/[0.03] dark:via-transparent dark:to-white/[0.03] sm:p-5 lg:flex-row lg:items-center lg:justify-between">
                                <div className="flex min-w-0 items-start gap-3.5">
                                    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-md sm:h-12 sm:w-12 ${toneClasses(selected.tone).icon}`}>
                                        <SelectedIcon size={22} aria-hidden="true" />
                                    </span>
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2.5">
                                            <h2 id="active-finance-view" className="text-lg font-black tracking-tight text-slate-900 dark:text-white sm:text-xl">
                                                {selected.label}
                                            </h2>
                                            <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider shadow-sm ${toneClasses(selected.tone).badge}`}>
                                                {selected.priority}
                                            </span>
                                        </div>
                                        <p className="mt-1 max-w-3xl text-xs font-medium leading-5 text-slate-600 dark:text-slate-400 sm:text-sm">
                                            {selected.description}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                                    <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm dark:border-white/10 dark:bg-slate-900 dark:text-slate-300">
                                        <CheckCircle2 size={14} className="text-emerald-500" />
                                        {selected.group}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Render Active View Subcomponent */}
                        <div className="transition-all duration-300">
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
                    </section>

                    {/* Executive Health Sidebar */}
                    <aside className="order-first space-y-3 xl:order-none xl:sticky xl:top-6">
                        {/* Mobile Toggle Button for Sidebar */}
                        <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-slate-900 xl:hidden">
                            <span className="flex min-w-0 items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
                                <Activity size={16} className="text-cyan-600 dark:text-cyan-400" />
                                <span className="truncate">{t('finance.workspaceShell.mobileOverview')}</span>
                            </span>
                            <button
                                type="button"
                                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                                aria-expanded={!sidebarCollapsed}
                                aria-label={sidebarCollapsed ? t('finance.workspaceShell.expandOverview') : t('finance.workspaceShell.collapseOverview')}
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition hover:bg-slate-200 dark:bg-white/10 dark:text-slate-300"
                            >
                                {sidebarCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                            </button>
                        </div>

                        <div className={`${sidebarCollapsed ? 'hidden xl:block' : 'grid'} gap-3 md:grid-cols-2 xl:block xl:space-y-3`}>
                            {/* Active Workspace Info Card */}
                            <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80 p-3.5 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-[#07111f]/80 dark:shadow-none">
                                <div className="flex items-center gap-3">
                                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${toneClasses(selected.tone).icon}`}>
                                        <SelectedIcon size={16} />
                                    </span>
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                            {t('finance.workspaceShell.activeWorkspace')}
                                        </p>
                                        <h3 className="truncate text-sm font-black text-slate-900 dark:text-white">
                                            {selected.label}
                                        </h3>
                                    </div>
                                </div>
                                <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-600 dark:text-slate-400">
                                    {selected.outcome}
                                </p>
                            </section>

                            {/* Financial Health Pulse Card */}
                            <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80 p-3.5 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-[#07111f]/80 dark:shadow-none">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                        <Activity size={16} className="text-cyan-600 dark:text-cyan-400" />
                                        <h3 className="text-sm font-black text-slate-900 dark:text-white">
                                            {t('finance.workspaceShell.financialHealth')}
                                        </h3>
                                    </div>
                                    {pulseLoading ? (
                                        <RefreshCw size={14} className="animate-spin text-slate-400" />
                                    ) : (
                                        <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-100 dark:ring-emerald-950" />
                                    )}
                                </div>
                                <div className="mt-3 space-y-2">
                                    {healthRows.map((row) => (
                                        <HealthRow
                                            key={row.label}
                                            {...row}
                                            needsRetryLabel={t('finance.workspaceShell.needsRetry')}
                                            currentPulseLabel={t('finance.workspaceShell.currentPulse')}
                                            unavailableLabel={t('finance.workspaceShell.unavailable')}
                                        />
                                    ))}
                                </div>
                            </section>

                            {/* Operating Rhythm Timeline */}
                            <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80 p-3.5 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-[#07111f]/80 dark:shadow-none">
                                <div className="mb-3 flex items-center gap-2">
                                    <Clock size={16} className="text-violet-600 dark:text-violet-400" />
                                    <h3 className="text-sm font-black text-slate-900 dark:text-white">
                                        {t('finance.workspaceShell.operatingRhythm')}
                                    </h3>
                                </div>
                                <div className="grid gap-2">
                                    <RhythmStep icon={WalletCards} title={t('finance.workspaceShell.rhythm.shiftClose.title')} text={t('finance.workspaceShell.rhythm.shiftClose.text')} step={1} />
                                    <RhythmStep icon={Receipt} title={t('finance.workspaceShell.rhythm.expenseCapture.title')} text={t('finance.workspaceShell.rhythm.expenseCapture.text')} step={2} />
                                    <RhythmStep icon={ShieldCheck} title={t('finance.workspaceShell.rhythm.collectionsReview.title')} text={t('finance.workspaceShell.rhythm.collectionsReview.text')} step={3} />
                                    <RhythmStep icon={Lock} title={t('finance.workspaceShell.rhythm.periodLock.title')} text={t('finance.workspaceShell.rhythm.periodLock.text')} step={4} />
                                </div>
                            </section>

                            {/* Export / Reporting Banner */}
                            <section className="overflow-hidden rounded-2xl border border-cyan-200/80 bg-cyan-50/80 p-3.5 shadow-sm backdrop-blur-xl dark:border-cyan-900/50 dark:bg-cyan-950/20 dark:shadow-none">
                                <div className="flex items-start gap-3">
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-cyan-600 text-white shadow-sm shadow-cyan-600/20 dark:bg-cyan-500">
                                        <Download size={16} />
                                    </span>
                                    <div className="min-w-0">
                                        <h3 className="text-sm font-black text-cyan-950 dark:text-cyan-100">
                                            {t('finance.workspaceShell.professionalReporting')}
                                        </h3>
                                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-cyan-800/90 dark:text-cyan-200/90">
                                            {t('finance.workspaceShell.professionalReportingText')}
                                        </p>
                                    </div>
                                </div>
                            </section>
                        </div>
                    </aside>
                </div>
            </div>
        </main>
    );
};

/* Tone Helper Classes */
const toneClasses = (tone) => ({
    cyan: {
        icon: 'bg-cyan-100 text-cyan-700 ring-1 ring-cyan-200 dark:bg-cyan-500/20 dark:text-cyan-300 dark:ring-cyan-500/30',
        badge: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-300',
        active: 'border-cyan-400/80 bg-cyan-50/90 text-cyan-900 ring-4 ring-cyan-500/15 dark:border-cyan-500/80 dark:bg-cyan-950/40 dark:text-cyan-200 dark:ring-cyan-500/20',
    },
    emerald: {
        icon: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:ring-emerald-500/30',
        badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300',
        active: 'border-emerald-400/80 bg-emerald-50/90 text-emerald-900 ring-4 ring-emerald-500/15 dark:border-emerald-500/80 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-500/20',
    },
    rose: {
        icon: 'bg-rose-100 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/20 dark:text-rose-300 dark:ring-rose-500/30',
        badge: 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300',
        active: 'border-rose-400/80 bg-rose-50/90 text-rose-900 ring-4 ring-rose-500/15 dark:border-rose-500/80 dark:bg-rose-950/40 dark:text-rose-200 dark:ring-rose-500/20',
    },
    amber: {
        icon: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:ring-amber-500/30',
        badge: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
        active: 'border-amber-400/80 bg-amber-50/90 text-amber-900 ring-4 ring-amber-500/15 dark:border-amber-500/80 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-500/20',
    },
    indigo: {
        icon: 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-300 dark:ring-indigo-500/30',
        badge: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-300',
        active: 'border-indigo-400/80 bg-indigo-50/90 text-indigo-900 ring-4 ring-indigo-500/15 dark:border-indigo-500/80 dark:bg-indigo-950/40 dark:text-indigo-200 dark:ring-indigo-500/20',
    },
    violet: {
        icon: 'bg-violet-100 text-violet-700 ring-1 ring-violet-200 dark:bg-violet-500/20 dark:text-violet-300 dark:ring-violet-500/30',
        badge: 'bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-300',
        active: 'border-violet-400/80 bg-violet-50/90 text-violet-900 ring-4 ring-violet-500/15 dark:border-violet-500/80 dark:bg-violet-950/40 dark:text-violet-200 dark:ring-violet-500/20',
    },
    slate: {
        icon: 'bg-slate-200 text-slate-700 ring-1 ring-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700',
        badge: 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
        active: 'border-slate-400/80 bg-slate-100/90 text-slate-900 ring-4 ring-slate-500/15 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-200 dark:ring-slate-500/20',
    }
}[tone] || {
    icon: 'bg-cyan-100 text-cyan-700 ring-1 ring-cyan-200 dark:bg-cyan-500/20 dark:text-cyan-300 dark:ring-cyan-500/30',
    badge: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-300',
    active: 'border-cyan-400/80 bg-cyan-50/90 text-cyan-900 ring-4 ring-cyan-500/15 dark:border-cyan-500/80 dark:bg-cyan-950/40 dark:text-cyan-200 dark:ring-cyan-500/20',
});

/* Segmented Workspace Tab Pill */
const WorkspaceTabPill = ({ tab, active, onClick }) => {
    const Icon = tab.icon;
    const tone = toneClasses(tab.tone);
    return (
        <button
            type="button"
            onClick={onClick}
            aria-current={active ? 'page' : undefined}
            className={`group relative flex min-w-[190px] shrink-0 snap-start items-center gap-2.5 rounded-2xl border px-3.5 py-3 text-xs font-bold transition-all duration-300 sm:min-w-[210px] sm:px-4 ${active
                ? `${tone.active} shadow-md`
                : 'border-slate-200/80 bg-white/70 text-slate-600 hover:border-slate-300 hover:bg-slate-100/80 dark:border-white/5 dark:bg-white/[0.02] dark:text-slate-300 dark:hover:border-white/10 dark:hover:bg-white/5'
                }`}
        >
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110 ${tone.icon}`}>
                <Icon size={16} />
            </span>
            <div className="min-w-0 text-start">
                <span className="block truncate text-xs font-black tracking-tight text-slate-900 dark:text-white">
                    {tab.label}
                </span>
                <span className="block truncate text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                    {tab.group}
                </span>
            </div>
            {active && (
                <span className="ms-1 flex h-2 w-2 rounded-full bg-cyan-500 shadow-sm shadow-cyan-500/50" />
            )}
        </button>
    );
};

/* Workspace Tab Card View */
const WorkspaceTabCard = ({ tab, active, onClick, openLabel }) => {
    const Icon = tab.icon;
    const tone = toneClasses(tab.tone);
    return (
        <button
            type="button"
            onClick={onClick}
            aria-current={active ? 'page' : undefined}
            className={`group flex min-h-[128px] flex-col items-start justify-between rounded-2xl border p-4 text-start transition-all duration-300 ${active
                ? `${tone.active} shadow-md ring-2`
                : 'border-slate-200/80 bg-white/70 hover:border-slate-300 hover:bg-slate-100/80 dark:border-white/5 dark:bg-white/[0.02] dark:hover:border-white/10 dark:hover:bg-white/5'
                }`}
        >
            <span className="flex w-full items-start justify-between gap-2">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110 ${tone.icon}`}>
                    <Icon size={17} />
                </span>
                <span className={`max-w-[120px] truncate rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${active ? tone.badge : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                    {tab.group}
                </span>
            </span>
            <span className="mt-2 block min-w-0">
                <span className="block text-xs font-black text-slate-900 dark:text-white">{tab.label}</span>
                <span className="mt-1 line-clamp-2 block text-[11px] leading-4 text-slate-500 dark:text-slate-400">{tab.description}</span>
            </span>
            <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-black text-slate-400 group-hover:text-cyan-600 dark:group-hover:text-cyan-400">
                {openLabel} <ArrowRight size={12} className="rtl-flip" />
            </span>
        </button>
    );
};

/* Executive KPI Card */
const CommandSignal = ({ icon: Icon, label, value, detail, tone, loading, error, unavailableLabel, trend }) => {
    const classes = toneClasses(tone);
    return (
        <article className="group relative min-w-0 overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 p-4 shadow-lg shadow-slate-200/30 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-xl dark:border-white/10 dark:bg-[#07111f]/80 dark:shadow-none sm:p-5">
            <div className="flex items-center justify-between gap-3">
                <span className={`flex h-11 w-11 items-center justify-center rounded-2xl shadow-sm transition-transform duration-300 group-hover:scale-110 ${classes.icon}`}>
                    <Icon size={20} />
                </span>
                {loading ? (
                    <RefreshCw size={16} className="animate-spin text-slate-400" />
                ) : error ? (
                    <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400" />
                ) : (
                    <span className="inline-flex max-w-[110px] items-center gap-1 truncate rounded-full border border-slate-200/80 bg-slate-50 px-2.5 py-0.5 text-[10px] font-black text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                        {trend}
                    </span>
                )}
            </div>
            <p className="mt-4 text-[11px] font-black uppercase tracking-wider text-slate-400">{label}</p>
            {loading ? (
                <div className="mt-2 h-7 w-32 animate-pulse rounded-xl bg-slate-200/70 dark:bg-white/10" />
            ) : (
                <p className="mt-1 truncate text-lg font-black tracking-tight text-slate-900 dark:text-white sm:text-2xl">
                    {error ? unavailableLabel : value}
                </p>
            )}
            {detail && !loading && !error && (
                <p className="mt-1.5 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {detail}
                </p>
            )}
        </article>
    );
};

/* Health Indicator Row */
const HealthRow = ({ icon: Icon, label, value, tone, error, needsRetryLabel, currentPulseLabel, unavailableLabel }) => {
    const classes = toneClasses(error ? 'amber' : tone);
    return (
        <div className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 transition-colors hover:bg-slate-100/80 dark:border-white/5 dark:bg-white/[0.02] dark:hover:bg-white/5">
            <div className="flex min-w-0 items-center gap-2">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${classes.icon}`}>
                    <Icon size={14} />
                </span>
                <span className="min-w-0">
                    <span className="block truncate text-xs font-black text-slate-900 dark:text-white">{label}</span>
                    <span className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                        {error ? needsRetryLabel : currentPulseLabel}
                    </span>
                </span>
            </div>
        <span className="max-w-[44%] truncate text-end text-xs font-black text-slate-800 dark:text-slate-200">
            {error ? unavailableLabel : value}
        </span>
        </div>
    );
};

/* Micro Pill */
const FinancePill = ({ icon: Icon, label, glow }) => (
    <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold shadow-sm transition-all ${
        glow
            ? 'border-cyan-300 bg-cyan-50 text-cyan-900 shadow-cyan-500/10 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-300'
            : 'border-slate-200/80 bg-white text-slate-700 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300'
    }`}>
        <Icon size={13} className="text-cyan-600 dark:text-cyan-400" />
        <span className="truncate">{label}</span>
    </span>
);

/* Operating Rhythm Step Item */
const RhythmStep = ({ icon: Icon, title, text, step }) => (
    <div className="flex min-w-0 items-start gap-2 rounded-xl bg-slate-50/70 px-2.5 py-2 dark:bg-white/[0.03]">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-black text-slate-700 dark:bg-white/10 dark:text-slate-300">
            {step}
        </span>
        <div className="min-w-0">
            <p className="truncate text-xs font-black text-slate-900 dark:text-white">{title}</p>
            <p className="sr-only">{text}</p>
        </div>
    </div>
);

/* Top Header Quick Signal */
const HeroSignal = ({ icon: Icon, label, wide }) => (
    <div className={`flex min-w-0 items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/80 px-3.5 py-2.5 text-xs font-bold text-slate-700 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-slate-900/80 dark:text-slate-300 ${wide ? 'col-span-2 sm:col-span-1' : ''}`}>
        <Icon size={16} className="shrink-0 text-cyan-600 dark:text-cyan-400" aria-hidden="true" />
        <span className="truncate">{label}</span>
    </div>
);

export default Financials;
