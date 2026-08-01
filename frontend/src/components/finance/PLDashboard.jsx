import { useState } from 'react';
import { 
    AlertCircle, 
    Calculator, 
    CircleDollarSign, 
    Landmark, 
    TrendingDown, 
    TrendingUp 
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGetProfitAndLossQuery, useGetTaxSummaryQuery } from '../../store/api';
import { formatFinancialCurrency, toFinancialDateInput } from '../../utils/financialFormat';

const PLDashboard = () => {
    const { t, i18n } = useTranslation('workspace');
    const money = (value) => formatFinancialCurrency(value, i18n.language);
    
    const [dateRange, setDateRange] = useState({ 
        startDate: toFinancialDateInput(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), 
        endDate: toFinancialDateInput() 
    });

    const plQuery = useGetProfitAndLossQuery(dateRange);
    const taxQuery = useGetTaxSummaryQuery(dateRange);

    const isLoading = plQuery.isLoading || taxQuery.isLoading;
    const isError = plQuery.isError || taxQuery.isError;

    const pl = plQuery.data;
    const tax = taxQuery.data;
    const grossRevenue = Number(pl?.gross_revenue || 0);
    const expenses = Number(pl?.total_expenses || 0);
    const commissions = Number(pl?.commission_paid || 0);
    const netProfit = Number(pl?.net_profit || 0);
    const margin = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;
    const taxCollected = Number(tax?.tax_collected || 0);
    const taxPaid = Number(tax?.tax_paid || 0);
    const netTax = Number(tax?.net_tax_liability || 0);

    if (isError) {
        return (
            <div role="alert" className="flex flex-col items-center justify-center rounded-3xl border border-rose-200/60 bg-rose-50/50 p-12 text-center shadow-sm backdrop-blur-sm dark:border-rose-900/50 dark:bg-rose-900/10">
                <AlertCircle size={32} className="mb-3 text-rose-500" />
                <h3 className="text-lg font-black text-rose-700 dark:text-rose-400">{t('finance.pl.error', { defaultValue: 'Failed to load financial data' })}</h3>
                <p className="mt-1 text-sm text-rose-600/70 dark:text-rose-400/70">Please check your connection and try again.</p>
            </div>
        );
    }

    return (
        <div className="overflow-hidden rounded-3xl border border-slate-200/60 bg-white/70 shadow-xl shadow-slate-200/40 backdrop-blur-xl transition-all dark:border-white/10 dark:bg-[#07111f]/70 dark:shadow-none">
            <div className="flex flex-col gap-5 border-b border-slate-100/80 bg-slate-50/50 p-5 dark:border-white/5 dark:bg-white/5 sm:p-6 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex items-start gap-4">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-lg shadow-emerald-500/30">
                        <Calculator size={22} />
                    </span>
                    <div className="pt-0.5">
                        <h2 className="text-lg font-black tracking-tight text-slate-900 dark:text-white sm:text-xl">
                            {t('finance.pl.title')}
                        </h2>
                        <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">
                            {t('finance.pl.description')}
                        </p>
                    </div>
                </div>
                
                <div className="grid gap-3 rounded-2xl border border-slate-200/60 bg-white/80 p-3 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-slate-900/50 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                    <DateInput 
                        label={t('finance.pl.startDate')} 
                        value={dateRange.startDate} 
                        max={dateRange.endDate} 
                        onChange={(value) => setDateRange((current) => ({ ...current, startDate: value }))} 
                    />
                    <span className="hidden text-xs font-bold uppercase tracking-wider text-slate-400 sm:block">
                        {t('finance.pl.to')}
                    </span>
                    <DateInput 
                        label={t('finance.pl.endDate')} 
                        value={dateRange.endDate} 
                        min={dateRange.startDate} 
                        onChange={(value) => setDateRange((current) => ({ ...current, endDate: value }))} 
                    />
                </div>
            </div>

            <div className="p-5 sm:p-7">
                {isLoading ? (
                    <DashboardSkeleton />
                ) : (
                    <div className="animate-fade-in">
                        <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-4">
                            <FinanceCard 
                                icon={TrendingUp} 
                                label={t('finance.pl.grossRevenue')} 
                                value={money(grossRevenue)} 
                                note={t('finance.pl.grossRevenueNote')} 
                                tone="emerald" 
                            />
                            <FinanceCard 
                                icon={TrendingDown} 
                                label={t('finance.pl.operatingExpenses')} 
                                value={money(expenses)} 
                                note={t('finance.pl.operatingExpensesNote')} 
                                tone="rose" 
                            />
                            <FinanceCard 
                                icon={CircleDollarSign} 
                                label={t('finance.pl.commissionsPaid')} 
                                value={money(commissions)} 
                                note={t('finance.pl.commissionsPaidNote')} 
                                tone="cyan" 
                            />
                            <FinanceCard 
                                icon={Landmark} 
                                label={t('finance.pl.netProfit')} 
                                value={money(netProfit)} 
                                note={t('finance.pl.margin', { value: margin.toFixed(1) })} 
                                tone={netProfit >= 0 ? 'dark' : 'negative'} 
                            />
                        </div>

                        <section 
                            className="mt-8 rounded-3xl border border-slate-200/60 bg-slate-50/80 p-5 shadow-sm dark:border-white/5 dark:bg-white/[0.02] sm:p-7" 
                            aria-labelledby="tax-summary-heading"
                        >
                            <div className="mb-6 flex items-center gap-3">
                                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-400">
                                    <Landmark size={16} />
                                </span>
                                <h3 id="tax-summary-heading" className="text-base font-black tracking-tight text-slate-900 dark:text-white">
                                    {t('finance.pl.taxSummary')}
                                </h3>
                            </div>
                            <dl className="grid gap-6 md:grid-cols-3">
                                <TaxItem 
                                    label={t('finance.pl.taxCollected')} 
                                    value={money(taxCollected)} 
                                />
                                <TaxItem 
                                    label={t('finance.pl.taxPaid')} 
                                    value={money(taxPaid)} 
                                />
                                <TaxItem 
                                    label={t('finance.pl.netTax')} 
                                    value={money(netTax)} 
                                    numericValue={netTax} 
                                    emphasized 
                                    note={netTax > 0 ? t('finance.pl.taxPayable') : t('finance.pl.taxCredit')} 
                                />
                            </dl>
                        </section>
                    </div>
                )}
            </div>
        </div>
    );
};

