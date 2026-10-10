import { useCallback, useMemo, useState } from 'react';
import {
    AlertTriangle,
    BookOpen,
    CheckCircle2,
    Download,
    Filter,
    RefreshCw,
    Scale,
    Search,
    SlidersHorizontal,
    WalletCards
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
    useGetJournalLedgerQuery,
    useGetTrialBalanceQuery
} from '../../store/api';
import { formatFinancialCurrency, formatFinancialDate, toFinancialDateInput } from '../../utils/financialFormat';
import Pagination from '../ui/Pagination';
import { escapeFinancialCsvValue as csvEscape } from '../../utils/financialCsv';

const monthStart = () => toFinancialDateInput(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
const today = () => toFinancialDateInput();
const number = (value) => Number(value || 0);
const localeFor = (language = 'en') => language?.startsWith('ar') ? 'ar-EG' : 'en-US';
const count = (value, language = 'en') => new Intl.NumberFormat(localeFor(language)).format(number(value));

const COPY = {
    en: {
        eyebrow: 'General ledger',
        title: 'Journal review and trial balance',
        description: 'Review posted accounting activity by period, account, source, and posting reference.',
        refresh: 'Refresh',
        refreshing: 'Refreshing...',
        exportCsv: 'Export CSV',
        startDate: 'Start date',
        endDate: 'End date',
        accountCode: 'Account code',
        accountPlaceholder: '1100',
        source: 'Source',
        sourceId: 'Source ID',
        sourceIdPlaceholder: 'Optional UUID',
        pageSize: 'Rows',
        allSources: 'All sources',
        invoice: 'Invoices',
        payment: 'Payments',
        refund: 'Refunds',
        expense: 'Expenses',
        expenseReversal: 'Expense reversals',
        commissionPayment: 'Commission payments',
        claimReceipt: 'Claim receipts',
        invoiceAdjustment: 'Invoice adjustments',
        payrollPayment: 'Payroll payments',
        totalDebit: 'Total debit',
        totalCredit: 'Total credit',
        balanceStatus: 'Balance status',
        visibleDebit: 'Visible debit',
        visibleCredit: 'Visible credit',
        balanced: 'Balanced',
        outOfBalance: 'Out of balance',
        trialBalance: 'Trial balance',
        journalLines: 'Journal lines',
        account: 'Account',
        debit: 'Debit',
        credit: 'Credit',
        net: 'Net',
        date: 'Date',
        posted: 'Posted',
        reference: 'Reference',
        descriptionColumn: 'Description',
        visibleSources: 'Visible sources: {{sources}}',
        noTrialRows: 'No account activity for this period.',
        noJournalRows: 'No journal lines match these filters.',
        loading: 'Loading ledger...',
        loadError: 'Ledger could not be loaded',
        checkFilters: 'Check the report filters and try again.',
        showingRows: '{{shown}} of {{total}} lines',
        pageRange: '{{start}}-{{end}} of {{total}}',
        previous: 'Previous',
        next: 'Next',
        notAvailable: 'Not available',
        noDescription: 'No description'
    },
    ar: {
        eyebrow: 'دفتر الأستاذ العام',
        title: 'مراجعة القيود وميزان المراجعة',
        description: 'راجع الحركة المحاسبية المرحلة حسب الفترة والحساب والمصدر والمرجع.',
        refresh: 'تحديث',
        refreshing: 'جار التحديث...',
        exportCsv: 'تصدير CSV',
        startDate: 'تاريخ البداية',
        endDate: 'تاريخ النهاية',
        accountCode: 'كود الحساب',
        accountPlaceholder: '1100',
        source: 'المصدر',
        sourceId: 'معرف المصدر',
        sourceIdPlaceholder: 'UUID اختياري',
        pageSize: 'عدد الصفوف',
        allSources: 'كل المصادر',
        invoice: 'الفواتير',
        payment: 'المدفوعات',
        refund: 'المردودات',
        expense: 'المصروفات',
        expenseReversal: 'عكس المصروفات',
        commissionPayment: 'مدفوعات العمولات',
        claimReceipt: 'تحصيلات المطالبات',
        invoiceAdjustment: 'تسويات الفواتير',
        payrollPayment: 'مدفوعات الرواتب',
        totalDebit: 'إجمالي المدين',
        totalCredit: 'إجمالي الدائن',
        balanceStatus: 'حالة التوازن',
        visibleDebit: 'مدين ظاهر',
        visibleCredit: 'دائن ظاهر',
        balanced: 'متوازن',
        outOfBalance: 'غير متوازن',
        trialBalance: 'ميزان المراجعة',
        journalLines: 'قيود اليومية',
        account: 'الحساب',
        debit: 'مدين',
        credit: 'دائن',
        net: 'الصافي',
        date: 'التاريخ',
        posted: 'تاريخ الترحيل',
        reference: 'المرجع',
        descriptionColumn: 'الوصف',
        visibleSources: 'المصادر الظاهرة: {{sources}}',
        noTrialRows: 'لا توجد حركة حسابات في هذه الفترة.',
        noJournalRows: 'لا توجد قيود مطابقة لهذه الفلاتر.',
        loading: 'جار تحميل دفتر الأستاذ...',
        loadError: 'تعذر تحميل دفتر الأستاذ',
        checkFilters: 'راجع فلاتر التقرير ثم حاول مرة أخرى.',
        showingRows: '{{shown}} من {{total}} قيد',
        pageRange: '{{start}}-{{end}} من {{total}}',
        previous: 'السابق',
        next: 'التالي',
        notAvailable: 'غير متاح',
        noDescription: 'لا يوجد وصف'
    }
};

const SOURCE_OPTIONS = [
    { value: 'all', mode: 'all', en: 'All sources', ar: 'كل المصادر' },
    { value: 'Invoice', mode: 'exact', en: 'Invoices', ar: 'الفواتير' },
    { value: 'InvoiceAdjustment:', mode: 'prefix', en: 'Invoice adjustments', ar: 'تسويات الفواتير' },
    { value: 'Payment', mode: 'exact', en: 'Payments', ar: 'المدفوعات' },
    { value: 'Refund', mode: 'exact', en: 'Refunds', ar: 'المردودات' },
    { value: 'Expense', mode: 'exact', en: 'Expenses', ar: 'المصروفات' },
    { value: 'ExpenseReversal', mode: 'exact', en: 'Expense reversals', ar: 'عكس المصروفات' },
    { value: 'CommissionPayment', mode: 'exact', en: 'Commission payments', ar: 'مدفوعات العمولات' },
    { value: 'ClaimReceipt', mode: 'exact', en: 'Claim receipts', ar: 'تحصيلات المطالبات' },
    { value: 'PayrollPayment', mode: 'exact', en: 'Payroll payments', ar: 'مدفوعات الرواتب' }
];

const PAGE_SIZE_OPTIONS = [50, 100, 150, 250, 500];


const GeneralLedger = ({ dateRange: externalDateRange, onDateRangeChange }) => {
    const { i18n } = useTranslation('workspace');
    const language = i18n.language;
    const isArabic = language?.startsWith('ar');
    const text = useMemo(() => COPY[isArabic ? 'ar' : 'en'], [isArabic]);
    const money = useCallback((value) => formatFinancialCurrency(value, language), [language]);
    const date = useCallback((value) => formatFinancialDate(value, language), [language]);

    const [filters, setFilters] = useState({
        startDate: externalDateRange?.startDate || monthStart(),
        endDate: externalDateRange?.endDate || today(),
        accountCode: '',
        sourceFilter: 'all',
        sourceId: '',
        limit: 150,
        offset: 0
    });

    const effectiveStartDate = externalDateRange?.startDate || filters.startDate;
    const effectiveEndDate = externalDateRange?.endDate || filters.endDate;

    const handleDateChange = (field, value) => {
        const nextRange = { startDate: effectiveStartDate, endDate: effectiveEndDate, [field]: value };
        setFilters((current) => ({ ...current, [field]: value, offset: 0 }));
        onDateRangeChange?.(nextRange, 'custom');
    };

    const selectedSource = useMemo(
        () => SOURCE_OPTIONS.find((option) => option.value === filters.sourceFilter) || SOURCE_OPTIONS[0],
        [filters.sourceFilter]
    );

    const queryParams = useMemo(() => ({
        startDate: effectiveStartDate,
        endDate: effectiveEndDate,
        accountCode: filters.accountCode.trim().toUpperCase() || undefined,
        sourceType: selectedSource.mode === 'exact' ? selectedSource.value : undefined,
        sourceTypePrefix: selectedSource.mode === 'prefix' ? selectedSource.value : undefined,
        sourceId: filters.sourceId.trim() || undefined,
        limit: filters.limit,
        offset: filters.offset
    }), [effectiveStartDate, effectiveEndDate, filters.accountCode, filters.limit, filters.offset, filters.sourceId, selectedSource.mode, selectedSource.value]);

    const trialBalanceQuery = useGetTrialBalanceQuery({
        startDate: effectiveStartDate,
        endDate: effectiveEndDate
    });
    const ledgerQuery = useGetJournalLedgerQuery(queryParams);

    const trial = trialBalanceQuery.data || {};
    const ledger = ledgerQuery.data || {};
    const trialRows = useMemo(() => trial.rows || [], [trial.rows]);
    const ledgerRows = useMemo(() => ledger.rows || [], [ledger.rows]);
    const totalCount = number(ledger.total_count || ledgerRows.length);
    const isLoading = trialBalanceQuery.isLoading || ledgerQuery.isLoading;
    const isFetching = trialBalanceQuery.isFetching || ledgerQuery.isFetching;
    const isError = trialBalanceQuery.isError || ledgerQuery.isError;
    const balanceKnown = typeof trial.is_balanced === 'boolean';

    const visibleTotals = useMemo(() => ledgerRows.reduce((acc, row) => ({
        debit: acc.debit + number(row.debit),
        credit: acc.credit + number(row.credit)
    }), { debit: 0, credit: 0 }), [ledgerRows]);

    const sourceTypes = useMemo(() => {
        const values = new Set(ledgerRows.map((row) => row.source_type).filter(Boolean));
        return Array.from(values).sort();
    }, [ledgerRows]);

    const setField = (field, value, resetPaging = true) => {
        setFilters((current) => ({
            ...current,
            [field]: value,
            offset: resetPaging ? 0 : current.offset
        }));
    };
    const refresh = () => {
        trialBalanceQuery.refetch();
        ledgerQuery.refetch();
    };
    const pageStart = totalCount > 0 ? filters.offset + 1 : 0;
    const pageEnd = Math.min(filters.offset + filters.limit, totalCount);
    const currentPage = Math.floor(filters.offset / filters.limit) + 1;
    const pageCount = Math.max(1, Math.ceil(totalCount / filters.limit));

    const exportCsv = () => {
        const headers = ['business_date', 'posted_at', 'source_type', 'source_id', 'account_code', 'account_name', 'description', 'debit', 'credit'];
        const csvRows = ledgerRows.map((row) => ({
            business_date: row.business_date || '',
            posted_at: row.posted_at || '',
            source_type: row.source_type || '',
            source_id: row.source_id || '',
            account_code: row.account_code || '',
            account_name: row.account_name || '',
            description: row.description || '',
            debit: number(row.debit).toFixed(2),
            credit: number(row.credit).toFixed(2)
        }));
        const csv = [
            headers.map(csvEscape).join(','),
            ...csvRows.map((row) => headers.map((header) => csvEscape(row[header])).join(','))
        ].join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `general-ledger-${filters.startDate}-to-${filters.endDate}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    };

    if (isError) {
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
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-950">
                            <BookOpen size={20} />
                        </span>
                        <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-[.16em] text-cyan-700 dark:text-cyan-300">{text.eyebrow}</p>
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
                            disabled={!ledgerRows.length}
                            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 text-xs font-black text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                        >
                            <Download size={14} />
                            {language?.startsWith('ar') ? 'تصدير الصفحة الحالية CSV' : 'Export current page CSV'}
                        </button>
                    </div>
                </div>

                <div className="grid gap-3 border-b border-slate-100 p-4 dark:border-slate-800 md:grid-cols-2 xl:grid-cols-6">
                    <DateInput label={text.startDate} value={effectiveStartDate} max={effectiveEndDate} onChange={(value) => handleDateChange('startDate', value)} />
                    <DateInput label={text.endDate} value={effectiveEndDate} min={effectiveStartDate} onChange={(value) => handleDateChange('endDate', value)} />
                    <TextInput icon={Search} label={text.accountCode} value={filters.accountCode} onChange={(value) => setField('accountCode', value)} placeholder={text.accountPlaceholder} dir="ltr" />
                    <SelectInput
                        label={text.source}
                        value={filters.sourceFilter}
                        onChange={(value) => setField('sourceFilter', value)}
                        options={SOURCE_OPTIONS.map((option) => ({ value: option.value, label: option[isArabic ? 'ar' : 'en'] }))}
                    />
                    <TextInput icon={Filter} label={text.sourceId} value={filters.sourceId} onChange={(value) => setField('sourceId', value)} placeholder={text.sourceIdPlaceholder} dir="ltr" />
                    <SelectInput
                        label={text.pageSize}
                        value={String(filters.limit)}
                        onChange={(value) => setField('limit', Number(value))}
                        options={PAGE_SIZE_OPTIONS.map((size) => ({ value: String(size), label: count(size, language) }))}
                    />
                </div>

                <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-5">
                    <Signal icon={Scale} label={text.totalDebit} value={money(trial.total_debit)} />
                    <Signal icon={Scale} label={text.totalCredit} value={money(trial.total_credit)} />
                    <Signal
                        icon={balanceKnown && trial.is_balanced ? CheckCircle2 : AlertTriangle}
                        label={text.balanceStatus}
                        value={balanceKnown ? (trial.is_balanced ? text.balanced : text.outOfBalance) : text.notAvailable}
                        detail={balanceKnown && !trial.is_balanced ? money(trial.difference) : undefined}
                        tone={balanceKnown && trial.is_balanced ? 'emerald' : balanceKnown ? 'rose' : 'slate'}
                    />
                    <Signal icon={WalletCards} label={text.visibleDebit} value={money(visibleTotals.debit)} detail={text.showingRows.replace('{{shown}}', count(ledgerRows.length, language)).replace('{{total}}', count(totalCount, language))} />
                    <Signal icon={WalletCards} label={text.visibleCredit} value={money(visibleTotals.credit)} />
                </div>
            </section>

            {isLoading ? (
                <div className="animate-pulse rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm font-bold text-slate-400 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                    {text.loading}
                </div>
            ) : (
                <div className="grid gap-4 xl:grid-cols-[440px_minmax(0,1fr)]">
                    <DataPanel
                        title={text.trialBalance}
                        empty={text.noTrialRows}
                        columns={[
                            { key: 'account', label: text.account },
                            { key: 'debit', label: text.debit, align: 'end' },
                            { key: 'credit', label: text.credit, align: 'end' },
                            { key: 'net', label: text.net, align: 'end' }
                        ]}
                        rows={trialRows.map((row) => ({
                            account: <AccountCell code={row.account_code} name={row.account_name} />,
                            debit: money(row.debit),
                            credit: money(row.credit),
                            net: money(row.net_balance)
                        }))}
                    />
                    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                        <div className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/30 sm:flex-row sm:items-center sm:justify-between">
                            <h3 className="truncate text-sm font-black text-slate-900 dark:text-white">{text.journalLines}</h3>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                    {text.pageRange.replace('{{start}}', count(pageStart, language)).replace('{{end}}', count(pageEnd, language)).replace('{{total}}', count(totalCount, language))}
                                </span>
                                <Pagination
                                    currentPage={currentPage}
                                    pageCount={pageCount}
                                    onPageChange={(nextPage) => setField('offset', (nextPage - 1) * filters.limit, false)}
                                    isRtl={isArabic}
                                    previousLabel={text.previous}
                                    nextLabel={text.next}
                                    compact
                                />
                            </div>
                        </div>
                        <div className="max-h-[620px] overflow-auto">
                            <table className="min-w-[980px] text-start text-xs">
                                <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                                    <tr>
                                        {[text.date, text.source, text.account, text.descriptionColumn, text.debit, text.credit, text.posted].map((header, index) => (
                                            <th key={`${header}-${index}`} className={`px-3 py-2 font-black uppercase tracking-wider ${index >= 4 ? 'text-end' : 'text-start'}`}>{header}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {ledgerRows.length ? ledgerRows.map((row) => (
                                        <tr key={row.entry_id || `${row.batch_id}-${row.account_code}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/45">
                                            <td className="px-3 py-3 font-semibold text-slate-600 dark:text-slate-300">{date(row.business_date)}</td>
                                            <td className="px-3 py-3">
                                                <div className="font-black text-slate-900 dark:text-white" dir="ltr">{row.source_type || '-'}</div>
                                                <div className="mt-0.5 max-w-[160px] truncate text-[10px] font-semibold text-slate-400" dir="ltr">{row.source_id || text.notAvailable}</div>
                                            </td>
                                            <td className="px-3 py-3"><AccountCell code={row.account_code} name={row.account_name} /></td>
                                            <td className="max-w-[260px] px-3 py-3 font-semibold text-slate-600 dark:text-slate-300">{row.description || text.noDescription}</td>
                                            <td className="px-3 py-3 text-end font-mono font-black text-slate-800 dark:text-slate-200">{number(row.debit) > 0 ? money(row.debit) : '-'}</td>
                                            <td className="px-3 py-3 text-end font-mono font-black text-slate-800 dark:text-slate-200">{number(row.credit) > 0 ? money(row.credit) : '-'}</td>
                                            <td className="px-3 py-3 text-end font-semibold text-slate-500 dark:text-slate-400">{row.posted_at ? date(row.posted_at) : '-'}</td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={7} className="px-3 py-8 text-center font-bold text-slate-400">{text.noJournalRows}</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </div>
            )}

            {sourceTypes.length ? (
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {text.visibleSources.replace('{{sources}}', sourceTypes.join(', '))}
                </p>
            ) : null}
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
            className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:focus:ring-cyan-500/20"
        />
    </label>
);

