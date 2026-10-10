import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    ArrowRight,
    BadgePercent,
    Banknote,
    BookOpen,
    CalendarDays,
    CircleDollarSign,
    Download,
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
import usePageTitle from '../hooks/usePageTitle';
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

const DATE_PRESETS = ['today', 'thisWeek', 'thisMonth', 'lastMonth', 'thisYear', 'custom'];

const CATEGORY_KEYS = {
    reports: 'analytics',
    pl: 'performance',
    expenses: 'expenseControl',
    commissions: 'liability',
    discounts: 'governance',
    receivables: 'collections',
    cashier: 'cashDesk',
    ledger: 'accountingLedger',
    closures: 'periodEnd'
};

const TAB_IDS = ['reports', 'pl', 'expenses', 'commissions', 'discounts', 'receivables', 'cashier', 'ledger', 'closures'];
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

const Financials = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const requestedTab = searchParams.get('tab');
    const activeTab = TAB_IDS.includes(requestedTab) ? requestedTab : 'reports';
    const { t, i18n } = useTranslation(['workspace', 'common']);
    const isRtl = i18n.dir() === 'rtl';

    const dateRange = { startDate: searchParams.get('startDate') ?? monthStart(), endDate: searchParams.get('endDate') ?? today() };
    const requestedPreset = searchParams.get('period');
    const preset = DATE_PRESETS.includes(requestedPreset) ? requestedPreset : searchParams.has('startDate') || searchParams.has('endDate') ? 'custom' : 'thisMonth';
    const showCustomDates = preset === 'custom';
    const [selectedCategory, setSelectedCategory] = useState('all');

    const updateDateRange = useCallback((nextRange, nextPreset = 'custom') => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            next.set('startDate', nextRange.startDate);
            next.set('endDate', nextRange.endDate);
            next.set('period', nextPreset);
            return next;
        }, { replace: true });
    }, [setSearchParams]);

    const hub = useCallback((key, fallback = undefined) => t(`finance.common.hub.${key}`, { defaultValue: fallback }), [t]);
    usePageTitle(hub('title', 'Executive Financials & Governance'));

    const handlePresetChange = (key) => {
        if (key === 'custom') {
            updateDateRange(dateRange, 'custom');
            return;
        }
        const ranges = {
            today: () => ({ startDate: today(), endDate: today() }),
            thisWeek: () => ({ startDate: weekStart(), endDate: today() }),
            thisMonth: () => ({ startDate: monthStart(), endDate: today() }),
            lastMonth: () => ({ startDate: lastMonthStart(), endDate: lastMonthEnd() }),
            thisYear: () => ({ startDate: yearStart(), endDate: today() })
        };
        updateDateRange(ranges[key](), key);
    };

    const money = useCallback((value) => formatFinancialCurrency(value, i18n.language), [i18n.language]);
    const date = (value) => formatFinancialDate(value, i18n.language);
    const dateRangeValid = validDate(dateRange.startDate) && validDate(dateRange.endDate) && dateRange.startDate <= dateRange.endDate;
    const queryOptions = { skip: !dateRangeValid };

    const queries = {
        pl: useGetProfitAndLossQuery(dateRange, queryOptions),
        aging: useGetReceivablesAgingQuery({ asOfDate: dateRange.endDate }, queryOptions),
        cashier: useGetCashierReconciliationQuery(dateRange, queryOptions),
        commissions: useGetDoctorCommissionsQuery(dateRange, queryOptions),
        closures: useGetFinancialClosuresQuery(dateRange, queryOptions),
        discounts: useGetDiscountReportQuery(dateRange, queryOptions),
        trialBalance: useGetTrialBalanceQuery(dateRange, queryOptions)
    };
    const queryList = Object.values(queries);

    const pl = queries.pl.data || {};
    const aging = queries.aging.data || {};
    const cashierSummary = queries.cashier.data?.summary || {};
    const commissions = queries.commissions.data || [];
    const closures = queries.closures.data || [];
    const discountSummary = queries.discounts.data?.summary || {};
    const trialBalance = queries.trialBalance.data || {};

    const grossRevenue = number(pl.gross_revenue);
    const totalExpenses = number(pl.total_expenses);
    const netProfit = number(pl.net_profit);
    const margin = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;
    const pendingCommission = commissions.reduce((sum, item) => sum + number(item.commission_pending), 0);
    const oldReceivables = firstNumber(aging['90_plus'], aging.days_90_plus);
    const cashierVariance = number(cashierSummary.varianceAmount || cashierSummary.variance || 0);
    const discountExceptions = number(discountSummary.flagged_invoices);
    const discountImpact = number(discountSummary.total_discount);
    const ledgerKnown = typeof trialBalance.is_balanced === 'boolean';
    const ledgerBalanced = trialBalance.is_balanced === true;
    const latestClosure = closures[0];
    const latestClosureBlockers = latestClosure
        ? number(latestClosure.open_shifts) + number(latestClosure.unresolved_variances) + number(latestClosure.pending_refunds)
        : 0;

    const tabs = useMemo(() => TAB_IDS.map((id) => ({
        id,
        icon: {
            reports: FileSpreadsheet,
            pl: LineChart,
            expenses: Receipt,
            commissions: CircleDollarSign,
            discounts: BadgePercent,
            receivables: ShieldCheck,
            cashier: WalletCards,
            ledger: BookOpen,
            closures: Lock
        }[id],
        categoryKey: CATEGORY_KEYS[id],
        label: t(`finance.tabs.${id}`),
        badge: {
            pl: grossRevenue > 0 ? `${margin.toFixed(0)}%` : null,
            expenses: totalExpenses > 0 ? money(totalExpenses) : null,
            commissions: pendingCommission > 0 ? money(pendingCommission) : null,
            discounts: discountExceptions > 0 ? formatCount(discountExceptions, i18n.language) : null,
            receivables: oldReceivables > 0 ? hub('overdue') : null,
            cashier: Math.abs(cashierVariance) > 0 ? money(cashierVariance) : null,
            ledger: ledgerKnown ? (ledgerBalanced ? hub('balanced') : hub('difference')) : null,
            closures: latestClosureBlockers > 0 ? `${formatCount(latestClosureBlockers, i18n.language)} ${hub('blockers')}` : null
        }[id] || null
    })), [t, i18n.language, hub, grossRevenue, margin, totalExpenses, money, pendingCommission, discountExceptions, oldReceivables, cashierVariance, ledgerKnown, ledgerBalanced, latestClosureBlockers]);

    const selectTab = useCallback((tabId) => {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set('tab', tabId);
            return next;
        });
    }, [setSearchParams]);

    const selectCategory = useCallback((catKey) => {
        setSelectedCategory(catKey);
        if (catKey !== 'all') {
            const matchingTab = tabs.find((t) => t.categoryKey === catKey);
            if (matchingTab) {
                setSearchParams((prev) => {
                    const next = new URLSearchParams(prev);
                    next.set('tab', matchingTab.id);
                    return next;
                });
            }
        }
    }, [tabs, setSearchParams]);

    const categoriesList = useMemo(() => [
        { key: 'all', label: t('finance.common.categories.all', { defaultValue: 'All sections' }) },
        ...['analytics', 'performance', 'expenseControl', 'liability', 'governance', 'collections', 'cashDesk', 'accountingLedger', 'periodEnd']
            .map((key) => ({ key, label: t(`finance.common.categories.${key}`) }))
    ], [t]);

    const filteredTabs = useMemo(() => {
        if (selectedCategory === 'all') return tabs;
        return tabs.filter((tab) => tab.categoryKey === selectedCategory || tab.id === activeTab);
    }, [tabs, selectedCategory, activeTab]);

    const actionQueue = [
        discountExceptions > 0 && { tab: 'discounts', label: hub('discountExceptionsNeedReview'), detail: `${formatCount(discountExceptions, i18n.language)} · ${money(discountImpact)}` },
        oldReceivables > 0 && { tab: 'receivables', label: hub('overdueReceivablesNeedFollowUp'), detail: money(oldReceivables) },
        Math.abs(cashierVariance) > 0 && { tab: 'cashier', label: hub('cashVarianceNeedsReconciliation'), detail: money(cashierVariance) },
        pendingCommission > 0 && { tab: 'commissions', label: hub('commissionsReadyForPayment'), detail: money(pendingCommission) },
        latestClosureBlockers > 0 && { tab: 'closures', label: hub('periodClosureBlockers'), detail: formatCount(latestClosureBlockers, i18n.language) }
    ].filter(Boolean);

    const pulseLoading = queryList.some((q) => q.isLoading || q.isFetching);
    const pulseError = !dateRangeValid || queryList.some((q) => q.isError);
    const refreshAll = () => { if (dateRangeValid) queryList.forEach((query) => query.refetch()); };

    const headerMetrics = [
        {
            key: 'revenue',
            icon: TrendingUp,
            label: hub('grossRevenue'),
            value: money(grossRevenue),
            detail: `${date(dateRange.startDate)} - ${date(dateRange.endDate)}`,
            tone: 'emerald',
            loading: pulseLoading,
            error: queries.pl.isError,
        },
        {
            key: 'net_profit',
            icon: grossRevenue && netProfit < 0 ? TrendingDown : LineChart,
            label: hub('netProfit'),
            value: money(netProfit),
            detail: `${hub('margin')}: ${formatPercent(margin, i18n.language)}`,
            tone: netProfit >= 0 ? 'teal' : 'rose',
            badge: margin > 0 ? `${margin.toFixed(0)}%` : undefined,
            loading: pulseLoading,
            error: queries.pl.isError,
        },
        {
            key: 'expenses',
            icon: Banknote,
            label: hub('operatingExpenses'),
            value: money(totalExpenses),
            detail: `${hub('ratio')}: ${grossRevenue > 0 ? formatPercent((totalExpenses / grossRevenue) * 100, i18n.language) : formatPercent(0, i18n.language)}`,
            tone: 'rose',
            loading: pulseLoading,
            error: queries.pl.isError,
        },
        {
            key: 'commissions',
            icon: CircleDollarSign,
            label: hub('pendingCommissions'),
            value: money(pendingCommission),
            detail: `${formatCount(commissions.length, i18n.language)} ${hub('doctors')}`,
            tone: 'amber',
            badge: pendingCommission > 0 ? hub('pending') : undefined,
            loading: pulseLoading,
            error: queries.commissions.isError,
        }
    ];

    return (
        <main className="mx-auto max-w-[1680px] space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
            <PageHeader
                icon={Landmark}
                eyebrowIcon={ShieldCheck}
                eyebrow={hub('eyebrow', 'Consolidated Financial Treasury')}
                title={hub('title', 'Executive Financials & Governance')}
                description={hub('description', 'Track P&L statements, expense approvals, doctor commissions, collections aging, and general ledger journal entries.')}
                meta={
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-bold text-teal-700 dark:text-teal-300">
                            <Zap size={13} className="text-teal-600 dark:text-teal-400" />
                            <span>{hub('liveLedger', 'Live Accounting Ledger')}</span>
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                            {date(dateRange.startDate)} - {date(dateRange.endDate)}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                            {hub('accrualBasis', 'Accrual basis')} · EGP
                        </span>
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${pulseError ? 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'}`}>
                            <span className={`h-2 w-2 rounded-full ${pulseError ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                            {pulseLoading ? t('common:status.loading') : pulseError ? hub('dataNeedsAttention') : hub('dataUpToDate')}
                        </span>
                    </div>
                }
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => selectTab('reports')}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 text-xs font-bold text-white shadow-md shadow-teal-600/20 transition hover:brightness-110 cursor-pointer"
                        >
                            <FileSpreadsheet size={15} />
                            {hub('openReportBuilder', 'Open report builder')}
                        </button>
                        <button
                            type="button"
                            onClick={refreshAll}
                            disabled={pulseLoading || !dateRangeValid}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 cursor-pointer"
                        >
                            <RefreshCw size={14} className={pulseLoading ? 'animate-spin' : ''} />
                            {hub('refresh', 'Refresh')}
                        </button>
                    </div>
                }
                metrics={headerMetrics.map(metric => ({ ...metric, error: metric.error || !dateRangeValid }))}
                metricsStorageKey="viara_financials_header_metrics"
                metricsDefaultVisible={typeof window === 'undefined' || !window.matchMedia?.('(max-width: 639px)')?.matches}
                metricsLabel={hub('keyIndicators', 'Key financial indicators')}
            />

            {dateRangeValid && actionQueue.length > 0 && (
                <div className="rounded-2xl border border-amber-200/90 bg-amber-50/90 p-3 shadow-sm dark:border-amber-500/20 dark:bg-amber-950/30" role="region" aria-label={hub('actionQueue', 'Action queue')}>
                    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2">
                            <ListFilter size={16} className="text-amber-700 dark:text-amber-300" />
                            <h3 className="text-xs font-black text-amber-950 dark:text-amber-200">
                                {hub('actionQueue', 'Action queue')} ({formatCount(actionQueue.length, i18n.language)})
                            </h3>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {actionQueue.map((item) => (
                                <button
                                    key={item.tab}
                                    type="button"
                                    onClick={() => selectTab(item.tab)}
                                    className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300/80 bg-white/90 px-3 py-1 text-xs font-bold text-amber-900 shadow-xs transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-slate-900 dark:text-amber-200 dark:hover:bg-slate-800 cursor-pointer"
                                >
                                    <span>{item.label}</span>
                                    <span className="font-mono font-black" dir="ltr">({item.detail})</span>
                                    <ArrowRight size={12} className="rtl:rotate-180 text-amber-600" />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                <details open={typeof window === 'undefined' || !window.matchMedia?.('(max-width: 639px)')?.matches} className="w-full sm:w-auto">
                <summary className="cursor-pointer text-xs font-bold text-teal-700 sm:hidden dark:text-teal-300">{hub('categoriesAria', 'Filter financial sections by category')}</summary>
                <div className="flex flex-wrap items-center gap-1" role="group" aria-label={hub('categoriesAria', 'Filter financial sections by category')}>
                    {categoriesList.map((cat) => (
                        <button
                            key={cat.key}
                            type="button"
                            onClick={() => selectCategory(cat.key)}
                            aria-pressed={selectedCategory === cat.key}
                            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${selectedCategory === cat.key
                                ? 'bg-teal-700 text-white shadow-sm font-black'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                                }`}
                        >
                            {cat.label}
                        </button>
                    ))}
                </div>
                </details>

                <div className="flex flex-wrap items-center gap-1.5">
                    <CalendarDays size={15} className="text-teal-600 dark:text-teal-400" aria-hidden="true" />
                    {DATE_PRESETS.map((key) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => handlePresetChange(key)}
                            aria-pressed={preset === key}
                            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all cursor-pointer ${preset === key
                                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-black'
                                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                                }`}
                        >
                            {t(`finance.common.presets.${key}`)}
                        </button>
                    ))}

                    {showCustomDates && (
                        <div className="flex items-center gap-1.5 ps-2">
                            <label>
                                <span className="sr-only">{t('finance.pl.startDate')}</span>
                                <input
                                    type="date"
                                    value={dateRange.startDate}
                                    required
                                    max={dateRange.endDate}
                                    onChange={(e) => updateDateRange({ ...dateRange, startDate: e.target.value })}
                                    className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                                />
                            </label>
                            <ArrowRight size={13} className={isRtl ? 'rotate-180 text-slate-400' : 'text-slate-400'} aria-hidden="true" />
                            <label>
                                <span className="sr-only">{t('finance.pl.endDate')}</span>
                                <input
                                    type="date"
                                    value={dateRange.endDate}
                                    required
                                    min={dateRange.startDate}
                                    onChange={(e) => updateDateRange({ ...dateRange, endDate: e.target.value })}
                                    className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                                />
                            </label>
                        </div>
                    )}
                </div>
            </div>

            <div data-workspace-tabs className="rounded-2xl border border-slate-200/80 bg-white/90 p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900/90 overflow-x-auto no-scrollbar">
                <nav aria-label={hub('sectionsAria', 'Financial sections')} className="flex flex-nowrap sm:flex-wrap items-center gap-1 min-w-max sm:min-w-0">
                    {filteredTabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                aria-current={isActive ? 'page' : undefined}
                                onClick={() => selectTab(tab.id)}
                                className={`flex min-h-9 items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all shrink-0 cursor-pointer ${isActive
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

            <div className="min-h-[500px] w-full">
                {!dateRangeValid ? <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-bold text-amber-900">{isRtl ? 'اختر تاريخ بداية ونهاية صحيحين، على أن تكون النهاية بعد البداية أو في اليوم نفسه.' : 'Choose valid start and end dates, with the end on or after the start.'}</div> : <>
                {activeTab === 'reports' && <AdvancedFinancialReports dateRange={dateRange} onDateRangeChange={updateDateRange} />}
                {activeTab === 'pl' && <PLDashboard dateRange={dateRange} onDateRangeChange={updateDateRange} selectedDatePreset={preset} />}
                {activeTab === 'expenses' && <ExpenseManager dateRange={dateRange} />}
                {activeTab === 'commissions' && <CommissionManager dateRange={dateRange} />}
                {activeTab === 'discounts' && <DiscountReports dateRange={dateRange} onDateRangeChange={updateDateRange} />}
                {activeTab === 'receivables' && <AgingReceivables asOfDate={dateRange.endDate} />}
                {activeTab === 'cashier' && <CashReconciliation dateRange={dateRange} />}
                {activeTab === 'ledger' && <GeneralLedger dateRange={dateRange} onDateRangeChange={updateDateRange} />}
                {activeTab === 'closures' && <FinancialClosures dateRange={dateRange} />}
                </>}
            </div>
        </main>
    );
};

export default Financials;