const DashboardSkeleton = () => (
    <div className="animate-pulse">
        <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
                <div key={i} className="min-h-[140px] rounded-2xl bg-slate-100 dark:bg-white/5" />
            ))}
        </div>
        <div className="mt-8 min-h-[180px] rounded-3xl bg-slate-50 dark:bg-white/[0.02]" />
    </div>
);

const DateInput = ({ label, value, min, max, onChange }) => (
    <label className="flex-1">
        <span className="sr-only">{label}</span>
        <input 
            type="date" 
            aria-label={label} 
            value={value} 
            min={min} 
            max={max} 
            onChange={(event) => onChange(event.target.value)} 
            className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-sm font-bold text-slate-700 outline-none transition-colors focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100 dark:border-white/10 dark:bg-slate-900/50 dark:text-slate-200 dark:focus:border-cyan-500 dark:focus:bg-slate-900 dark:focus:ring-cyan-500/20" 
        />
    </label>
);

const FinanceCard = ({ icon: Icon, label, value, note, tone }) => {
    const styles = {
        emerald: 'border-emerald-200/60 bg-emerald-50/80 text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
        rose: 'border-rose-200/60 bg-rose-50/80 text-rose-900 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300',
        cyan: 'border-cyan-200/60 bg-cyan-50/80 text-cyan-900 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300',
        dark: 'border-slate-800 bg-slate-900 text-white shadow-xl shadow-slate-900/20 dark:border-white/10 dark:bg-white/10 dark:shadow-none',
        negative: 'border-rose-700 bg-gradient-to-br from-rose-600 to-rose-700 text-white shadow-xl shadow-rose-900/20',
    };

    return (
        <article className={`group min-w-0 rounded-2xl border p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${styles[tone]}`}>
            <div className="flex items-start justify-between gap-3">
                <p className="text-[10px] font-black uppercase tracking-[.15em] opacity-80">
                    {label}
                </p>
                <div className="rounded-lg bg-white/20 p-1.5 backdrop-blur-sm transition-transform duration-300 group-hover:scale-110 group-hover:bg-white/30">
                    <Icon size={16} className="shrink-0 opacity-90" />
                </div>
            </div>
            <p className="mt-6 break-all font-mono text-2xl font-black tracking-tight sm:text-3xl">
                {value}
            </p>
            <p className="mt-2 text-[11px] font-bold opacity-70">
                {note}
            </p>
        </article>
    );
};

const TaxItem = ({ label, value, numericValue = 0, emphasized, note }) => (
    <div className={emphasized ? 'border-t border-slate-200 pt-6 dark:border-white/10 md:border-s md:border-t-0 md:ps-8 md:pt-0' : ''}>
        <dt className="text-[10px] font-black uppercase tracking-[.15em] text-slate-500 dark:text-slate-400">
            {label}
        </dt>
        <dd className={`mt-2 break-all font-mono font-black tracking-tight ${
            emphasized 
                ? `text-3xl ${numericValue > 0 ? 'text-amber-600 dark:text-amber-500' : 'text-emerald-600 dark:text-emerald-400'}` 
                : 'text-2xl text-slate-900 dark:text-white'
        }`}>
            {value}
        </dd>
        {note && (
            <p className="mt-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                {note}
            </p>
        )}
    </div>
);

export default PLDashboard;
