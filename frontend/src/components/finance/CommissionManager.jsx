import { useMemo, useState } from 'react';
import { CheckCircle, CircleDollarSign, UserRound, WalletCards } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useGetDoctorCommissionsQuery, usePayCommissionMutation } from '../../store/api';
import ConfirmDialog from '../ui/ConfirmDialog';
import { formatFinancialCurrency } from '../../utils/financialFormat';

const CommissionManager = () => {
    const { t, i18n } = useTranslation('workspace');
    const money = (value) => formatFinancialCurrency(value, i18n.language);
    const { data: commissions = [], isLoading, isError } = useGetDoctorCommissionsQuery();
    const [payCommission, { isLoading: isPaying }] = usePayCommissionMutation();
    const [selectedDoctor, setSelectedDoctor] = useState(null);

    const totals = useMemo(() => commissions.reduce((sum, item) => ({
        earned: sum.earned + Number(item.commission_est || 0),
        paid: sum.paid + Number(item.commission_paid || 0),
        pending: sum.pending + Number(item.commission_pending || 0)
    }), { earned: 0, paid: 0, pending: 0 }), [commissions]);

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
        <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 shadow-xl shadow-slate-200/30 backdrop-blur-xl dark:border-white/10 dark:bg-[#07111f]/80 dark:shadow-none">
            {/* Header */}
            <div className="flex items-start gap-4 border-b border-slate-100/80 bg-slate-50/50 p-5 dark:border-white/5 dark:bg-white/5 sm:p-6">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 ring-1 ring-amber-200 shadow-md dark:bg-amber-500/20 dark:text-amber-300 dark:ring-amber-500/30">
                    <CircleDollarSign size={22} aria-hidden="true" />
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

            {/* Metrics */}
            <div className="grid grid-cols-1 gap-4 border-b border-slate-100/80 p-5 dark:border-white/5 min-[480px]:grid-cols-3">
                <CommissionMetric label={t('finance.commissions.totalEarned')} value={money(totals.earned)} />
                <CommissionMetric label={t('finance.commissions.paid')} value={money(totals.paid)} tone="emerald" />
                <CommissionMetric label={t('finance.commissions.pending')} value={money(totals.pending)} tone="amber" />
            </div>

            {/* Table or Cards */}
            {isLoading ? (
                <div className="animate-pulse p-12 text-center text-sm font-bold text-slate-400">{t('finance.commissions.loading')}</div>
            ) : isError ? (
                <div role="alert" className="p-12 text-center text-sm font-bold text-rose-600 dark:text-rose-400">{t('finance.commissions.error')}</div>
            ) : commissions.length === 0 ? (
                <div className="p-12 text-center">
                    <UserRound className="mx-auto text-slate-300 dark:text-slate-600" size={40} />
                    <p className="mt-3 font-black text-slate-700 dark:text-slate-300">{t('finance.commissions.emptyTitle')}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('finance.commissions.emptyDescription')}</p>
                </div>
            ) : (
                <>
                    <div className="divide-y divide-slate-100/80 dark:divide-white/5 md:hidden">
                        {commissions.map((commission, index) => (
                            <CommissionCard
                                key={commission.doctor_id || index}
                                commission={commission}
                                onPay={() => setSelectedDoctor({ ...commission, idempotencyKey: crypto.randomUUID() })}
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
                                        <th key={label} scope="col" className="p-4 text-start text-xs font-black uppercase tracking-wider">{label}</th>
                                    ))}
                                    <th scope="col" className="p-4 text-end text-xs font-black uppercase tracking-wider">{t('finance.common.action')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100/80 dark:divide-white/5">
                                {commissions.map((commission, index) => (
                                    <tr key={commission.doctor_id || index} className="transition-colors hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
                                        <td className="p-4 font-bold text-slate-900 dark:text-white">{commission.doctor_name || t('finance.commissions.unknownDoctor')}</td>
                                        <td className="p-4 font-semibold text-slate-600 dark:text-slate-400">{commission.total_exams || 0}</td>
                                        <td className="p-4 font-mono font-semibold text-slate-600 dark:text-slate-400">{money(commission.total_exam_value)}</td>
                                        <td className="p-4 font-mono font-bold text-slate-900 dark:text-white">{money(commission.commission_est)}</td>
                                        <td className="p-4 font-mono font-bold text-emerald-600 dark:text-emerald-400">{money(commission.commission_paid)}</td>
                                        <td className="p-4 font-mono font-bold text-amber-600 dark:text-amber-400">{money(commission.commission_pending)}</td>
                                        <td className="p-4 text-end">
                                            <PayoutAction
                                                commission={commission}
                                                onPay={() => setSelectedDoctor({ ...commission, idempotencyKey: crypto.randomUUID() })}
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
    return Number(commission.commission_pending) > 0 ? (
        <button
            type="button"
            onClick={onPay}
            className={`rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white shadow-md transition hover:bg-cyan-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 ${full ? 'w-full' : ''}`}
        >
            {t('finance.commissions.payPending')}
        </button>
    ) : (
        <span className={`inline-flex items-center justify-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300 ${full ? 'w-full' : ''}`}>
            <CheckCircle size={13} aria-hidden="true" />
            {t('finance.commissions.settled')}
        </span>
    );
};

export default CommissionManager;