const TextInput = ({ icon: Icon, label, value, onChange, placeholder, dir }) => (
    <label className="block">
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
        <span className="mt-1.5 flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 focus-within:border-cyan-400 focus-within:ring-4 focus-within:ring-cyan-100 dark:border-slate-800 dark:bg-slate-950 dark:focus-within:ring-cyan-500/20">
            <Icon size={14} className="text-slate-400" />
            <input
                type="text"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
                dir={dir}
                className="min-w-0 flex-1 bg-transparent text-sm font-bold text-slate-700 outline-none placeholder:text-slate-400 dark:text-slate-200"
            />
        </span>
    </label>
);

const SelectInput = ({ label, value, onChange, options }) => (
    <label className="block">
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
        <span className="mt-1.5 flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 focus-within:border-cyan-400 focus-within:ring-4 focus-within:ring-cyan-100 dark:border-slate-800 dark:bg-slate-950 dark:focus-within:ring-cyan-500/20">
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

const AccountCell = ({ code, name }) => (
    <div className="min-w-0">
        <div className="font-mono text-xs font-black text-slate-900 dark:text-white" dir="ltr">{code || '-'}</div>
        <div className="mt-0.5 truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">{name || '-'}</div>
    </div>
);

const Signal = ({ icon: Icon, label, value, detail, tone = 'slate' }) => {
    const tones = {
        slate: 'border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-800 dark:bg-slate-950/45 dark:text-white',
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

export default GeneralLedger;
