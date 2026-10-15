import React, { useMemo, useState } from 'react';
import {
    Activity,
    AlertCircle,
    ArrowDownRight,
    ArrowUpRight,
    Building2,
    Calendar,
    CheckCircle2,
    CircleDollarSign,
    Clock,
    Download,
    FileSpreadsheet,
    FileText,
    Filter,
    Layers,
    PieChart,
    Printer,
    RefreshCw,
    ShieldAlert,
    TrendingUp,
    WalletCards
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import {
    useGetContractsPerformanceReportQuery,
    useGetInsuranceAgingReportQuery,
    useGetInsuranceClaimsSummaryQuery,
    useGetInsuranceProvidersQuery,
    useGetPayerStatementQuery
} from '../../store/api';
import { downloadAuthenticatedFile } from '../../utils/authenticatedFetch';
import { getErrorMessage } from '../../utils/getErrorMessage';

const toNumber = (val) => (Number.isFinite(Number(val)) ? Number(val) : 0);

const formatMoney = (val, locale = 'ar-EG') =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(toNumber(val));

const formatNum = (val, locale = 'ar-EG') =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(toNumber(val));

export default function InsuranceReportsWorkbench() {
    const { t, i18n } = useTranslation('insurance');
    const isAr = i18n.language === 'ar';
    const locale = isAr ? 'ar-EG' : 'en-US';

    const [activeReport, setActiveReport] = useState('statement'); // 'statement' | 'summary' | 'aging' | 'contracts'
    const [selectedProviderId, setSelectedProviderId] = useState('');
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setDate(1);
        return d.toISOString().slice(0, 10);
    });
    const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [isExporting, setIsExporting] = useState(false);

    // Providers query for dropdown
    const { data: providers = [], isLoading: providersLoading } = useGetInsuranceProvidersQuery();

    // Auto-select first active provider if none selected
    React.useEffect(() => {
        if (!selectedProviderId && providers.length > 0) {
            const first = providers.find((p) => p.is_active) || providers[0];
            if (first) setSelectedProviderId(first.provider_id);
        }
    }, [providers, selectedProviderId]);

    // Queries
    const {
        data: statementData,
        isLoading: statementLoading,
        isFetching: statementFetching,
        refetch: refetchStatement
    } = useGetPayerStatementQuery(
        { providerId: selectedProviderId, startDate, endDate },
        { skip: !selectedProviderId || activeReport !== 'statement' }
    );

    const {
        data: summaryData,
        isLoading: summaryLoading,
        isFetching: summaryFetching,
        refetch: refetchSummary
    } = useGetInsuranceClaimsSummaryQuery(
        { providerId: selectedProviderId || undefined, startDate, endDate },
        { skip: activeReport !== 'summary' }
    );

    const {
        data: agingData,
        isLoading: agingLoading,
        isFetching: agingFetching,
        refetch: refetchAging
    } = useGetInsuranceAgingReportQuery(
        { asOfDate: endDate },
        { skip: activeReport !== 'aging' }
    );

    const {
        data: contractsData,
        isLoading: contractsLoading,
        isFetching: contractsFetching,
        refetch: refetchContracts
    } = useGetContractsPerformanceReportQuery(
        { startDate, endDate },
        { skip: activeReport !== 'contracts' }
    );

    const handleExportCsv = async () => {
        try {
            setIsExporting(true);
            const dateStr = new Date().toISOString().slice(0, 10);
            let url = '';
            let filename = '';

            if (activeReport === 'statement') {
                if (!selectedProviderId) return;
                const found = providers.find((p) => String(p.provider_id) === String(selectedProviderId));
                const safeName = (found?.name || 'payer').replace(/[^a-zA-Z0-9_\u0600-\u06FF]/g, '_');
                url = `/api/insurance/reports/statement?providerId=${selectedProviderId}&startDate=${startDate}&endDate=${endDate}&format=csv`;
                filename = `statement-of-account-${safeName}-${dateStr}.csv`;
            } else if (activeReport === 'summary') {
                const provParam = selectedProviderId ? `&providerId=${selectedProviderId}` : '';
                url = `/api/insurance/reports/claims-summary?startDate=${startDate}&endDate=${endDate}${provParam}&format=csv`;
                filename = `insurance-claims-summary-${dateStr}.csv`;
            } else if (activeReport === 'aging') {
                url = `/api/insurance/reports/aging?asOfDate=${endDate}&format=csv`;
                filename = `insurance-aging-${dateStr}.csv`;
            } else if (activeReport === 'contracts') {
                url = `/api/insurance/reports/contracts-performance?startDate=${startDate}&endDate=${endDate}&format=csv`;
                filename = `contracts-performance-${dateStr}.csv`;
            }

            await downloadAuthenticatedFile(url, filename);
            toast.success(t('messages.exportSuccess', 'Report exported successfully.'));
        } catch (err) {
            toast.error(getErrorMessage(err, t('messages.exportFailed', 'Failed to export report.')));
        } finally {
            setIsExporting(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    const isCurrentLoading =
        (activeReport === 'statement' && (statementLoading || statementFetching)) ||
        (activeReport === 'summary' && (summaryLoading || summaryFetching)) ||
        (activeReport === 'aging' && (agingLoading || agingFetching)) ||
        (activeReport === 'contracts' && (contractsLoading || contractsFetching));

    return (
        <section className="space-y-6">
            {/* Top Toolbar / Filters Bar */}
            <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-xs backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    {/* Report Types Pills */}
                    <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-slate-100/80 p-1 dark:bg-slate-950/60">
                        <button
                            type="button"
                            onClick={() => setActiveReport('statement')}
                            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-bold transition-all ${
                                activeReport === 'statement'
                                    ? 'bg-teal-700 text-white shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                            }`}
                        >
                            <FileText size={15} />
                            <span>{t('reports.statementOfAccount', 'Statement of Account (كشف حساب الجهة)')}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveReport('summary')}
                            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-bold transition-all ${
                                activeReport === 'summary'
                                    ? 'bg-teal-700 text-white shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                            }`}
                        >
                            <PieChart size={15} />
                            <span>{t('reports.claimsSummary', 'Claims Performance (تحليل المطالبات والتحصيل)')}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveReport('aging')}
                            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-bold transition-all ${
                                activeReport === 'aging'
                                    ? 'bg-teal-700 text-white shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                            }`}
                        >
                            <Clock size={15} />
                            <span>{t('reports.receivablesAging', 'Insurance Aging (تعمير الذمم التأمينية)')}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveReport('contracts')}
                            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-bold transition-all ${
                                activeReport === 'contracts'
                                    ? 'bg-teal-700 text-white shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                            }`}
                        >
                            <Layers size={15} />
                            <span>{t('reports.contractsPerformance', 'Contracts Utilization (أداء وإنتاجية العقود)')}</span>
                        </button>
                    </div>

                    {/* Action Buttons: Export & Refresh */}
                    <div className="flex items-center gap-2 self-end lg:self-auto">
                        <button
                            type="button"
                            onClick={handleExportCsv}
                            disabled={isExporting || isCurrentLoading}
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-emerald-200/80 bg-emerald-50 px-3.5 text-xs font-bold text-emerald-800 shadow-xs transition hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300"
                        >
                            <FileSpreadsheet size={15} className="text-emerald-600 dark:text-emerald-400" />
                            <span>{isExporting ? t('actions.exporting', 'Exporting...') : t('actions.exportCsv', 'Export Excel/CSV')}</span>
                        </button>
                        <button
                            type="button"
                            onClick={handlePrint}
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                        >
                            <Printer size={15} className="text-slate-500" />
                            <span>{t('actions.print', 'Print')}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                if (activeReport === 'statement') refetchStatement();
                                if (activeReport === 'summary') refetchSummary();
                                if (activeReport === 'aging') refetchAging();
                                if (activeReport === 'contracts') refetchContracts();
                            }}
                            disabled={isCurrentLoading}
                            className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                        >
                            <RefreshCw size={14} className={isCurrentLoading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>

                {/* Filter Controls Bar */}
                <div className="mt-4 grid gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 sm:grid-cols-2 md:grid-cols-4">
                    {/* Provider Select (shown on statement, summary, or contracts) */}
                    {(activeReport === 'statement' || activeReport === 'summary') && (
                        <div>
                            <label className="mb-1 block text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                {t('fields.provider', 'Insurance Provider / Company')}
                            </label>
                            <select
                                value={selectedProviderId}
                                onChange={(e) => setSelectedProviderId(e.target.value)}
                                className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                            >
                                {activeReport === 'summary' && <option value="">{t('common.allProviders', 'All Providers (جميع الشركات)')}</option>}
                                {providers.map((p) => (
                                    <option key={p.provider_id} value={p.provider_id}>
                                        {p.name} {p.payer_code ? `(${p.payer_code})` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Start Date */}
                    {activeReport !== 'aging' && (
                        <div>
                            <label className="mb-1 block text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                {t('fields.startDate', 'Start Date')}
                            </label>
                            <div className="relative">
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                                />
                            </div>
                        </div>
                    )}

                    {/* End Date / As of Date */}
                    <div>
                        <label className="mb-1 block text-[11px] font-bold text-slate-500 dark:text-slate-400">
                            {activeReport === 'aging' ? t('fields.asOfDate', 'As Of Date (حتى تاريخ)') : t('fields.endDate', 'End Date')}
                        </label>
                        <div className="relative">
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* REPORT VIEW 1: STATEMENT OF ACCOUNT */}
            {activeReport === 'statement' && (
                <div className="space-y-4">
                    {statementLoading ? (
                        <div className="space-y-3">
                            {[0, 1, 2].map((i) => (
                                <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800/50" />
                            ))}
                        </div>
                    ) : !statementData ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-500 dark:border-slate-800">
                            {t('empty.noData', 'Select an insurance provider to view statement of account.')}
                        </div>
                    ) : (
                        <>
                            {/* Summary Metrics Cards */}
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                                    <div className="flex items-center justify-between text-slate-500">
                                        <span className="text-[11px] font-bold">{t('reports.openingBalance', 'Opening Balance (الرصيد الافتتاحي)')}</span>
                                        <Clock size={16} className="text-slate-400" />
                                    </div>
                                    <p className="mt-2 text-lg font-black text-slate-900 dark:text-white">
                                        {formatMoney(statementData.opening_balance, locale)}
                                    </p>
                                    <p className="mt-0.5 text-[10px] text-slate-400">{t('reports.beforeDate', { date: startDate })}</p>
                                </div>

                                <div className="rounded-2xl border border-cyan-100 bg-cyan-50/50 p-4 shadow-xs dark:border-cyan-900/50 dark:bg-cyan-950/20">
                                    <div className="flex items-center justify-between text-cyan-700 dark:text-cyan-300">
                                        <span className="text-[11px] font-bold">{t('reports.periodClaims', 'New Claims (مطالبات الفترة)')}</span>
                                        <ArrowUpRight size={16} className="text-cyan-600" />
                                    </div>
                                    <p className="mt-2 text-lg font-black text-cyan-900 dark:text-cyan-200">
                                        +{formatMoney(statementData.period_claims_total, locale)}
                                    </p>
                                    <p className="mt-0.5 text-[10px] text-cyan-600 dark:text-cyan-400">{t('reports.billedAmount', 'Total Invoiced')}</p>
                                </div>

                                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 shadow-xs dark:border-emerald-900/50 dark:bg-emerald-950/20">
                                    <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-300">
                                        <span className="text-[11px] font-bold">{t('reports.periodReceipts', 'Remittances (المحصل والمورد)')}</span>
                                        <ArrowDownRight size={16} className="text-emerald-600" />
                                    </div>
                                    <p className="mt-2 text-lg font-black text-emerald-900 dark:text-emerald-200">
                                        -{formatMoney(statementData.period_receipts_total, locale)}
                                    </p>
                                    <p className="mt-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">{t('reports.bankSettlement', 'Collected & Remitted')}</p>
                                </div>

                                <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4 shadow-xs dark:border-amber-900/50 dark:bg-amber-950/20">
                                    <div className="flex items-center justify-between text-amber-700 dark:text-amber-300">
                                        <span className="text-[11px] font-bold">{t('reports.periodDeductions', 'Contractual Deductions (الاستقطاعات)')}</span>
                                        <ShieldAlert size={16} className="text-amber-600" />
                                    </div>
                                    <p className="mt-2 text-lg font-black text-amber-900 dark:text-amber-200">
                                        -{formatMoney(statementData.period_deductions_total, locale)}
                                    </p>
                                    <p className="mt-0.5 text-[10px] text-amber-600 dark:text-amber-400">{t('reports.discountsApplied', 'Agreed Reductions')}</p>
                                </div>

                                <div className="rounded-2xl border border-teal-200 bg-teal-50/70 p-4 shadow-xs dark:border-teal-900/50 dark:bg-teal-950/40">
                                    <div className="flex items-center justify-between text-teal-800 dark:text-teal-300">
                                        <span className="text-[11px] font-black">{t('reports.closingBalance', 'Net Due Balance (الرصيد المستحق)')}</span>
                                        <CircleDollarSign size={16} className="text-teal-600" />
                                    </div>
                                    <p className="mt-2 text-xl font-black text-teal-950 dark:text-teal-100">
                                        {formatMoney(statementData.closing_balance, locale)}
                                    </p>
                                    <p className="mt-0.5 text-[10px] text-teal-700 dark:text-teal-400">{t('reports.asOfDate', { date: endDate })}</p>
                                </div>
                            </div>

                            {/* Itemized Transactions Table */}
                            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
                                <div className="flex items-center justify-between border-b border-slate-100 p-4 dark:border-slate-800">
                                    <div>
                                        <h3 className="text-sm font-black text-slate-900 dark:text-white">
                                            {t('reports.statementLedger', 'Payer Transaction Ledger (كشف الحركات التفصيلي)')}
                                        </h3>
                                        <p className="mt-0.5 text-xs text-slate-500">
                                            {statementData.provider.name} | {statementData.items_count} {t('reports.claimsFound', 'transactions')}
                                        </p>
                                    </div>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs">
                                        <thead className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-bold text-slate-500 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
                                            <tr>
                                                <th className="px-4 py-3">{t('table.date', 'Date')}</th>
                                                <th className="px-4 py-3">{t('table.claimNumber', 'Claim #')}</th>
                                                <th className="px-4 py-3">{t('table.patient', 'Patient / MRN')}</th>
                                                <th className="px-4 py-3">{t('table.status', 'Status')}</th>
                                                <th className="px-4 py-3 text-right">{t('table.expected', 'Claim Amount (Debit)')}</th>
                                                <th className="px-4 py-3 text-right">{t('table.received', 'Paid (Credit)')}</th>
                                                <th className="px-4 py-3 text-right">{t('table.deduction', 'Deduction')}</th>
                                                <th className="px-4 py-3 text-right">{t('table.balance', 'Running Balance')}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                                            {statementData.transactions.length === 0 ? (
                                                <tr>
                                                    <td colSpan={8} className="py-8 text-center text-slate-400">
                                                        {t('empty.noTransactions', 'No claim transactions recorded in this period.')}
                                                    </td>
                                                </tr>
                                            ) : (
                                                statementData.transactions.map((tRow) => (
                                                    <tr key={tRow.claim_id} className="transition hover:bg-slate-50/60 dark:hover:bg-slate-850/50">
                                                        <td className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">{tRow.date}</td>
                                                        <td className="px-4 py-3 font-mono font-bold text-slate-900 dark:text-white">
                                                            {tRow.claim_number}
                                                            {tRow.claim_reference_number && (
                                                                <span className="block font-sans text-[10px] text-slate-400">
                                                                    Ref: {tRow.claim_reference_number}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="font-bold text-slate-800 dark:text-slate-200">{tRow.patient_name}</div>
                                                            <div className="text-[10px] font-mono text-slate-400">{tRow.patient_mrn}</div>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span
                                                                className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                                                    tRow.status === 'Paid'
                                                                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                                                        : tRow.status === 'Partially Paid'
                                                                        ? 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300'
                                                                        : tRow.status === 'Rejected'
                                                                        ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                                                                        : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                                                                }`}
                                                            >
                                                                {tRow.status}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white">
                                                            {formatMoney(tRow.expected_amount, locale)}
                                                        </td>
                                                        <td className="px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                                                            {tRow.received_amount > 0 ? `-${formatMoney(tRow.received_amount, locale)}` : '—'}
                                                        </td>
                                                        <td className="px-4 py-3 text-right text-amber-600 dark:text-amber-400">
                                                            {tRow.deduction_amount > 0 ? (
                                                                <div>
                                                                    <span className="font-bold">-{formatMoney(tRow.deduction_amount, locale)}</span>
                                                                    {tRow.deduction_reason && (
                                                                        <span className="block text-[10px] text-slate-400 truncate max-w-[120px] ml-auto">
                                                                            {tRow.deduction_reason}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                '—'
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 text-right font-mono font-black text-slate-900 dark:text-teal-300">
                                                            {formatMoney(tRow.running_balance, locale)}
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* REPORT VIEW 2: CLAIMS PERFORMANCE SUMMARY */}
            {activeReport === 'summary' && (
                <div className="space-y-4">
                    {summaryLoading ? (
                        <div className="space-y-3">
                            {[0, 1, 2].map((i) => (
                                <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800/50" />
                            ))}
                        </div>
                    ) : !summaryData ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-500">
                            {t('empty.noData', 'No summary data available.')}
                        </div>
                    ) : (
                        <>
                            {/* Summary Metrics Cards */}
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                                    <span className="text-[11px] font-bold text-slate-500">{t('reports.totalBilledClaims', 'Total Claims Billed')}</span>
                                    <p className="mt-2 text-xl font-black text-slate-900 dark:text-white">
                                        {formatMoney(summaryData.summary.total_expected_amount, locale)}
                                    </p>
                                    <p className="mt-1 text-xs text-slate-400">
                                        {formatNum(summaryData.summary.total_claims, locale)} {t('reports.claimsIssued', 'claims issued')}
                                    </p>
                                </div>

                                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 shadow-xs dark:border-emerald-900/50 dark:bg-emerald-950/20">
                                    <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                                        {t('reports.totalCollected', 'Total Remitted & Collected')}
                                    </span>
                                    <p className="mt-2 text-xl font-black text-emerald-900 dark:text-emerald-200">
                                        {formatMoney(summaryData.summary.total_received_amount, locale)}
                                    </p>
                                    <div className="mt-1 flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                        <CheckCircle2 size={13} />
                                        <span>{summaryData.summary.collection_rate_percentage}% {t('reports.collectionRate', 'Collection Rate')}</span>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4 shadow-xs dark:border-amber-900/50 dark:bg-amber-950/20">
                                    <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300">
                                        {t('reports.totalDeductions', 'Contractual Deductions')}
                                    </span>
                                    <p className="mt-2 text-xl font-black text-amber-900 dark:text-amber-200">
                                        {formatMoney(summaryData.summary.total_deduction_amount, locale)}
                                    </p>
                                    <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                                        {summaryData.summary.deduction_rate_percentage}% {t('reports.ofBilled', 'of billed total')}
                                    </p>
                                </div>

                                <div className="rounded-2xl border border-rose-100 bg-rose-50/50 p-4 shadow-xs dark:border-rose-900/50 dark:bg-rose-950/20">
                                    <span className="text-[11px] font-bold text-rose-800 dark:text-rose-300">
                                        {t('reports.outstandingBalance', 'Outstanding Receivables')}
                                    </span>
                                    <p className="mt-2 text-xl font-black text-rose-950 dark:text-rose-100">
                                        {formatMoney(summaryData.summary.total_outstanding_amount, locale)}
                                    </p>
                                    <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                                        {summaryData.summary.counts_by_status.rejected} {t('statuses.Rejected', 'rejected')} | {summaryData.summary.counts_by_status.submitted} {t('statuses.Submitted', 'submitted')}
                                    </p>
                                </div>
                            </div>

                            {/* Providers Breakdown Table */}
                            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
                                <div className="border-b border-slate-100 p-4 dark:border-slate-800">
                                    <h3 className="text-sm font-black text-slate-900 dark:text-white">
                                        {t('reports.performanceByProvider', 'Performance Breakdown by Insurance Company (الأداء حسب جهة التأمين)')}
                                    </h3>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs">
                                        <thead className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-bold text-slate-500 dark:border-slate-800 dark:bg-slate-950/50">
                                            <tr>
                                                <th className="px-4 py-3">{t('fields.provider', 'Provider Name')}</th>
                                                <th className="px-4 py-3 text-center">{t('reports.claimsCount', 'Claims')}</th>
                                                <th className="px-4 py-3 text-right">{t('table.expected', 'Expected (EGP)')}</th>
                                                <th className="px-4 py-3 text-right">{t('table.received', 'Received (EGP)')}</th>
                                                <th className="px-4 py-3 text-right">{t('table.deduction', 'Deductions (EGP)')}</th>
                                                <th className="px-4 py-3 text-right">{t('table.outstanding', 'Outstanding (EGP)')}</th>
                                                <th className="px-4 py-3 text-center">{t('reports.collectionRate', 'Rate (%)')}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                                            {summaryData.by_provider.map((prov) => (
                                                <tr key={prov.provider_id} className="transition hover:bg-slate-50/60 dark:hover:bg-slate-850/50">
                                                    <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">
                                                        {prov.provider_name}
                                                        {prov.payer_code && <span className="ml-1 text-[10px] text-slate-400 font-mono">({prov.payer_code})</span>}
                                                    </td>
                                                    <td className="px-4 py-3 text-center font-bold">{prov.claims_count}</td>
                                                    <td className="px-4 py-3 text-right font-bold">{formatMoney(prov.expected_amount, locale)}</td>
                                                    <td className="px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                                                        {formatMoney(prov.received_amount, locale)}
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-amber-600 dark:text-amber-400">
                                                        {formatMoney(prov.deduction_amount, locale)}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-bold text-rose-600 dark:text-rose-400">
                                                        {formatMoney(prov.outstanding_amount, locale)}
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span
                                                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-black ${
                                                                prov.collection_rate >= 80
                                                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                                                    : prov.collection_rate >= 50
                                                                    ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                                                                    : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                                                            }`}
                                                        >
                                                            {prov.collection_rate}%
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Top Rejection and Deduction Reasons */}
                            <div className="grid gap-4 lg:grid-cols-2">
                                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                                    <h4 className="text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1.5 mb-3">
                                        <AlertCircle size={15} />
                                        <span>{t('reports.topRejections', 'Most Frequent Claim Rejection Reasons (أبرز أسباب رفض المطالبات)')}</span>
                                    </h4>
                                    {summaryData.top_rejection_reasons.length === 0 ? (
                                        <p className="text-xs text-slate-400 py-3">{t('empty.noRejections', 'No rejections in this period.')}</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {summaryData.top_rejection_reasons.map((r, i) => (
                                                <div key={i} className="flex items-center justify-between rounded-xl bg-rose-50/60 p-2.5 dark:bg-rose-950/20 text-xs">
                                                    <span className="font-semibold text-rose-900 dark:text-rose-200 truncate max-w-[70%]">{r.reason}</span>
                                                    <div className="text-right">
                                                        <span className="font-bold text-rose-700 dark:text-rose-300">{r.count} cases</span>
                                                        <span className="block text-[10px] text-slate-400">{formatMoney(r.amount, locale)}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                                    <h4 className="text-xs font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5 mb-3">
                                        <ShieldAlert size={15} />
                                        <span>{t('reports.topDeductions', 'Frequent Contractual Deductions (أبرز بنود الاستقطاعات التعاقدية)')}</span>
                                    </h4>
                                    {summaryData.top_deduction_reasons.length === 0 ? (
                                        <p className="text-xs text-slate-400 py-3">{t('empty.noDeductions', 'No deductions recorded in this period.')}</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {summaryData.top_deduction_reasons.map((d, i) => (
                                                <div key={i} className="flex items-center justify-between rounded-xl bg-amber-50/60 p-2.5 dark:bg-amber-950/20 text-xs">
                                                    <span className="font-semibold text-amber-900 dark:text-amber-200 truncate max-w-[70%]">{d.reason}</span>
                                                    <div className="text-right">
                                                        <span className="font-bold text-amber-700 dark:text-amber-300">{d.count} cases</span>
                                                        <span className="block text-[10px] text-slate-400">{formatMoney(d.amount, locale)}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* REPORT VIEW 3: RECEIVABLES AGING */}
            {activeReport === 'aging' && (
                <div className="space-y-4">
                    {agingLoading ? (
                        <div className="space-y-3">
                            {[0, 1, 2].map((i) => (
                                <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800/50" />
                            ))}
                        </div>
                    ) : !agingData ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-500">
                            {t('empty.noData', 'No aging data available.')}
                        </div>
                    ) : (
                        <>
                            {/* Summary Aging Buckets */}
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                                    <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300">0 - 30 {t('reports.days', 'Days (أيام)')}</span>
                                    <p className="mt-2 text-lg font-black text-emerald-950 dark:text-emerald-100">
                                        {formatMoney(agingData.summary.bucket_0_30, locale)}
                                    </p>
                                    <span className="text-[10px] text-emerald-600 font-semibold">{t('reports.currentDebt', 'Current / Recent')}</span>
                                </div>

                                <div className="rounded-2xl border border-cyan-100 bg-cyan-50/60 p-4 dark:border-cyan-900/50 dark:bg-cyan-950/20">
                                    <span className="text-[11px] font-bold text-cyan-800 dark:text-cyan-300">31 - 60 {t('reports.days', 'Days (أيام)')}</span>
                                    <p className="mt-2 text-lg font-black text-cyan-950 dark:text-cyan-100">
                                        {formatMoney(agingData.summary.bucket_31_60, locale)}
                                    </p>
                                    <span className="text-[10px] text-cyan-600 font-semibold">{t('reports.moderateFollowup', 'Follow-up Due')}</span>
                                </div>

                                <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
                                    <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300">61 - 90 {t('reports.days', 'Days (أيام)')}</span>
                                    <p className="mt-2 text-lg font-black text-amber-950 dark:text-amber-100">
                                        {formatMoney(agingData.summary.bucket_61_90, locale)}
                                    </p>
                                    <span className="text-[10px] text-amber-600 font-semibold">{t('reports.delayedDebt', 'Delayed Debt')}</span>
                                </div>

                                <div className="rounded-2xl border border-rose-100 bg-rose-50/60 p-4 dark:border-rose-900/50 dark:bg-rose-950/20">
                                    <span className="text-[11px] font-bold text-rose-800 dark:text-rose-300">90+ {t('reports.days', 'Days (أكثر من 90 يوم)')}</span>
                                    <p className="mt-2 text-lg font-black text-rose-950 dark:text-rose-100">
                                        {formatMoney(agingData.summary.bucket_90_plus, locale)}
                                    </p>
                                    <span className="text-[10px] text-rose-600 font-semibold">{t('reports.criticalOverdue', 'Critical Overdue')}</span>
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                                    <span className="text-[11px] font-black text-slate-700 dark:text-slate-300">{t('reports.grandTotal', 'Grand Total Due')}</span>
                                    <p className="mt-2 text-xl font-black text-slate-950 dark:text-white">
                                        {formatMoney(agingData.summary.grand_total_outstanding, locale)}
                                    </p>
                                    <span className="text-[10px] text-slate-400">
                                        {agingData.summary.providers_with_debt} {t('reports.debtorProviders', 'companies with balances')}
                                    </span>
                                </div>
                            </div>

                            {/* Providers Aging Breakdown Table */}
                            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs">
                                        <thead className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-bold text-slate-500 dark:border-slate-800 dark:bg-slate-950/50">
                                            <tr>
                                                <th className="px-4 py-3">{t('fields.provider', 'Provider Name')}</th>
                                                <th className="px-4 py-3 text-center">{t('reports.activeClaims', 'Active Claims')}</th>
                                                <th className="px-4 py-3 text-right">{t('reports.bucket0_30', '0-30 Days')}</th>
                                                <th className="px-4 py-3 text-right">{t('reports.bucket31_60', '31-60 Days')}</th>
                                                <th className="px-4 py-3 text-right">{t('reports.bucket61_90', '61-90 Days')}</th>
                                                <th className="px-4 py-3 text-right text-rose-600">{t('reports.bucket90Plus', '90+ Days')}</th>
                                                <th className="px-4 py-3 text-right font-black">{t('table.total', 'Total Outstanding')}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                                            {agingData.providers.map((p) => (
                                                <tr key={p.provider_id} className="transition hover:bg-slate-50/60 dark:hover:bg-slate-850/50">
                                                    <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">
                                                        {p.provider_name}
                                                        {p.payer_code && <span className="ml-1 text-[10px] text-slate-400 font-mono">({p.payer_code})</span>}
                                                    </td>
                                                    <td className="px-4 py-3 text-center font-bold">{p.active_claims_count}</td>
                                                    <td className="px-4 py-3 text-right text-emerald-700 dark:text-emerald-300">{formatMoney(p.bucket_0_30, locale)}</td>
                                                    <td className="px-4 py-3 text-right text-cyan-700 dark:text-cyan-300">{formatMoney(p.bucket_31_60, locale)}</td>
                                                    <td className="px-4 py-3 text-right text-amber-700 dark:text-amber-300">{formatMoney(p.bucket_61_90, locale)}</td>
                                                    <td className="px-4 py-3 text-right font-bold text-rose-600 dark:text-rose-400">
                                                        {formatMoney(p.bucket_90_plus, locale)}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-black text-slate-900 dark:text-teal-200">
                                                        {formatMoney(p.total_outstanding, locale)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* REPORT VIEW 4: CONTRACTS PERFORMANCE */}
            {activeReport === 'contracts' && (
                <div className="space-y-4">
                    {contractsLoading ? (
                        <div className="space-y-3">
                            {[0, 1, 2].map((i) => (
                                <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800/50" />
                            ))}
                        </div>
                    ) : !contractsData ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-500">
                            {t('empty.noData', 'No contracts performance data available.')}
                        </div>
                    ) : (
                        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
                            <div className="border-b border-slate-100 p-4 dark:border-slate-800">
                                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                                    {t('reports.contractsAnalysis', 'Contracts Financial & Referral Performance (تحليل إنتاجية العقود والجهات)')}
                                </h3>
                                <p className="mt-0.5 text-xs text-slate-500">
                                    {contractsData.total_contracts} {t('reports.contractsFound', 'active & configured contracts')}
                                </p>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-bold text-slate-500 dark:border-slate-800 dark:bg-slate-950/50">
                                        <tr>
                                            <th className="px-4 py-3">{t('fields.contractNumber', 'Contract #')}</th>
                                            <th className="px-4 py-3">{t('fields.entityName', 'Entity / Payer')}</th>
                                            <th className="px-4 py-3">{t('fields.entityType', 'Type')}</th>
                                            <th className="px-4 py-3 text-center">{t('reports.patientsCount', 'Patients')}</th>
                                            <th className="px-4 py-3 text-center">{t('reports.invoicesCount', 'Invoices')}</th>
                                            <th className="px-4 py-3 text-right">{t('reports.grossBilled', 'Gross Billed (EGP)')}</th>
                                            <th className="px-4 py-3 text-right">{t('reports.insuranceCovered', 'Ins. Covered (EGP)')}</th>
                                            <th className="px-4 py-3 text-right">{t('reports.patientCopay', 'Copay (EGP)')}</th>
                                            <th className="px-4 py-3 text-right">{t('reports.collected', 'Collected (EGP)')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                                        {contractsData.contracts.map((c) => (
                                            <tr key={c.contract_id} className="transition hover:bg-slate-50/60 dark:hover:bg-slate-850/50">
                                                <td className="px-4 py-3 font-mono font-bold text-slate-700 dark:text-slate-300">{c.contract_number}</td>
                                                <td className="px-4 py-3">
                                                    <div className="font-bold text-slate-900 dark:text-white">{c.entity_name}</div>
                                                    <div className="text-[10px] text-slate-400">{c.provider_name}</div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                                        {c.entity_type}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center font-bold text-slate-800 dark:text-slate-200">{c.unique_patients}</td>
                                                <td className="px-4 py-3 text-center font-bold text-slate-800 dark:text-slate-200">{c.invoices_count}</td>
                                                <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white">
                                                    {formatMoney(c.total_gross_billed, locale)}
                                                </td>
                                                <td className="px-4 py-3 text-right font-bold text-teal-600 dark:text-teal-400">
                                                    {formatMoney(c.total_insurance_covered, locale)}
                                                </td>
                                                <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">
                                                    {formatMoney(c.total_patient_copay, locale)}
                                                </td>
                                                <td className="px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                                                    {formatMoney(c.claims_collected, locale)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}
