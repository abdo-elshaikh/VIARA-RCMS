import { useCallback, useMemo, useState } from 'react';
import {
    AlertTriangle,
    BadgePercent,
    CalendarDays,
    CheckCircle2,
    Download,
    FileWarning,
    RefreshCw,
    Search,
    ShieldAlert,
    ShieldCheck,
    SlidersHorizontal,
    TrendingUp,
    XCircle
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGetDiscountReportQuery } from '../../store/api';
import { formatFinancialCurrency, formatFinancialDate, toFinancialDateInput } from '../../utils/financialFormat';
import { escapeFinancialCsvValue as csvEscape } from '../../utils/financialCsv';

const monthStart = () => toFinancialDateInput(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
const today = () => toFinancialDateInput();
const number = (value) => Number(value || 0);
const localeFor = (language = 'en') => language?.startsWith('ar') ? 'ar-EG' : 'en-US';
const percent = (value, language = 'en') => `${new Intl.NumberFormat(localeFor(language), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(number(value))}%`;
const count = (value, language = 'en') => new Intl.NumberFormat(localeFor(language)).format(number(value));

const COPY = {
    en: {
        title: 'Discount governance report',
        eyebrow: 'Revenue control',
        description: 'Review discount impact, approval coverage, missing reasons, and high-risk invoice exceptions.',
        refresh: 'Refresh',
        refreshing: 'Refreshing...',
        exportCsv: 'Export CSV',
        startDate: 'Start date',
        endDate: 'End date',
        groupBy: 'Group by',
        reviewQueue: 'Review queue',
        search: 'Search',
        searchPlaceholder: 'Invoice, reason, approver, or flag',
        minDiscount: 'Minimum discount',
        all: 'All discounts',
        flagged: 'Flagged only',
        highRate: 'High rate',
        noApproval: 'No approval',
        noReason: 'No reason',
        fullWaiver: 'Full waiver',
        cleared: 'Cleared',
        day: 'Daily',
        week: 'Weekly',
        month: 'Monthly',
        discountedInvoices: 'Discounted invoices',
        totalDiscount: 'Total discount',
        averageRate: 'Average rate',
        exceptions: 'Exceptions',
        discountBase: 'Discountable subtotal',
        flaggedShare: '{{value}} of discounted invoices',
        threshold: 'Threshold {{value}}',
        controlScore: 'Control score',
        controlScoreText: 'Higher score means fewer discount policy exceptions in the selected period.',
        exceptionProfile: 'Exception profile',
        periodTrend: 'Discount trend',
        approverReview: 'Approver review',
        invoiceReview: 'Invoice-level review',
        filteredCount: '{{count}} records shown',
        invoiceCount: '{{count}} invoices',
        invoice: 'Invoice',
        date: 'Date',
        subtotal: 'Subtotal',
        discount: 'Discount',
        rate: 'Rate',
        reason: 'Reason',
        approver: 'Approver',
        risk: 'Risk',
        flags: 'Flags',
        unapproved: 'Unapproved',
        notProvided: 'Not provided',
        noFlags: 'No exceptions',
        noRows: 'No discount records match these filters.',
        noData: 'No discounts recorded for this period.',
        loadError: 'Discount report could not be loaded.',
        checkFilters: 'Check the date range and try again.',
        csvDownloaded: 'Discount report exported.',
        csvFailed: 'CSV export failed.',
        low: 'Low',
        medium: 'Medium',
        high: 'High',
        critical: 'Critical'
    },
    ar: {
        title: 'تقرير حوكمة الخصومات',
        eyebrow: 'رقابة الإيرادات',
        description: 'راجع أثر الخصومات وتغطية الاعتمادات والأسباب الناقصة واستثناءات الفواتير عالية المخاطر.',
        refresh: 'تحديث',
        refreshing: 'جار التحديث...',
        exportCsv: 'تصدير CSV',
        startDate: 'تاريخ البداية',
        endDate: 'تاريخ النهاية',
        groupBy: 'التجميع',
        reviewQueue: 'قائمة المراجعة',
        search: 'بحث',
        searchPlaceholder: 'فاتورة أو سبب أو معتمد أو علامة',
        minDiscount: 'أقل خصم',
        all: 'كل الخصومات',
        flagged: 'المعلّمة فقط',
        highRate: 'نسبة مرتفعة',
        noApproval: 'بدون اعتماد',
        noReason: 'بدون سبب',
        fullWaiver: 'إعفاء كامل',
        cleared: 'سليم',
        day: 'يومي',
        week: 'أسبوعي',
        month: 'شهري',
        discountedInvoices: 'فواتير بها خصم',
        totalDiscount: 'إجمالي الخصم',
        averageRate: 'متوسط النسبة',
        exceptions: 'استثناءات',
        discountBase: 'إجمالي قبل الخصم',
        flaggedShare: '{{value}} من فواتير الخصم',
        threshold: 'الحد {{value}}',
        controlScore: 'درجة الرقابة',
        controlScoreText: 'كلما ارتفعت الدرجة قلت مخالفات سياسة الخصومات في الفترة المحددة.',
        exceptionProfile: 'ملف الاستثناءات',
        periodTrend: 'اتجاه الخصومات',
        approverReview: 'مراجعة المعتمدين',
        invoiceReview: 'مراجعة الفواتير',
        filteredCount: '{{count}} سجل ظاهر',
        invoiceCount: '{{count}} فاتورة',
        invoice: 'الفاتورة',
        date: 'التاريخ',
        subtotal: 'الإجمالي قبل الخصم',
        discount: 'الخصم',
        rate: 'النسبة',
        reason: 'السبب',
        approver: 'المعتمد',
        risk: 'المخاطر',
        flags: 'العلامات',
        unapproved: 'غير معتمد',
        notProvided: 'غير متاح',
        noFlags: 'لا توجد استثناءات',
        noRows: 'لا توجد سجلات خصم مطابقة لهذه الفلاتر.',
        noData: 'لا توجد خصومات مسجلة في هذه الفترة.',
        loadError: 'تعذر تحميل تقرير الخصومات.',
        checkFilters: 'راجع نطاق التاريخ ثم حاول مرة أخرى.',
        csvDownloaded: 'تم تصدير تقرير الخصومات.',
        csvFailed: 'تعذر تصدير CSV.',
        low: 'منخفض',
        medium: 'متوسط',
        high: 'مرتفع',
        critical: 'حرج'
    }
};

const FLAG_KEY_BY_FILTER = {
    highRate: 'HIGH_RATE',
    noApproval: 'NO_APPROVAL',
    noReason: 'NO_REASON',
    fullWaiver: 'FULL_WAIVER'
};

const FLAG_COPY = {
    HIGH_RATE: { en: 'High rate', ar: 'نسبة مرتفعة' },
    NO_REASON: { en: 'No reason', ar: 'بدون سبب' },
    NO_APPROVAL: { en: 'No approval', ar: 'بدون اعتماد' },
    FULL_WAIVER: { en: 'Full waiver', ar: 'إعفاء كامل' }
};

const FLAG_TONES = {
    HIGH_RATE: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200',
    NO_REASON: 'border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900/60 dark:bg-orange-950/30 dark:text-orange-200',
    NO_APPROVAL: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200',
    FULL_WAIVER: 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-200'
};

const scoreForFlags = (flags = []) => Math.min(100, flags.reduce((score, flag) => {
    if (flag === 'FULL_WAIVER') return score + 45;
    if (flag === 'HIGH_RATE') return score + 35;
    if (flag === 'NO_APPROVAL') return score + 30;
    if (flag === 'NO_REASON') return score + 20;
    return score + 10;
}, 0));

const deriveFlags = (row, threshold) => {
    if (Array.isArray(row.flags)) return row.flags;
    const flags = [];
    if (number(row.effective_rate) >= threshold) flags.push('HIGH_RATE');
    if (!row.discount_reason || String(row.discount_reason).trim() === '') flags.push('NO_REASON');
    if (!row.approved_by && !row.discount_approved_by) flags.push('NO_APPROVAL');
    if (number(row.subtotal_amount) > 0 && number(row.discount_amount) >= number(row.subtotal_amount)) flags.push('FULL_WAIVER');
    return flags;
};


const DiscountReports = ({ dateRange: externalDateRange, onDateRangeChange }) => {
    const { i18n } = useTranslation('workspace');
    const language = i18n.language;
    const isArabic = language?.startsWith('ar');
    const text = useMemo(() => COPY[isArabic ? 'ar' : 'en'], [isArabic]);
    const money = useCallback((value) => formatFinancialCurrency(value, language), [language]);
    const date = useCallback((value) => formatFinancialDate(value, language), [language]);
    const flagLabel = useCallback((flag) => FLAG_COPY[flag]?.[isArabic ? 'ar' : 'en'] || flag, [isArabic]);

    const [filters, setFilters] = useState({
        startDate: externalDateRange?.startDate || monthStart(),
        endDate: externalDateRange?.endDate || today(),
        groupBy: 'day',
        review: 'flagged',
        search: '',
        minDiscount: ''
    });

    const effectiveStartDate = externalDateRange?.startDate || filters.startDate;
    const effectiveEndDate = externalDateRange?.endDate || filters.endDate;

    const handleDateChange = (field, value) => {
        const nextRange = { startDate: effectiveStartDate, endDate: effectiveEndDate, [field]: value };
        setFilters((current) => ({ ...current, [field]: value }));
        onDateRangeChange?.(nextRange, 'custom');
    };

    const queryParams = useMemo(() => ({
        startDate: effectiveStartDate,
        endDate: effectiveEndDate,
        groupBy: filters.groupBy
    }), [effectiveStartDate, effectiveEndDate, filters.groupBy]);

    const reportQuery = useGetDiscountReportQuery(queryParams);
    const report = reportQuery.data || {};
    const threshold = number(report.high_rate_threshold || 20);
    const isLoading = reportQuery.isLoading;
    const isFetching = reportQuery.isFetching;

    const items = useMemo(() => (report.items || []).map((row) => {
        const flags = deriveFlags(row, threshold);
        return {
            ...row,
            flags,
            risk_score: scoreForFlags(flags)
        };
    }), [report.items, threshold]);

    const filteredItems = useMemo(() => {
        const query = filters.search.trim().toLowerCase();
        const minDiscount = number(filters.minDiscount);
        return items.filter((item) => {
            if (minDiscount > 0 && number(item.discount_amount) < minDiscount) return false;
            if (filters.review === 'flagged' && item.flags.length === 0) return false;
            if (filters.review === 'cleared' && item.flags.length > 0) return false;
            if (FLAG_KEY_BY_FILTER[filters.review] && !item.flags.includes(FLAG_KEY_BY_FILTER[filters.review])) return false;
            if (!query) return true;
            const searchable = [
                item.invoice_number,
                item.discount_reason,
                item.approved_by,
                ...item.flags.map(flagLabel)
            ].filter(Boolean).join(' ').toLowerCase();
            return searchable.includes(query);
        });
    }, [filters.minDiscount, filters.review, filters.search, flagLabel, items]);

    const summary = useMemo(() => {
        const reportSummary = report.summary || {};
        const flaggedInvoices = items.filter((item) => item.flags.length > 0).length;
        const totalDiscount = items.reduce((sum, item) => sum + number(item.discount_amount), 0);
        const totalSubtotal = items.reduce((sum, item) => sum + number(item.subtotal_amount), 0);
        return {
            discountedInvoices: number(reportSummary.discounted_invoices || items.length),
            flaggedInvoices: number(reportSummary.flagged_invoices || flaggedInvoices),
            totalDiscount: number(reportSummary.total_discount || totalDiscount),
            totalSubtotal: number(reportSummary.total_subtotal || totalSubtotal),
            averageRate: number(reportSummary.average_rate || (totalSubtotal > 0 ? totalDiscount / totalSubtotal * 100 : 0))
        };
    }, [items, report.summary]);

    const exceptionRows = useMemo(() => {
        const rows = ['HIGH_RATE', 'NO_APPROVAL', 'NO_REASON', 'FULL_WAIVER'].map((flag) => {
            const invoices = items.filter((item) => item.flags.includes(flag));
            const discountAmount = invoices.reduce((sum, item) => sum + number(item.discount_amount), 0);
            return {
                flag,
                label: flagLabel(flag),
                invoices: invoices.length,
                discountAmount,
                share: summary.discountedInvoices > 0 ? invoices.length / summary.discountedInvoices * 100 : 0
            };
        });
        return rows.sort((a, b) => b.discountAmount - a.discountAmount);
    }, [flagLabel, items, summary.discountedInvoices]);

    const periodRows = useMemo(() => report.by_period || [], [report.by_period]);
    const maxPeriodDiscount = Math.max(1, ...periodRows.map((row) => number(row.discount_total)));
    const approverRows = useMemo(() => report.by_approver || [], [report.by_approver]);
    const controlScore = summary.discountedInvoices > 0
        ? Math.max(0, Math.round(100 - (summary.flaggedInvoices / summary.discountedInvoices * 100)))
        : 100;
    const highestRiskRows = useMemo(() => [...filteredItems].sort((a, b) => b.risk_score - a.risk_score || number(b.discount_amount) - number(a.discount_amount)), [filteredItems]);

    const setField = (field, value) => setFilters((current) => ({ ...current, [field]: value }));
    const refresh = () => reportQuery.refetch();

    const exportCsv = () => {
        try {
            const headers = ['invoice_number', 'business_date', 'subtotal_amount', 'discount_amount', 'effective_rate', 'fixed_discount_amount', 'percentage_discount_amount', 'discount_reason', 'approved_by', 'flags', 'risk_score'];
            const rows = highestRiskRows.map((item) => ({
                invoice_number: item.invoice_number || '',
                business_date: item.business_date || '',
                subtotal_amount: number(item.subtotal_amount).toFixed(2),
                discount_amount: number(item.discount_amount).toFixed(2),
                effective_rate: number(item.effective_rate).toFixed(2),
                fixed_discount_amount: number(item.fixed_discount_amount).toFixed(2),
                percentage_discount_amount: number(item.percentage_discount_amount).toFixed(2),
                discount_reason: item.discount_reason || '',
                approved_by: item.approved_by || '',
                flags: item.flags.map(flagLabel).join('; '),
                risk_score: item.risk_score
            }));
            const csv = [
                headers.map(csvEscape).join(','),
                ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(','))
            ].join('\r\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `discount-report-${filters.startDate}-to-${filters.endDate}.csv`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error(text.csvFailed, error);
        }
    };

    if (reportQuery.isError) {
        return (
            <section role="alert" className="rounded-2xl border border-rose-200 bg-white p-10 text-center shadow-sm dark:border-rose-900/60 dark:bg-slate-900/70">
                <AlertTriangle className="mx-auto text-rose-500" size={30} />
                <h2 className="mt-3 text-base font-black text-rose-700 dark:text-rose-300">{text.loadError}</h2>
                <p className="mt-1 text-sm font-semibold text-rose-600/80 dark:text-rose-300/80">{text.checkFilters}</p>
            </section>
        );
    }

    return (
        <div className="space-y-4">
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                <div className="flex flex-col gap-4 border-b border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/30 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/25">
                            <BadgePercent size={21} />
                        </span>
                        <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-[.16em] text-amber-700 dark:text-amber-300">{text.eyebrow}</p>
                            <h2 className="mt-1 text-lg font-black text-slate-950 dark:text-white">{text.title}</h2>
                            <p className="mt-1 max-w-3xl text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">{text.description}</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={refresh}
                            disabled={isFetching}
                            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
                            {isFetching ? text.refreshing : text.refresh}
                        </button>
                        <button
                            type="button"
                            onClick={exportCsv}
                            disabled={!highestRiskRows.length}
                            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 text-xs font-black text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                        >
                            <Download size={14} />
                            {language?.startsWith('ar') ? 'تصدير النتائج المفلترة CSV' : 'Export filtered results CSV'}
                        </button>
                    </div>
                </div>

                <div className="grid gap-3 border-b border-slate-100 p-4 dark:border-slate-800 md:grid-cols-2 xl:grid-cols-6">
                    <DateInput label={text.startDate} value={effectiveStartDate} max={effectiveEndDate} onChange={(value) => handleDateChange('startDate', value)} />
                    <DateInput label={text.endDate} value={effectiveEndDate} min={effectiveStartDate} onChange={(value) => handleDateChange('endDate', value)} />
                    <SelectInput label={text.groupBy} value={filters.groupBy} onChange={(value) => setField('groupBy', value)} options={[
                        { value: 'day', label: text.day },
                        { value: 'week', label: text.week },
                        { value: 'month', label: text.month }
                    ]} />
                    <SelectInput label={text.reviewQueue} value={filters.review} onChange={(value) => setField('review', value)} options={[
                        { value: 'all', label: text.all },
                        { value: 'flagged', label: text.flagged },
                        { value: 'highRate', label: text.highRate },
                        { value: 'noApproval', label: text.noApproval },
                        { value: 'noReason', label: text.noReason },
                        { value: 'fullWaiver', label: text.fullWaiver },
                        { value: 'cleared', label: text.cleared }
                    ]} />
                    <SearchInput label={text.search} value={filters.search} onChange={(value) => setField('search', value)} placeholder={text.searchPlaceholder} />
                    <NumberInput label={text.minDiscount} value={filters.minDiscount} onChange={(value) => setField('minDiscount', value)} />
                </div>

                <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
                    <Signal icon={CalendarDays} label={text.discountedInvoices} value={count(summary.discountedInvoices, language)} detail={text.filteredCount.replace('{{count}}', count(filteredItems.length, language))} />
                    <Signal icon={BadgePercent} label={text.totalDiscount} value={money(summary.totalDiscount)} detail={`${text.discountBase}: ${money(summary.totalSubtotal)}`} tone="amber" />
                    <Signal icon={TrendingUp} label={text.averageRate} value={percent(summary.averageRate, language)} detail={text.threshold.replace('{{value}}', percent(threshold, language))} tone={summary.averageRate >= threshold ? 'rose' : 'emerald'} />
                    <Signal icon={ShieldAlert} label={text.exceptions} value={count(summary.flaggedInvoices, language)} detail={text.flaggedShare.replace('{{value}}', percent(summary.discountedInvoices > 0 ? summary.flaggedInvoices / summary.discountedInvoices * 100 : 0, language))} tone={summary.flaggedInvoices > 0 ? 'rose' : 'emerald'} />
                </div>
            </section>

            {isLoading ? (
                <div className="animate-pulse rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm font-bold text-slate-400 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                    {text.refreshing}
                </div>
            ) : items.length === 0 ? (
                <EmptyState icon={CheckCircle2} title={text.noData} />
            ) : (
                <>
                    <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
                        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h3 className="text-sm font-black text-slate-900 dark:text-white">{text.controlScore}</h3>
                                    <p className="mt-1 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">{text.controlScoreText}</p>
                                </div>
                                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${controlScore >= 90 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : controlScore >= 70 ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'}`}>
                                    {controlScore >= 90 ? <ShieldCheck size={18} /> : <ShieldAlert size={18} />}
                                </span>
                            </div>
                            <div className="mt-5">
                                <div className="flex items-end justify-between gap-3">
                                    <span className="font-mono text-4xl font-black text-slate-950 dark:text-white">{count(controlScore, language)}</span>
                                    <span className="pb-1 text-xs font-black text-slate-400">/ 100</span>
                                </div>
                                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                    <div className={`h-full rounded-full ${controlScore >= 90 ? 'bg-emerald-500' : controlScore >= 70 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${controlScore}%` }} />
                                </div>
                            </div>
                            <div className="mt-5 space-y-2">
                                <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400">{text.exceptionProfile}</h4>
                                {exceptionRows.map((row) => (
                                    <ExceptionRow key={row.flag} row={row} money={money} language={language} invoiceCountLabel={text.invoiceCount} />
                                ))}
                            </div>
                        </section>

                        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                            <div className="border-b border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/30">
                                <h3 className="text-sm font-black text-slate-900 dark:text-white">{text.periodTrend}</h3>
                            </div>
                            <div className="space-y-3 p-4">
                                {periodRows.length ? periodRows.map((row) => (
                                    <div key={row.period} className="grid gap-2 sm:grid-cols-[110px_minmax(0,1fr)_140px] sm:items-center">
                                        <span className="text-xs font-black text-slate-600 dark:text-slate-300">{date(row.period)}</span>
                                        <div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                            <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.max(3, number(row.discount_total) / maxPeriodDiscount * 100)}%` }} />
                                        </div>
                                        <span className="text-start font-mono text-xs font-black text-slate-800 dark:text-slate-200 sm:text-end">{money(row.discount_total)}</span>
                                    </div>
                                )) : (
                                    <EmptyState icon={FileWarning} title={text.noRows} compact />
                                )}
                            </div>
                        </section>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
                        <DataPanel
                            title={text.approverReview}
                            empty={text.noRows}
                            columns={[
                                { key: 'approver', label: text.approver },
                                { key: 'invoices', label: text.invoice, align: 'end' },
                                { key: 'discount', label: text.discount, align: 'end' },
                                { key: 'risk', label: text.risk, align: 'end' }
                            ]}
                            rows={approverRows.map((row) => ({
                                approver: row.approver || text.unapproved,
                                invoices: count(row.invoice_count, language),
                                discount: money(row.discount_total),
                                risk: percent(number(row.invoice_count) > 0 ? number(row.flagged_count) / number(row.invoice_count) * 100 : 0, language)
                            }))}
                        />

                        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                            <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/30">
                                <h3 className="truncate text-sm font-black text-slate-900 dark:text-white">{text.invoiceReview}</h3>
                                <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                    {text.filteredCount.replace('{{count}}', count(highestRiskRows.length, language))}
                                </span>
                            </div>
                            <div className="max-h-[620px] overflow-auto">
                                <table className="min-w-full text-start text-xs">
                                    <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                                        <tr>
                                            {[text.invoice, text.date, text.discount, text.rate, text.reason, text.approver, text.flags].map((header) => (
                                                <th key={header} className="px-3 py-2 text-start font-black uppercase tracking-wider">{header}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {highestRiskRows.length ? highestRiskRows.map((row) => (
                                            <tr key={row.invoice_id || row.invoice_number} className="hover:bg-slate-50 dark:hover:bg-slate-800/45">
                                                <td className="px-3 py-3 font-black text-slate-900 dark:text-white" dir="ltr">{row.invoice_number || '-'}</td>
                                                <td className="px-3 py-3 font-semibold whitespace-nowrap text-slate-600 dark:text-slate-300">{date(row.business_date)}</td>
                                                <td className="px-3 py-3 font-mono font-black whitespace-nowrap text-slate-800 dark:text-slate-200">
                                                    <div>{money(row.discount_amount)}</div>
                                                    <div className="text-[10px] font-bold text-slate-400">{text.subtotal}: {money(row.subtotal_amount)}</div>
                                                </td>
                                                <td className="px-3 py-3 font-mono font-black whitespace-nowrap text-slate-800 dark:text-slate-200">{percent(row.effective_rate, language)}</td>
                                                <td className="max-w-[220px] px-3 py-3 font-semibold text-slate-600 dark:text-slate-300">{row.discount_reason || text.notProvided}</td>
                                                <td className="px-3 py-3 font-semibold text-slate-600 dark:text-slate-300">{row.approved_by || text.unapproved}</td>
                                                <td className="px-3 py-3">
                                                    {row.flags.length ? (
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {row.flags.map((flag) => (
                                                                <FlagChip key={`${row.invoice_id}-${flag}`} flag={flag} label={flagLabel(flag)} />
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                                                            <CheckCircle2 size={12} />
                                                            {text.noFlags}
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        )) : (
                                            <tr>
                                                <td colSpan={7} className="px-3 py-8 text-center font-bold text-slate-400">{text.noRows}</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    </div>
                </>
            )}
        </div>
    );
};

const DateInput = ({ label, value, min, max, onChange }) => (
    <label className="block">
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
        <input
            type="date"
            value={value}
            min={min}
            max={max}
            onChange={(event) => onChange(event.target.value)}
            className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:focus:ring-amber-500/20"
        />
    </label>
);

const SelectInput = ({ label, value, onChange, options }) => (
    <label className="block">
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
        <span className="mt-1.5 flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 focus-within:border-amber-400 focus-within:ring-4 focus-within:ring-amber-100 dark:border-slate-800 dark:bg-slate-950 dark:focus-within:ring-amber-500/20">
            <SlidersHorizontal size={14} className="text-slate-400" />
            <select
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm font-bold text-slate-700 outline-none dark:text-slate-200"
            >
                {options.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                ))}
            </select>
        </span>
    </label>
);

const SearchInput = ({ label, value, onChange, placeholder }) => (
    <label className="block">
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
        <span className="mt-1.5 flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 focus-within:border-amber-400 focus-within:ring-4 focus-within:ring-amber-100 dark:border-slate-800 dark:bg-slate-950 dark:focus-within:ring-amber-500/20">
            <Search size={14} className="text-slate-400" />
            <input
                type="search"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
                className="min-w-0 flex-1 bg-transparent text-sm font-bold text-slate-700 outline-none placeholder:text-slate-400 dark:text-slate-200"
            />
        </span>
    </label>
);

const NumberInput = ({ label, value, onChange }) => (
    <label className="block">
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
        <input
            type="number"
            min="0"
            step="0.01"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:focus:ring-amber-500/20"
        />
    </label>
);

const Signal = ({ icon: Icon, label, value, detail, tone = 'slate' }) => {
    const tones = {
        slate: 'border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-800 dark:bg-slate-950/45 dark:text-white',
        amber: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-100',
        emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-100',
        rose: 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/25 dark:text-rose-100'
    };
    return (
        <article className={`rounded-xl border p-3 ${tones[tone]}`}>
            <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-black uppercase tracking-wider opacity-70">{label}</p>
                <Icon size={16} />
            </div>
            <p className="mt-2 truncate font-mono text-lg font-black">{value}</p>
            {detail ? <p className="mt-1 truncate text-[11px] font-bold opacity-70">{detail}</p> : null}
        </article>
    );
};

const ExceptionRow = ({ row, money, language, invoiceCountLabel }) => (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/45">
        <div className="flex items-center justify-between gap-3">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-black ${FLAG_TONES[row.flag] || 'border-slate-200 bg-white text-slate-600'}`}>
                {row.flag === 'NO_APPROVAL' ? <XCircle size={12} /> : <AlertTriangle size={12} />}
                {row.label}
            </span>
            <span className="font-mono text-xs font-black text-slate-700 dark:text-slate-200">{money(row.discountAmount)}</span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 text-[11px] font-bold text-slate-500 dark:text-slate-400">
            <span>{invoiceCountLabel.replace('{{count}}', count(row.invoices, language))}</span>
            <span>{percent(row.share, language)}</span>
        </div>
    </div>
);

const FlagChip = ({ flag, label }) => (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-black ${FLAG_TONES[flag] || 'border-slate-200 bg-slate-50 text-slate-600'}`}>
        {flag === 'NO_APPROVAL' ? <XCircle size={12} /> : <AlertTriangle size={12} />}
        {label}
    </span>
);

const EmptyState = ({ icon: Icon, title, compact = false }) => (
    <div className={`${compact ? 'py-6' : 'rounded-2xl border border-slate-200 bg-white p-10 shadow-sm dark:border-slate-800 dark:bg-slate-900/70'} text-center`}>
        <Icon className="mx-auto text-slate-400" size={compact ? 22 : 30} />
        <p className="mt-2 text-sm font-black text-slate-500 dark:text-slate-400">{title}</p>
    </div>
);

const DataPanel = ({ title, empty, columns, rows }) => (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
        <div className="border-b border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/30">
            <h3 className="truncate text-sm font-black text-slate-900 dark:text-white">{title}</h3>
        </div>
        <div className="max-h-[620px] overflow-auto">
            <table className="min-w-full text-start text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                    <tr>
                        {columns.map((column) => (
                            <th key={column.key} className={`px-3 py-2 font-black uppercase tracking-wider ${column.align === 'end' ? 'text-end' : 'text-start'}`}>
                                {column.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {rows.length ? rows.map((row, index) => (
                        <tr key={`${title}-${index}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/45">
                            {columns.map((column) => (
                                <td key={column.key} className={`px-3 py-3 font-semibold text-slate-700 dark:text-slate-300 ${column.align === 'end' ? 'text-end font-mono' : ''}`}>
                                    {row[column.key]}
                                </td>
                            ))}
                        </tr>
                    )) : (
                        <tr>
                            <td colSpan={columns.length} className="px-3 py-8 text-center font-bold text-slate-400">{empty}</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    </section>
);

export default DiscountReports;
