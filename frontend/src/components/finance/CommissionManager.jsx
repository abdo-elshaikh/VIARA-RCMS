import { useMemo, useState } from 'react';
import { 
    CheckCircle, 
    CircleDollarSign, 
    Filter, 
    Search, 
    UserRound, 
    WalletCards, 
    Zap 
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { generateUUID } from '../../utils/uuid';
import toast from 'react-hot-toast';
import { useGetDoctorCommissionsQuery, usePayCommissionMutation } from '../../store/api';
import ConfirmDialog from '../ui/ConfirmDialog';
import { formatFinancialCurrency } from '../../utils/financialFormat';

const CommissionManager = () => {
    const { t, i18n } = useTranslation('workspace');
    const isAr = i18n.language?.startsWith('ar');
    const money = (value) => formatFinancialCurrency(value, i18n.language);
    const { data: commissions = [], isLoading, isError } = useGetDoctorCommissionsQuery();
    const [payCommission, { isLoading: isPaying }] = usePayCommissionMutation();
    
    const [selectedDoctor, setSelectedDoctor] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'pending' | 'settled'

    const totals = useMemo(() => commissions.reduce((sum, item) => ({
        earned: sum.earned + Number(item.commission_est || 0),
        paid: sum.paid + Number(item.commission_paid || 0),
        pending: sum.pending + Number(item.commission_pending || 0),
        exams: sum.exams + Number(item.total_exams || 0)
    }), { earned: 0, paid: 0, pending: 0, exams: 0 }), [commissions]);

    const filteredCommissions = useMemo(() => {
        return commissions.filter(item => {
            const pending = Number(item.commission_pending || 0);
            const matchesStatus = statusFilter === 'all' 
                ? true 
                : statusFilter === 'pending' 
                    ? pending > 0 
                    : pending === 0;
            const query = searchQuery.trim().toLowerCase();
            const matchesSearch = !query || (item.doctor_name || '').toLowerCase().includes(query);
            return matchesStatus && matchesSearch;
        });
    }, [commissions, statusFilter, searchQuery]);

    const handlePay = async () => {
        if (!selectedDoctor) return;
        try {
            await payCommission({
                doctorId: selectedDoctor.doctor_id,
                amount: parseFloat(selectedDoctor.commission_pending),
                transactionRef: `Payout-${new Date().getTime()}`,
                idempotencyKey: selectedDoctor.idempotencyKey
            }).unwrap();
            toast.success(t('finance.commissions.success'));
            setSelectedDoctor(null);
        } catch (error) {
            toast.error(error?.data?.message || t('finance.commissions.paymentError'));
        }
    };

    return (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
            {/* Header */}
            <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6 dark:border-slate-800 dark:bg-slate-950/30">
                <div className="flex items-start gap-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300">
                        <CircleDollarSign size={20} aria-hidden="true" />
                    </span>
                    <div>
                        <h2 className="text-lg font-black tracking-tight text-slate-900 dark:text-white sm:text-xl">
                            {t('finance.commissions.title')}
                        </h2>
                        <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400 sm:text-sm">
                            {t('finance.commissions.description')}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <span className="rounded-xl bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                        {isAr ? 'إجمالي الأطباء المحولين:' : 'Referring Doctors:'} <strong>{commissions.length}</strong>
                    </span>
                </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-1 gap-4 border-b border-slate-100/80 p-5 dark:border-white/5 sm:grid-cols-2 lg:grid-cols-4">
                <CommissionMetric label={isAr ? 'عدد الحالات المحولة' : 'Referred Cases'} value={totals.exams.toLocaleString(i18n.language)} />
                <CommissionMetric label={t('finance.commissions.totalEarned')} value={money(totals.earned)} />
                <CommissionMetric label={t('finance.commissions.paid')} value={money(totals.paid)} tone="emerald" />
                <CommissionMetric label={t('finance.commissions.pending')} value={money(totals.pending)} tone="amber" />
            </div>

            {/* Filters & Search */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100/80 p-4 dark:border-slate-800">
                <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                    <button
                        type="button"
                        onClick={() => setStatusFilter('all')}
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                            statusFilter === 'all' ? 'bg-amber-600 text-white shadow font-black' : 'text-slate-600 dark:text-slate-300'
                        }`}
                    >
                        {isAr ? 'كافة الأطباء' : 'All Doctors'} ({commissions.length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setStatusFilter('pending')}
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                            statusFilter === 'pending' ? 'bg-amber-600 text-white shadow font-black' : 'text-slate-600 dark:text-slate-300'
                        }`}
                    >
                        {isAr ? 'مستحقات معلقة' : 'Pending Payout'} ({commissions.filter(c => Number(c.commission_pending) > 0).length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setStatusFilter('settled')}
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                            statusFilter === 'settled' ? 'bg-amber-600 text-white shadow font-black' : 'text-slate-600 dark:text-slate-300'
                        }`}
                    >
                        {isAr ? 'مسددة بالكامل' : 'Settled'}
                    </button>
                </div>

                <div className="relative w-full sm:w-64">
                    <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={isAr ? 'بحث باسم الطبيب...' : 'Search doctor name...'}
                        className="h-9 w-full rounded-xl border border-slate-200 bg-white ps-8 pe-3 text-xs font-bold text-slate-700 outline-none focus:border-amber-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    />
                </div>
            </div>

            {/* Table or Cards */}
            {isLoading ? (
                <div className="animate-pulse p-12 text-center text-sm font-bold text-slate-400">{t('finance.commissions.loading')}</div>
            ) : isError ? (
                <div role="alert" className="p-12 text-center text-sm font-bold text-rose-600 dark:text-rose-400">{t('finance.commissions.error')}</div>
            ) : filteredCommissions.length === 0 ? (
                <div className="p-12 text-center">
                    <UserRound className="mx-auto text-slate-300 dark:text-slate-600" size={40} />
                    <p className="mt-3 font-black text-slate-700 dark:text-slate-300">
                        {searchQuery ? (isAr ? 'لا يوجد أطباء يطابقون البحث' : 'No doctors match your query') : t('finance.commissions.emptyTitle')}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('finance.commissions.emptyDescription')}</p>
                </div>
            ) : (
                <>
                    <div className="divide-y divide-slate-100/80 dark:divide-white/5 md:hidden">
                        {filteredCommissions.map((commission, index) => (
                            <CommissionCard
                                key={commission.doctor_id || index}
                                commission={commission}
                                onPay={() => setSelectedDoctor({ ...commission, idempotencyKey: generateUUID() })}
                            />
                        ))}
                    </div>

                    <div className="hidden overflow-x-auto md:block">
                        <table className="w-full min-w-[850px] text-start text-sm">
                            <thead className="border-b border-slate-200/80 bg-slate-50/70 text-slate-500 dark:border-white/5 dark:bg-white/5 dark:text-slate-400">
                                <tr>
                                    {[
                                        t('finance.commissions.doctor'),
                                        t('finance.commissions.totalExams'),
                                        t('finance.commissions.examRevenue'),
                                        t('finance.commissions.totalEarned'),
                                        t('finance.commissions.paid'),
                                        t('finance.commissions.pending')
                                    ].map((label) => (
                                        <th key={label} scope="col" className="p-4 text-start text-xs font-black uppercase tracking-wider whitespace-nowrap">{label}</th>
                                    ))}
                                    <th scope="col" className="p-4 text-end text-xs font-black uppercase tracking-wider whitespace-nowrap">{t('finance.common.action')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100/80 dark:divide-white/5">
                                {filteredCommissions.map((commission, index) => (
                                    <tr key={commission.doctor_id || index} className="transition-colors hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
                                        <td className="p-4 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                                            <div className="flex items-center gap-2">
                                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800 text-xs font-black dark:bg-amber-500/20 dark:text-amber-300">
                                                    Dr
                                                </span>
                                                <span className="truncate">{commission.doctor_name || t('finance.commissions.unknownDoctor')}</span>
                                            </div>
                                        </td>
                                        <td className="p-4 font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap">{commission.total_exams || 0}</td>
                                        <td className="p-4 font-mono font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap">{money(commission.total_exam_value)}</td>
                                        <td className="p-4 font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">{money(commission.commission_est)}</td>
                                        <td className="p-4 font-mono font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">{money(commission.commission_paid)}</td>
                                        <td className="p-4 font-mono font-bold text-amber-600 dark:text-amber-400 whitespace-nowrap">
                                            <span className={`inline-flex rounded-lg px-2.5 py-1 ${Number(commission.commission_pending) > 0 ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300' : 'text-slate-500'}`}>
                                                {money(commission.commission_pending)}
                                            </span>
                                        </td>
                                        <td className="p-4 text-end whitespace-nowrap">
                                            <PayoutAction
                                                commission={commission}
                                                onPay={() => setSelectedDoctor({ ...commission, idempotencyKey: generateUUID() })}
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            <ConfirmDialog
                isOpen={Boolean(selectedDoctor)}
                onClose={() => setSelectedDoctor(null)}
                onConfirm={handlePay}
                title={t('finance.commissions.dialogTitle')}
                message={t('finance.commissions.dialogMessage', { amount: money(selectedDoctor?.commission_pending), doctor: selectedDoctor?.doctor_name || t('finance.commissions.thisDoctor') })}
                confirmLabel={isPaying ? t('finance.commissions.processing') : t('finance.commissions.confirm')}
                cancelLabel={t('finance.common.cancel')}
            />
        </div>
    );
};

const CommissionMetric = ({ label, value, tone = 'slate' }) => (
    <div className="min-w-0 rounded-2xl border border-slate-200/60 bg-slate-50/70 p-4 dark:border-white/5 dark:bg-white/[0.02]">
        <p className="truncate text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
        <p className={`mt-2 truncate text-xl font-black ${
            tone === 'emerald'
                ? 'text-emerald-700 dark:text-emerald-400'
                : tone === 'amber'
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-slate-900 dark:text-white'
        }`}>
            {value}
        </p>
    </div>
);

const CommissionCard = ({ commission, onPay }) => {
    const { t, i18n } = useTranslation('workspace');
    const money = (value) => formatFinancialCurrency(value, i18n.language);
    return (
        <article className="p-5">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate font-black text-slate-900 dark:text-white">{commission.doctor_name || t('finance.commissions.unknownDoctor')}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {t('finance.commissions.doctorSummary', { count: commission.total_exams || 0, revenue: money(commission.total_exam_value) })}
                    </p>
                </div>
                <span className="rounded-xl bg-amber-100 p-2 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
                    <WalletCards size={18} />
                </span>
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2">
                <Amount label={t('finance.commissions.earned')} value={commission.commission_est} />
                <Amount label={t('finance.commissions.paid')} value={commission.commission_paid} tone="emerald" />
                <Amount label={t('finance.commissions.pending')} value={commission.commission_pending} tone="amber" />
            </dl>
            <div className="mt-4">
                <PayoutAction commission={commission} onPay={onPay} full />
            </div>
        </article>
    );
};

const Amount = ({ label, value, tone }) => {
    const { i18n } = useTranslation('workspace');
    return (
        <div>
            <dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</dt>
            <dd className={`mt-1 truncate font-mono text-xs font-bold ${
                tone === 'emerald'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : tone === 'amber'
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-slate-800 dark:text-slate-200'
            }`}>
                {formatFinancialCurrency(value, i18n.language)}
            </dd>
        </div>
    );
};

const PayoutAction = ({ commission, onPay, full }) => {
    const { t } = useTranslation('workspace');
    const isPending = Number(commission.commission_pending || 0) > 0;
    if (!isPending) {
        return (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                <CheckCircle size={14} />
                {t('finance.commissions.fullyPaid')}
            </span>
        );
    }
    return (
        <button
            type="button"
            onClick={onPay}
            className={`inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition hover:brightness-110 ${full ? 'w-full' : ''}`}
        >
            <CircleDollarSign size={14} />
            {t('finance.commissions.payAction')}
        </button>
    );
};

export default CommissionManager;
